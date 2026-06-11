package feedback

import (
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"

	"runtime/debug"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

func (h *FeedbackHandler) findFeatureRequest(ctx context.Context, issueNumber int) *models.FeatureRequest {
	request, err := h.store.GetFeatureRequestByIssueNumber(ctx, issueNumber)
	if err != nil || request == nil {
		return nil
	}
	return request
}

var pipelineLabels = map[string]struct {
	status    models.RequestStatus
	notifType models.NotificationType
	message   string
}{
	"triage/accepted":        {models.RequestStatusTriageAccepted, models.NotificationTypeTriageAccepted, "A maintainer has accepted this issue for processing."},
	"ai-processing":          {models.RequestStatusFeasibilityStudy, models.NotificationTypeFeasibilityStudy, "AI is analyzing this issue and working on a fix."},
	"ai-awaiting-fix":        {models.RequestStatusFeasibilityStudy, models.NotificationTypeFeasibilityStudy, "AI is working on a fix for this issue."},
	"ai-pr-draft":            {models.RequestStatusFixReady, models.NotificationTypeFixReady, "A draft PR has been created for this issue."},
	"ai-pr-ready":            {models.RequestStatusFixReady, models.NotificationTypeFixReady, "A PR is ready for review."},
	"ai-processing-complete": {models.RequestStatusFixComplete, models.NotificationTypeFixComplete, "AI processing is complete."},
}

func (h *FeedbackHandler) handleDeploymentStatus(ctx context.Context, payload map[string]interface{}) error {
	deploymentStatus, ok := payload["deployment_status"].(map[string]interface{})
	if !ok || deploymentStatus == nil {
		return nil
	}

	state, ok := deploymentStatus["state"].(string)
	if !ok || state != "success" {
		return nil
	}

	targetURL, ok := deploymentStatus["target_url"].(string)
	if !ok || targetURL == "" {
		return nil
	}

	deployment, ok := payload["deployment"].(map[string]interface{})
	if !ok || deployment == nil {
		return nil
	}

	// Extract PR number from deployment ref
	ref, ok := deployment["ref"].(string)
	if !ok || ref == "" {
		return nil
	}
	prNumber := extractPRNumber(ref)
	if prNumber == 0 {
		return nil
	}

	slog.Info("[Webhook] deployment success", "pr", prNumber, "targetURL", targetURL)

	// Find feature request by PR number and update preview URL
	request, err := h.store.GetFeatureRequestByPRNumber(ctx, prNumber)
	if err != nil || request == nil {
		slog.Info("[Webhook] no feature request found for PR", "pr", prNumber)
		return nil
	}

	// Update preview URL
	if err := h.store.UpdateFeatureRequestPreview(ctx, request.ID, targetURL); err != nil {
		slog.Error("[Webhook] failed to update preview URL", "error", err)
		return err
	}

	// Notify user that preview is ready
	h.createNotification(ctx, request.UserID, &request.ID, models.NotificationTypePreviewReady,
		fmt.Sprintf("Preview Ready for PR #%d", prNumber),
		fmt.Sprintf("A preview for '%s' is now available.", request.Title),
		targetURL)

	slog.Info("[Webhook] updated preview URL", "requestID", request.ID, "targetURL", targetURL)
	return nil
}

// createGitHubIssueInRepo creates a GitHub issue in the specified repository.
// For documentation issues (target_repo=docs), it uses documentation-appropriate
// labels instead of the AI fix pipeline labels.
//
// If the initial request with labels fails due to insufficient label permissions
// (HTTP 403 on the "label" resource), the function retries without labels so
// the issue is still created. Labels can be added later by a maintainer.
// screenshotUploadResult tracks the outcome of screenshot uploads so the
// frontend can display an accurate status message instead of assuming success.

func (h *FeedbackHandler) resolveIssueAuthToken(ctx context.Context) string {
	if h.appTokenProvider != nil {
		if tok, tokErr := h.appTokenProvider.Token(ctx); tokErr == nil {
			return tok
		} else {
			slog.Warn("[Feedback] GitHub App token unavailable — falling back to PAT", "error", tokErr)
		}
	}
	return h.getEffectiveToken()
}

func isLabelPermissionError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "403") && strings.Contains(msg, "label")
}

func isInsufficientIssuePermissionError(respBody string) bool {
	msg := strings.ToLower(respBody)
	return strings.Contains(msg, "resource not accessible by personal access token") ||
		(strings.Contains(msg, "insufficient") && strings.Contains(msg, "permission"))
}

func (h *FeedbackHandler) createNotification(ctx context.Context, userID uuid.UUID, requestID *uuid.UUID, notifType models.NotificationType, title, message, actionURL string) {
	notification := &models.Notification{
		UserID:           userID,
		FeatureRequestID: requestID,
		NotificationType: notifType,
		Title:            title,
		Message:          message,
		ActionURL:        actionURL,
	}
	if err := h.store.CreateNotification(ctx, notification); err != nil {
		slog.Error("[Feedback] failed to create notification", "error", err)
	}
}

func vcsRevision() string {
	info, ok := debug.ReadBuildInfo()
	if ok {
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" {
				return s.Value
			}
		}
	}
	const gitCmdTimeout = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), gitCmdTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "rev-parse", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
