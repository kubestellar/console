package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"runtime/debug"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
)

// HandleGitHubWebhook handles incoming GitHub webhook events
func (h *FeedbackHandler) HandleGitHubWebhook(c *fiber.Ctx) error {
	// Reject webhooks if no secret is configured — signature verification is mandatory
	if h.webhookSecret == "" {
		slog.Info("[Webhook] Rejected: GITHUB_WEBHOOK_SECRET not configured")
		return fiber.NewError(fiber.StatusServiceUnavailable, "Webhook signature verification not configured")
	}

	// Reject oversized payloads early (defense-in-depth beyond Fiber's default limit)
	const webhookMaxBodyBytes = 1 << 20 // 1 MB
	if len(c.Body()) > webhookMaxBodyBytes {
		return fiber.NewError(fiber.StatusRequestEntityTooLarge, "Webhook payload too large")
	}

	signature := c.Get("X-Hub-Signature-256")
	if !h.verifyWebhookSignature(c.Body(), signature) {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid webhook signature")
	}

	eventType := c.Get("X-GitHub-Event")
	var payload map[string]interface{}
	if err := json.Unmarshal(c.Body(), &payload); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid JSON payload")
	}

	switch eventType {
	case "issues":
		return h.handleIssueEvent(c.UserContext(), payload)
	case "pull_request":
		return h.handlePREvent(c.UserContext(), payload)
	case "deployment_status":
		return h.handleDeploymentStatus(c.UserContext(), payload)
	default:
		// Ignore other events
		return c.JSON(fiber.Map{"status": "ignored", "event": eventType})
	}
}

// findFeatureRequest looks up an existing DB record for a GitHub issue.
// Returns nil if no record exists — we do NOT auto-create records for issues
// that weren't submitted through the Console UI. GitHub is the source of truth.
func (h *FeedbackHandler) findFeatureRequest(ctx context.Context, issueNumber int) *models.FeatureRequest {
	request, err := h.store.GetFeatureRequestByIssueNumber(ctx, issueNumber)
	if err != nil || request == nil {
		return nil
	}
	return request
}

// pipelineLabels maps GitHub labels to status updates and notification types
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

// handleIssueEvent processes issue events
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

// getLatestBotComment fetches the most recent bot comment from the issue in the specified repo.
// #9901: takes a context so client disconnects / webhook cancellations cancel the outbound call.
func (h *FeedbackHandler) getLatestBotComment(ctx context.Context, issueNumber int, repoName string) string {
	if h.getEffectiveToken() == "" {
		return ""
	}

	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d/comments?per_page=10&sort=created&direction=desc",
		resolveGitHubAPIBase(), h.repoOwner, repoName, issueNumber)

	reqCtx, cancel := context.WithTimeout(ctx, githubAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "GET", url, nil)
	if err != nil {
		return ""
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	// #7059: reuse shared HTTP client for connection pooling.
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	var comments []struct {
		Body string `json:"body"`
		User struct {
			Login string `json:"login"`
			Type  string `json:"type"`
		} `json:"user"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&comments); err != nil {
		return ""
	}

	// Find the most recent bot comment (github-actions or similar)
	for _, comment := range comments {
		if comment.User.Type == "Bot" || comment.User.Login == "github-actions[bot]" {
			// Extract a summary - first paragraph or first 200 chars
			body := comment.Body
			if idx := bytes.Index([]byte(body), []byte("\n\n")); idx > 0 {
				body = body[:idx]
			}
			if len(body) > 200 {
				body = body[:200] + "..."
			}
			return body
		}
	}

	return ""
}

// handlePREvent processes pull request events
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
		for _, issueNum := range linkedIssues {
			var err error
			request, err = h.store.GetFeatureRequestByIssueNumber(ctx, issueNum)
			if err == nil && request != nil {
				requestID = request.ID
				slog.Info("[Webhook] PR linked to feature request via issue", "pr", prNumber, "issue", issueNum)
				break
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
type screenshotUploadResult struct {
	Uploaded int `json:"screenshots_uploaded"`
	Failed   int `json:"screenshots_failed"`
}

const maxAgentConnectionLogLines = 10

type createdGitHubIssue struct {
	Number  int
	HTMLURL string
	ID      int64
	Warning string
}

// Returns (issue number, non-fatal warning, validated screenshots queued for async
// upload, synchronous result counts, error). #9898: screenshot uploads are
// decoupled from this path — callers launch uploadScreenshotCommentsAsync
// on the returned slice from a background goroutine.
func (h *FeedbackHandler) createGitHubIssueInRepo(ctx context.Context, request *models.FeatureRequest, user *models.User, repoOwner, repoName string, screenshots []string, consoleErrors []models.ConsoleError, failedApiCalls []models.FailedApiCall, diagnostics *models.DiagnosticInfo, parentIssueNumber *int, clientAuth string) (int, string, []string, screenshotUploadResult, error) {
	// Determine labels based on request type and target repo
	var labels []string
	isDocs := request.TargetRepo == models.TargetRepoDocs

	if isDocs {
		// Documentation issues get doc-specific labels (no AI pipeline)
		labels = []string{"console-docs"}
		if request.RequestType == models.RequestTypeBug {
			labels = append(labels, "kind/bug")
		} else {
			labels = append(labels, "enhancement")
		}
	} else {
		// Console issues get the AI fix pipeline labels
		labels = []string{"ai-fix-requested", "needs-triage"}
		if request.RequestType == models.RequestTypeBug {
			labels = append(labels, "kind/bug")
		} else {
			labels = append(labels, "enhancement")
		}
	}

	repoLabel := "Console Application"
	if isDocs {
		repoLabel = "Console Documentation"
	}

	// Validate screenshots upfront so we can report accurate counts.
	// Screenshots are NOT embedded in the issue body (GitHub limits bodies to
	// 65,536 chars and base64 screenshots easily exceed that). Instead, they
	// are added as separate comments after issue creation. A GitHub Actions
	// workflow (process-screenshots.yml) then decodes the base64, commits
	// images to the repo, and replaces the comment with a rendered image.
	// #7062: validate screenshots upfront but only count as uploaded after
	// successful delivery via addIssueComment (moved below).
	var validScreenshots []string
	var ssResult screenshotUploadResult
	for i, dataURI := range screenshots {
		parts := strings.SplitN(dataURI, ",", 2)
		if len(parts) != 2 {
			ssResult.Failed++
			slog.Info("[Feedback] screenshot has invalid data URI format", "index", i+1)
			continue
		}
		validScreenshots = append(validScreenshots, dataURI)
	}

	shaLine := ""
	if fullSHA := vcsRevision(); fullSHA != "" {
		shortSHA := fullSHA
		const shortSHALen = 7
		if len(shortSHA) > shortSHALen {
			shortSHA = shortSHA[:shortSHALen]
		}
		shaLine = fmt.Sprintf("\nSHA: [`%s`](%s/%s/%s/commit/%s)\n", shortSHA, resolveGitHubUIBase(), h.repoOwner, h.repoName, fullSHA)
	}

	consoleErrorBlock := ""
	if len(consoleErrors) > 0 {
		var errLines strings.Builder
		const maxConsoleErrors = 50
		shown := len(consoleErrors)
		if shown > maxConsoleErrors {
			shown = maxConsoleErrors
		}
		for _, ce := range consoleErrors[:shown] {
			src := ""
			if ce.Source != "" {
				src = fmt.Sprintf(" (%s)", ce.Source)
			}
			errLines.WriteString(fmt.Sprintf("- `[%s]` **%s**%s: %s\n", ce.Timestamp, ce.Level, src, ce.Message))
		}
		if len(consoleErrors) > maxConsoleErrors {
			errLines.WriteString(fmt.Sprintf("\n_...and %d more errors omitted_\n", len(consoleErrors)-maxConsoleErrors))
		}
		consoleErrorBlock = fmt.Sprintf("\n<details>\n<summary>Browser Console Errors (%d captured)</summary>\n\n%s\n</details>\n", len(consoleErrors), errLines.String())
	}

	diagnosticsBlock := ""
	if diagnostics != nil {
		var diag strings.Builder
		diag.WriteString("\n<details>\n<summary>Diagnostics</summary>\n\n")
		diag.WriteString("| Field | Value |\n|-------|-------|\n")
		if diagnostics.AgentVersion != "" {
			diag.WriteString(fmt.Sprintf("| Agent Version | %s |\n", diagnostics.AgentVersion))
		}
		if diagnostics.CommitSHA != "" {
			diag.WriteString(fmt.Sprintf("| Commit SHA | `%s` |\n", diagnostics.CommitSHA))
		}
		if diagnostics.BuildTime != "" {
			diag.WriteString(fmt.Sprintf("| Build Time | %s |\n", diagnostics.BuildTime))
		}
		if diagnostics.GoVersion != "" {
			diag.WriteString(fmt.Sprintf("| Go Version | %s |\n", diagnostics.GoVersion))
		}
		if diagnostics.AgentOS != "" {
			diag.WriteString(fmt.Sprintf("| Agent OS | %s |\n", diagnostics.AgentOS))
		}
		if diagnostics.AgentArch != "" {
			diag.WriteString(fmt.Sprintf("| Agent Arch | %s |\n", diagnostics.AgentArch))
		}
		if diagnostics.InstallMethod != "" {
			diag.WriteString(fmt.Sprintf("| Install Method | %s |\n", diagnostics.InstallMethod))
		}
		if diagnostics.ConsoleDeployMode != "" {
			diag.WriteString(fmt.Sprintf("| Deployment Mode | %s |\n", diagnostics.ConsoleDeployMode))
		}
		if diagnostics.ActiveAgentBackend != "" {
			diag.WriteString(fmt.Sprintf("| Active Agent Backend | %s |\n", diagnostics.ActiveAgentBackend))
		}
		if diagnostics.BackendWSStatus != "" {
			diag.WriteString(fmt.Sprintf("| Backend WS Status | %s |\n", diagnostics.BackendWSStatus))
		}
		if diagnostics.Clusters > 0 {
			diag.WriteString(fmt.Sprintf("| Clusters | %d |\n", diagnostics.Clusters))
		}
		if diagnostics.ClusterContext != "" {
			diag.WriteString(fmt.Sprintf("| Cluster Context | %s |\n", diagnostics.ClusterContext))
		}
		if diagnostics.AgentConnectionStatus != "" {
			diag.WriteString(fmt.Sprintf("| Agent Connection | %s |\n", diagnostics.AgentConnectionStatus))
		}
		if diagnostics.AgentConnectionFailures > 0 {
			diag.WriteString(fmt.Sprintf("| Connection Failures | %d |\n", diagnostics.AgentConnectionFailures))
		}
		if diagnostics.AgentLastError != "" {
			diag.WriteString(fmt.Sprintf("| Last Agent Error | %s |\n", diagnostics.AgentLastError))
		}
		if diagnostics.BrowserUA != "" {
			diag.WriteString(fmt.Sprintf("| Browser UA | %s |\n", diagnostics.BrowserUA))
		}
		if diagnostics.BrowserPlatform != "" {
			diag.WriteString(fmt.Sprintf("| Browser Platform | %s |\n", diagnostics.BrowserPlatform))
		}
		if diagnostics.BrowserLanguage != "" {
			diag.WriteString(fmt.Sprintf("| Browser Language | %s |\n", diagnostics.BrowserLanguage))
		}
		if diagnostics.ScreenResolution != "" {
			diag.WriteString(fmt.Sprintf("| Screen Resolution | %s |\n", diagnostics.ScreenResolution))
		}
		if diagnostics.WindowSize != "" {
			diag.WriteString(fmt.Sprintf("| Window Size | %s |\n", diagnostics.WindowSize))
		}
		if diagnostics.PageURL != "" {
			diag.WriteString(fmt.Sprintf("| Page URL | %s |\n", diagnostics.PageURL))
		}
		if len(diagnostics.AgentConnectionLog) > 0 {
			shown := diagnostics.AgentConnectionLog
			if len(shown) > maxAgentConnectionLogLines {
				shown = shown[:maxAgentConnectionLogLines]
			}
			diag.WriteString("\n<details>\n<summary>Agent Connection Log</summary>\n\n")
			for _, line := range shown {
				safeLine := strings.NewReplacer("`", "'", "\n", " ", "\r", "").Replace(line)
				diag.WriteString(fmt.Sprintf("- `%s`\n", safeLine))
			}
			diag.WriteString("\n</details>\n")
		}
		diag.WriteString("\n</details>\n")
		diagnosticsBlock = diag.String()
	}

	failedApiBlock := ""
	if len(failedApiCalls) > 0 {
		var apiLines strings.Builder
		const maxFailedApiCalls = 30
		shown := len(failedApiCalls)
		if shown > maxFailedApiCalls {
			shown = maxFailedApiCalls
		}
		for _, call := range failedApiCalls[:shown] {
			detail := ""
			if call.Detail != "" {
				// Escape backticks and strip newlines so the detail cannot break out of
				// the inline code span or inject arbitrary markdown into the issue body.
				safeDetail := strings.NewReplacer("`", "'", "\n", " ", "\r", "").Replace(call.Detail)
				detail = fmt.Sprintf(": %s", safeDetail)
			}
			apiLines.WriteString(fmt.Sprintf("- `[%s]` **%s** `%s`%s\n", call.Timestamp, call.Status, call.Endpoint, detail))
		}
		if len(failedApiCalls) > maxFailedApiCalls {
			apiLines.WriteString(fmt.Sprintf("\n_...and %d more omitted_\n", len(failedApiCalls)-maxFailedApiCalls))
		}
		failedApiBlock = fmt.Sprintf("\n<details>\n<summary>Failed API Calls (%d captured)</summary>\n\n%s\n</details>\n", len(failedApiCalls), apiLines.String())
	}

	issueBody := fmt.Sprintf(`## User Request

**Type:** %s
**Target:** %s
**Submitted by:** @%s
**Console Request ID:** %s

## Description

%s
%s%s%s%s
---
*This issue was automatically created from the KubeStellar Console.*
`, request.RequestType, repoLabel, user.GitHubLogin, request.ID.String(), request.Description, shaLine, consoleErrorBlock, failedApiBlock, diagnosticsBlock)

	// First attempt: create issue with labels
	createdIssue, err := h.postGitHubIssue(ctx, repoOwner, repoName, request.Title, issueBody, labels, parentIssueNumber, clientAuth)
	if err != nil && isLabelPermissionError(err) {
		// The token lacks permission to create/apply labels on this repo.
		// Retry without labels — the issue body includes the request type
		// so maintainers can triage and label it manually.
		slog.Info("[Feedback] label permission denied, retrying without labels", "repo", repoOwner+"/"+repoName)
		createdIssue, err = h.postGitHubIssue(ctx, repoOwner, repoName, request.Title, issueBody, nil, parentIssueNumber, clientAuth)
	}

	// Screenshots are uploaded asynchronously by the caller via
	// uploadScreenshotCommentsAsync so slow GitHub responses cannot block
	// the Fiber worker handling CreateFeatureRequest (#9898). We count
	// validated screenshots as "queued for upload" here; the background
	// goroutine logs per-comment success/failure via slog.
	if err == nil {
		ssResult.Uploaded = len(validScreenshots)
	}

	return createdIssue.Number, createdIssue.Warning, validScreenshots, ssResult, err
}

// uploadScreenshotCommentsAsync posts each screenshot to the given issue as
// a separate comment. It is intended to be called from a goroutine with a
// context rooted in context.Background() so slow uploads do not block the
// request path (#9898). Failures are logged via slog — the FeatureRequest
// and its GitHub issue have already been persisted, so a missed screenshot
// does not lose the user's submission.
func (h *FeedbackHandler) uploadScreenshotCommentsAsync(ctx context.Context, issueNumber int, repoName string, screenshots []string) {
	if len(screenshots) == 0 {
		return
	}
	var uploaded, failed int
	for i, dataURI := range screenshots {
		if ctx.Err() != nil {
			// Timeout or cancellation — count the rest as failed and stop.
			failed += len(screenshots) - i
			slog.Warn("[Feedback] async screenshot upload context done, remaining screenshots skipped",
				"issue", issueNumber, "remaining", len(screenshots)-i, "reason", ctx.Err())
			break
		}
		commentBody := fmt.Sprintf(
			"<!-- screenshot-base64:%d -->\n<details>\n<summary>Screenshot %d (processing...)</summary>\n\n```\n%s\n```\n\n</details>",
			i+1, i+1, dataURI)
		if commentErr := h.addIssueComment(ctx, issueNumber, commentBody, repoName); commentErr != nil {
			slog.Warn("[Feedback] async screenshot comment upload failed",
				"index", i+1, "issue", issueNumber, "error", commentErr)
			failed++
			continue
		}
		uploaded++
	}
	slog.Info("[Feedback] async screenshot upload complete",
		"issue", issueNumber, "uploaded", uploaded, "failed", failed)
}

// postGitHubIssue sends a POST request to the GitHub Issues API, or
// proxies via the attribution service when configured and a client
// credential is present. If labels is nil or empty, the "labels" field
// is omitted from the payload.
// #9901: accepts a context so client disconnect cancels the outbound call.
func (h *FeedbackHandler) postGitHubIssue(ctx context.Context, repoOwner, repoName, title, body string, labels []string, parentIssueNumber *int, clientAuth string) (createdGitHubIssue, error) {
	// Attribution proxy path: when configured and the caller provided
	// a per-user client credential, route through the central App-holder
	// so GitHub stamps `performed_via_github_app.slug` on the issue.
	if h.attributionProxyURL != "" && clientAuth != "" {
		createdIssue, err := h.postGitHubIssueViaProxy(ctx, repoOwner, repoName, title, body, labels, parentIssueNumber, clientAuth)
		if err == nil {
			return createdIssue, nil
		}
		// Fall through to the direct path so a proxy outage doesn't
		// block feedback submission. The issue won't get App
		// attribution but the user's report still lands.
		slog.Warn("[Feedback] attribution proxy failed, falling back to direct GitHub",
			"proxyURL", h.attributionProxyURL, "error", err)
	}

	payload := map[string]interface{}{
		"title": title,
		"body":  body,
	}
	if len(labels) > 0 {
		payload["labels"] = labels
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return createdGitHubIssue{}, fmt.Errorf("failed to marshal issue payload: %w", err)
	}
	apiURL := fmt.Sprintf("%s/repos/%s/%s/issues", resolveGitHubAPIBase(), repoOwner, repoName)

	// #9901: layer a per-call timeout on top of the request-scoped context.
	reqCtx, cancel := context.WithTimeout(ctx, githubAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return createdGitHubIssue{}, err
	}

	authToken := h.resolveIssueAuthToken(req.Context())
	req.Header.Set("Authorization", "Bearer "+authToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	// #7059: reuse shared HTTP client for connection pooling.
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return createdGitHubIssue{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			respBody = []byte("(failed to read response body)")
		}
		if resp.StatusCode == http.StatusUnauthorized {
			return createdGitHubIssue{}, fmt.Errorf("%w: %s", errGitHubUnauthorized, string(respBody))
		}
		if resp.StatusCode == http.StatusForbidden && isInsufficientIssuePermissionError(string(respBody)) {
			return createdGitHubIssue{}, fmt.Errorf("%w: %s", errGitHubInsufficientPermissions, string(respBody))
		}
		return createdGitHubIssue{}, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID      int64  `json:"id"`
		Number  int    `json:"number"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return createdGitHubIssue{}, err
	}

	createdIssue := createdGitHubIssue{
		ID:      result.ID,
		Number:  result.Number,
		HTMLURL: result.HTMLURL,
	}
	if parentIssueNumber != nil && *parentIssueNumber > 0 {
		if err := h.linkIssueAsSubIssue(req.Context(), repoOwner, repoName, *parentIssueNumber, result.ID, authToken); err != nil {
			createdIssue.Warning = fmt.Sprintf("Issue #%d was created, but it could not be linked to parent issue #%d: %v", result.Number, *parentIssueNumber, err)
		}
	}

	return createdIssue, nil
}

// postGitHubIssueViaProxy forwards the issue payload to the central
// attribution service. The service validates the client credential
// against GitHub, then creates the issue using the
// `kubestellar-console-bot` App so GitHub stamps
// `performed_via_github_app.slug` on it.
// #9901: accepts a context so client disconnect cancels the outbound call.
func (h *FeedbackHandler) postGitHubIssueViaProxy(ctx context.Context, repoOwner, repoName, title, body string, labels []string, parentIssueNumber *int, clientAuth string) (createdGitHubIssue, error) {
	payload := map[string]interface{}{
		"repoOwner": repoOwner,
		"repoName":  repoName,
		"title":     title,
		"body":      body,
	}
	if len(labels) > 0 {
		payload["labels"] = labels
	}
	if parentIssueNumber != nil && *parentIssueNumber > 0 {
		payload["parentIssueNumber"] = *parentIssueNumber
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return createdGitHubIssue{}, fmt.Errorf("marshal proxy payload: %w", err)
	}

	// #9901: layer a per-call timeout on top of the request-scoped context.
	reqCtx, cancel := context.WithTimeout(ctx, githubAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, "POST", h.attributionProxyURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return createdGitHubIssue{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-KC-Client-Auth", clientAuth)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return createdGitHubIssue{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if err != nil {
			slog.Warn("failed to read response body", "error", err)
		}
		return createdGitHubIssue{}, fmt.Errorf("proxy returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID      int64  `json:"id"`
		Number  int    `json:"number"`
		HTMLURL string `json:"html_url"`
		Warning string `json:"warning,omitempty"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return createdGitHubIssue{}, err
	}
	return createdGitHubIssue{
		ID:      result.ID,
		Number:  result.Number,
		HTMLURL: result.HTMLURL,
		Warning: result.Warning,
	}, nil
}

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

func (h *FeedbackHandler) linkIssueAsSubIssue(ctx context.Context, repoOwner, repoName string, parentIssueNumber int, subIssueID int64, authToken string) error {
	payload := map[string]interface{}{
		"sub_issue_id": subIssueID,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal sub-issue payload: %w", err)
	}

	apiURL := fmt.Sprintf("%s/repos/%s/%s/issues/%d/sub_issues", resolveGitHubAPIBase(), repoOwner, repoName, parentIssueNumber)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+authToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			respBody = []byte("(failed to read response body)")
		}
		return fmt.Errorf("GitHub sub-issue API returned %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (h *FeedbackHandler) canLinkParentIssue(ctx context.Context, repoOwner, repoName, clientAuth string) (bool, error) {
	if clientAuth == "" {
		return false, nil
	}
	if h.attributionProxyURL != "" {
		canLinkParent, err := h.fetchIssueLinkCapabilitiesViaProxy(ctx, repoOwner, repoName, clientAuth)
		if err == nil {
			return canLinkParent, nil
		}
		slog.Warn("[Feedback] issue link capability proxy failed, falling back to GitHub", "error", err)
	}
	return h.fetchIssueLinkCapabilitiesDirect(ctx, repoOwner, repoName, clientAuth)
}

func (h *FeedbackHandler) fetchIssueLinkCapabilitiesViaProxy(ctx context.Context, repoOwner, repoName, clientAuth string) (bool, error) {
	proxyURL := fmt.Sprintf("%s?mode=capabilities&repoOwner=%s&repoName=%s", h.attributionProxyURL, repoOwner, repoName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, proxyURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("X-KC-Client-Auth", clientAuth)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		return false, fmt.Errorf("proxy returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		CanLinkParent bool `json:"can_link_parent"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}
	return result.CanLinkParent, nil
}

func (h *FeedbackHandler) fetchIssueLinkCapabilitiesDirect(ctx context.Context, repoOwner, repoName, clientAuth string) (bool, error) {
	apiURL := fmt.Sprintf("%s/repos/%s/%s", resolveGitHubAPIBase(), repoOwner, repoName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+clientAuth)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		return false, fmt.Errorf("GitHub repo permissions API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Permissions struct {
			Push bool `json:"push"`
		} `json:"permissions"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}
	return result.Permissions.Push, nil
}

// uploadScreenshotToGitHub uploads a base64 data-URI screenshot to the
// repository via the GitHub Contents API and returns the raw download URL
// that can be embedded in issue markdown.
//
// Files are stored under .github/screenshots/{requestID}/ to keep them
// organized and to avoid polluting the main source tree.
func (h *FeedbackHandler) uploadScreenshotToGitHub(repoOwner, repoName, requestID string, index int, dataURI string) (string, error) {
	// Parse data URI: "data:image/png;base64,iVBOR..."
	parts := strings.SplitN(dataURI, ",", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid data URI format")
	}

	// Extract MIME type to determine file extension
	ext := "png" // default
	header := parts[0]
	if strings.Contains(header, "image/jpeg") || strings.Contains(header, "image/jpg") {
		ext = "jpg"
	} else if strings.Contains(header, "image/gif") {
		ext = "gif"
	} else if strings.Contains(header, "image/webp") {
		ext = "webp"
	}

	// The base64 content (GitHub Contents API expects raw base64, no wrapping).
	// Browsers may omit trailing '=' padding, so we normalize first.
	b64Content := parts[1]

	// Add padding if missing — base64 requires length to be a multiple of 4
	if remainder := len(b64Content) % 4; remainder != 0 {
		b64Content += strings.Repeat("=", 4-remainder)
	}

	// Validate that the base64 content is actually valid
	if _, err := base64.StdEncoding.DecodeString(b64Content); err != nil {
		return "", fmt.Errorf("invalid base64 content: %w", err)
	}

	filePath := fmt.Sprintf(".github/screenshots/%s/screenshot-%d.%s", requestID, index+1, ext)

	payload := map[string]string{
		"message": fmt.Sprintf("Add screenshot %d for issue %s", index+1, requestID),
		"content": b64Content,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal upload payload: %w", err)
	}

	apiURL := fmt.Sprintf("%s/repos/%s/%s/contents/%s", resolveGitHubAPIBase(), repoOwner, repoName, filePath)

	// Use a per-request timeout for screenshot uploads (large base64 payloads)
	// instead of creating a separate http.Client, to reuse h.httpClient's
	// Transport (connection pooling, proxy settings, keep-alive tuning).
	ctx, cancel := context.WithTimeout(context.Background(), screenshotUploadTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "PUT", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if err != nil {
			slog.Warn("failed to read response body", "error", err)
		}
		return "", fmt.Errorf("GitHub Contents API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Content struct {
			DownloadURL string `json:"download_url"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode upload response: %w", err)
	}

	return result.Content.DownloadURL, nil
}

// isLabelPermissionError checks whether the error from the GitHub API is a
// 403 caused by insufficient permissions to create labels. The GitHub API
// returns: {"message":"You do not have permission to create labels on this
// repository.","errors":[{"resource":"Repository","field":"label","code":"unauthorized"}]}
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

// addPRComment adds a comment to a GitHub PR
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

	commentBody := fmt.Sprintf("**User Feedback:** %s\n\n", emoji)
	if feedback.Comment != "" {
		commentBody += fmt.Sprintf("> %s", feedback.Comment)
	}

	payload := map[string]string{"body": commentBody}
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
func (h *FeedbackHandler) verifyWebhookSignature(payload []byte, signature string) bool {
	if signature == "" || len(signature) < 7 {
		return false
	}

	mac := hmac.New(sha256.New, []byte(h.webhookSecret))
	mac.Write(payload)
	expectedSignature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// createNotification is a helper to create notifications
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
