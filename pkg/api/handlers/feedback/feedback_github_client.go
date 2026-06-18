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

	"github.com/kubestellar/console/pkg/models"
)

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

type createdGitHubIssue struct {
	Number  int
	HTMLURL string
	ID      int64
	Warning string
}

func (h *FeedbackHandler) createGitHubIssueInRepo(ctx context.Context, request *models.FeatureRequest, user *models.User, repoOwner, repoName string, screenshots []string, consoleErrors []models.ConsoleError, failedApiCalls []models.FailedApiCall, diagnostics *models.DiagnosticInfo, parentIssueNumber *int, clientAuth string) (int, string, []string, screenshotUploadResult, error) {
	// Determine labels based on request type and target repo
	labels := make([]string, 0)
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
	validScreenshots := make([]string, 0)
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
	// the Fiber worker handling CreateFeatureRequest (#9898).
	// Keep response counters at zero here — actual upload outcomes are
	// decided by the background comment delivery path.
	if err == nil && len(validScreenshots) > 0 {
		const screenshotWarning = "Attachments are being processed and will appear on the GitHub issue shortly."
		if createdIssue.Warning != "" {
			createdIssue.Warning = createdIssue.Warning + " " + screenshotWarning
		} else {
			createdIssue.Warning = screenshotWarning
		}
	}

	return createdIssue.Number, createdIssue.Warning, validScreenshots, ssResult, err
}

// uploadScreenshotCommentsAsync uploads each screenshot to GitHub and posts
// them as inline markdown images in separate comments. It is intended to be
// called from a goroutine with a context rooted in context.Background() so
// slow uploads do not block the request path (#9898). Failures are logged via
// slog — the FeatureRequest and its GitHub issue have already been persisted,
// so a missed screenshot does not lose the user's submission.

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
		canLinkParent, err := h.canLinkParentIssue(req.Context(), repoOwner, repoName, clientAuth)
		if err != nil {
			slog.Warn("[Feedback] parent issue capability check failed", "issue", result.Number, "parent", *parentIssueNumber, "error", err)
			createdIssue.Warning = fmt.Sprintf("Issue #%d was created, but the reporter's repository permissions could not be verified for parent issue #%d.", result.Number, *parentIssueNumber)
			return createdIssue, nil
		}
		if !canLinkParent {
			createdIssue.Warning = fmt.Sprintf("Issue #%d was created, but parent issue linking requires push access to %s/%s.", result.Number, repoOwner, repoName)
			return createdIssue, nil
		}
		if err := h.linkIssueAsSubIssue(req.Context(), repoOwner, repoName, *parentIssueNumber, result.ID, authToken); err != nil {
			slog.Warn("[Feedback] sub-issue link failed", "issue", result.Number, "parent", *parentIssueNumber, "error", err)
			createdIssue.Warning = fmt.Sprintf("Issue #%d was created, but it could not be linked to parent issue #%d.", result.Number, *parentIssueNumber)
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
