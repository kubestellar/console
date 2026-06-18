package feedback

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/models"
)

func (h *FeedbackHandler) handleIssueEvent(ctx context.Context, payload map[string]interface{}) error {
	action, ok := payload["action"].(string)
	if !ok || action == "" {
		return nil
	}
	issue, ok := payload["issue"].(map[string]interface{})
	if !ok || issue == nil {
		return nil
	}

	numF, ok := issue["number"].(float64)
	if !ok {
		return fiber.NewError(fiber.StatusBadRequest, "missing or invalid issue number in webhook payload")
	}
	issueNumber := int(numF)
	issueURL, ok := issue["html_url"].(string)
	if !ok || issueURL == "" {
		return fiber.NewError(fiber.StatusBadRequest, "missing issue html_url in webhook payload")
	}

	slog.Info("[Webhook] issue event", "issue", issueNumber, "action", action)

	// Handle label events — track pipeline progression
	if action == "labeled" {
		label, ok := payload["label"].(map[string]interface{})
		if !ok || label == nil {
			return nil
		}
		labelName, ok := label["name"].(string)
		if !ok || labelName == "" {
			return nil
		}

		// Special case: ai-processing-complete needs extra logic
		if labelName == "ai-processing-complete" {
			return h.handleAIProcessingComplete(ctx, issueNumber, issueURL, issue)
		}

		// Handle pipeline label transitions — only update existing DB records
		// (records created through the Console UI via CreateFeatureRequest)
		if info, ok := pipelineLabels[labelName]; ok {
			request := h.findFeatureRequest(ctx, issueNumber)
			if request == nil {
				slog.Info("[Webhook] no DB record, skipping label update", "issue", issueNumber)
				return nil
			}

			if err := h.store.UpdateFeatureRequestStatus(ctx, request.ID, info.status); err != nil {
				slog.Error("[Webhook] failed to update status", "issue", issueNumber, "error", err)
				// #7061: return 500 so GitHub retries the webhook delivery.
				return fiber.NewError(fiber.StatusInternalServerError, "failed to update feature request status")
			}
			h.createNotification(ctx,
				request.UserID,
				&request.ID,
				info.notifType,
				fmt.Sprintf("Issue #%d: %s", issueNumber, info.message),
				info.message,
				issueURL,
			)
			return nil
		}

		// Handle ai-fix-requested label — only update existing DB records
		if labelName == "ai-fix-requested" {
			request := h.findFeatureRequest(ctx, issueNumber)
			if request == nil {
				slog.Info("[Webhook] no DB record, skipping ai-fix-requested", "issue", issueNumber)
			}
			return nil
		}
	}

	// Handle issue opened — only log, don't auto-create DB records
	if action == "opened" {
		slog.Info("[Webhook] issue opened, no DB record auto-created (GitHub is source of truth)", "issue", issueNumber)
	}

	// Handle issue closed
	if action == "closed" {
		return h.handleIssueClosed(ctx, issueNumber, issueURL, issue)
	}

	return nil
}

// handleAIProcessingComplete handles when AI processing is complete
func (h *FeedbackHandler) handleAIProcessingComplete(ctx context.Context, issueNumber int, issueURL string, issue map[string]interface{}) error {
	// Find feature request by issue number
	request, err := h.store.GetFeatureRequestByIssueNumber(ctx, issueNumber)
	if err != nil || request == nil {
		slog.Info("[Webhook] feature request not found", "issue", issueNumber)
		return nil
	}

	// If there's already a PR, don't update - the PR webhook will handle it
	if request.PRNumber != nil {
		return nil
	}

	// Update status to unable to fix (needs human review)
	if err := h.store.UpdateFeatureRequestStatus(ctx, request.ID, models.RequestStatusUnableToFix); err != nil {
		slog.Error("[Webhook] failed to update unable-to-fix status", "issue", issueNumber, "error", err)
		// #7061: return 500 so GitHub retries the webhook delivery.
		return fiber.NewError(fiber.StatusInternalServerError, "failed to update feature request status")
	}

	// Get the most recent bot comment to summarize the status
	summary := h.getLatestBotComment(ctx, issueNumber, h.resolveRepoName(request.TargetRepo))
	if summary == "" {
		summary = "AI analysis complete. A human developer will review this issue."
	}

	// Store the latest comment on the request
	if err := h.store.UpdateFeatureRequestLatestComment(ctx, request.ID, summary); err != nil {
		slog.Error("[Webhook] failed to update latest comment", "issue", issueNumber, "error", err)
		// #7061: return 500 so GitHub retries the webhook delivery.
		return fiber.NewError(fiber.StatusInternalServerError, "failed to update latest comment")
	}

	// Create notification
	h.createNotification(ctx,
		request.UserID,
		&request.ID,
		models.NotificationTypeUnableToFix,
		fmt.Sprintf("Issue #%d: Needs Human Review", issueNumber),
		summary,
		issueURL,
	)

	return nil
}

// handleIssueClosed handles when an issue is closed
func (h *FeedbackHandler) handleIssueClosed(ctx context.Context, issueNumber int, issueURL string, issue map[string]interface{}) error {
	request, err := h.store.GetFeatureRequestByIssueNumber(ctx, issueNumber)
	if err != nil || request == nil {
		return nil
	}

	// If already closed (e.g., user closed via console), don't overwrite
	if request.Status == models.RequestStatusClosed {
		return nil
	}

	// Update status to closed (closed externally, not by the user via console)
	if err := h.store.CloseFeatureRequest(ctx, request.ID, false); err != nil {
		slog.Error("[Webhook] failed to close feature request", "issue", issueNumber, "error", err)
		// #7061: return 500 so GitHub retries the webhook delivery.
		return fiber.NewError(fiber.StatusInternalServerError, "failed to close feature request")
	}

	// Get close reason from state_reason if available
	stateReason, ok := issue["state_reason"].(string)
	message := "This issue has been closed."
	if ok && stateReason == "completed" {
		message = "This issue has been resolved and closed."
	} else if stateReason == "not_planned" {
		message = "This issue was closed as not planned."
	}

	h.createNotification(ctx,
		request.UserID,
		&request.ID,
		models.NotificationTypeClosed,
		fmt.Sprintf("Issue #%d Closed", issueNumber),
		message,
		issueURL,
	)

	return nil
}
