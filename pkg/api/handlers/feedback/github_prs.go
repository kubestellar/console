package feedback

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (h *FeedbackHandler) handlePREvent(ctx context.Context, payload map[string]interface{}) error {
	action, ok := payload["action"].(string)
	if !ok || action == "" {
		return nil
	}
	pr, ok := payload["pull_request"].(map[string]interface{})
	if !ok || pr == nil {
		return nil
	}

	prNumF, ok := pr["number"].(float64)
	if !ok {
		return fiber.NewError(fiber.StatusBadRequest, "missing or invalid PR number in webhook payload")
	}
	prNumber := int(prNumF)
	prURL, ok := pr["html_url"].(string)
	if !ok || prURL == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing PR html_url in webhook payload")
	}
	body, _ := pr["body"].(string)

	// Try to find the associated feature request
	var request *models.FeatureRequest
	var requestID uuid.UUID

	// Method 1: Check for embedded UUID (Console Request ID:** <uuid>)
	requestID = extractFeatureRequestID(body)
	if requestID != uuid.Nil {
		var err error
		request, err = h.store.GetFeatureRequest(ctx, requestID)
		if err != nil {
			slog.Error("[Webhook] error getting feature request", "requestID", requestID, "error", err)
		}
	}

	// Method 2: Check for linked issue numbers (Fixes #123, Closes #456)
	if request == nil {
		linkedIssues := extractLinkedIssueNumbers(body)
		if len(linkedIssues) > 0 {
			requests, err := h.store.GetFeatureRequestsByIssueNumbers(ctx, linkedIssues)
			if err == nil && len(requests) > 0 {
				// Match results back to PR-body order so the first linked
				// issue always wins, regardless of SQL row ordering.
				requestMap := make(map[int]*models.FeatureRequest, len(requests))
				for _, r := range requests {
					if r.GitHubIssueNumber != nil {
						requestMap[*r.GitHubIssueNumber] = r
					}
				}
				for _, issueNum := range linkedIssues {
					if r, ok := requestMap[issueNum]; ok {
						request = r
						requestID = r.ID
						slog.Info("[Webhook] PR linked to feature request via issue", "pr", prNumber, "issue", issueNum)
						break
					}
				}
			}
		}
	}

	// If we still don't have a feature request, check labels for ai-generated
	if request == nil {
		labels, ok := pr["labels"].([]interface{})
		isAIGenerated := false
		if ok {
			for _, l := range labels {
				label, ok := l.(map[string]interface{})
				if !ok {
					continue
				}
				if name, ok := label["name"].(string); ok && name == "ai-generated" {
					isAIGenerated = true
					break
				}
			}
		}
		if !isAIGenerated {
			// Not linked to any feature request and not AI-generated, ignore
			return nil
		}
		slog.Info("[Webhook] PR has ai-generated label but no linked feature request", "pr", prNumber)
		return nil
	}

	switch action {
	case "opened", "synchronize", "ready_for_review":
		// Update request with PR info and set status to fix_ready
		if err := h.store.UpdateFeatureRequestPR(ctx, requestID, prNumber, prURL); err != nil {
			slog.Error("[Webhook] failed to update PR info", "pr", prNumber, "error", err)
			// #7061: return 500 so GitHub retries the webhook delivery.
			return fiber.NewError(fiber.StatusInternalServerError, "failed to update PR info")
		}
		if err := h.store.UpdateFeatureRequestStatus(ctx, requestID, models.RequestStatusFixReady); err != nil {
			slog.Error("[Webhook] failed to update fix_ready status", "pr", prNumber, "error", err)
			// #7061: return 500 so GitHub retries the webhook delivery.
			return fiber.NewError(fiber.StatusInternalServerError, "failed to update fix_ready status")
		}
		if action == "opened" {
			h.createNotification(ctx, request.UserID, &requestID, models.NotificationTypeFixReady,
				fmt.Sprintf("PR #%d Created", prNumber),
				fmt.Sprintf("A fix for '%s' is ready for review.", request.Title),
				prURL)
		}

	case "closed":
		merged, ok := pr["merged"].(bool)
		if !ok {
			merged = false
		}
		if merged {
			if err := h.store.UpdateFeatureRequestStatus(ctx, requestID, models.RequestStatusFixComplete); err != nil {
				slog.Error("[Webhook] failed to update fix_complete status", "pr", prNumber, "error", err)
				// #7061: return 500 so GitHub retries the webhook delivery.
				return fiber.NewError(fiber.StatusInternalServerError, "failed to update fix_complete status")
			}
			h.createNotification(ctx, request.UserID, &requestID, models.NotificationTypeFixComplete,
				fmt.Sprintf("PR #%d Merged", prNumber),
				fmt.Sprintf("The fix for '%s' has been merged!", request.Title),
				prURL)
		} else {
			h.createNotification(ctx, request.UserID, &requestID, models.NotificationTypeClosed,
				fmt.Sprintf("PR #%d Closed", prNumber),
				fmt.Sprintf("The PR for '%s' was closed without merging.", request.Title),
				prURL)
		}
	}

	slog.Info("[Webhook] PR event processed", "pr", prNumber, "action", action, "requestID", requestID)
	return nil
}

// handleDeploymentStatus processes deployment status events (for Netlify previews)

func (h *FeedbackHandler) addPRComment(ctx context.Context, request *models.FeatureRequest, feedback *models.PRFeedback) {
	if request.PRNumber == nil {
		return
	}

	emoji := ""
	if feedback.FeedbackType == models.FeedbackTypePositive {
		emoji = ":+1:"
	} else {
		emoji = ":-1:"
	}

	var commentBody strings.Builder
	commentBody.WriteString(fmt.Sprintf("**User Feedback:** %s\n\n", emoji))
	if feedback.Comment != "" {
		commentBody.WriteString(fmt.Sprintf("> %s", feedback.Comment))
	}

	payload := map[string]string{"body": commentBody.String()}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		slog.Error("[Feedback] failed to marshal PR comment payload", "error", err)
		return
	}

	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d/comments",
		resolveGitHubAPIBase(), h.repoOwner, h.repoName, *request.PRNumber)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Error("[Feedback] failed to create PR comment request", "error", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	// #7059: reuse shared HTTP client for connection pooling.
	resp, err := h.httpClient.Do(req)
	if err != nil {
		slog.Error("[Feedback] failed to add PR comment", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		slog.Warn("[Feedback] GitHub API error adding PR comment", "status", resp.StatusCode, "body", string(body))
	}
}

// verifyWebhookSignature verifies GitHub webhook signature
