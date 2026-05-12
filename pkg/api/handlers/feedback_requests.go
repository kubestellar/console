package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/safego"
)

const maxVerificationCommentChars = 1000

func featureRequestIssueKey(targetRepo models.TargetRepo, issueNumber int) string {
	if targetRepo == "" {
		targetRepo = models.TargetRepoConsole
	}
	return fmt.Sprintf("%s:%d", targetRepo, issueNumber)
}

func parseGitHubRequestID(idParam string) (models.TargetRepo, int, bool) {
	if !strings.HasPrefix(idParam, "gh-") {
		return "", 0, false
	}
	parts := strings.Split(strings.TrimPrefix(idParam, "gh-"), "-")
	switch len(parts) {
	case 1:
		issueNum, err := strconv.Atoi(parts[0])
		if err != nil {
			return "", 0, false
		}
		return models.TargetRepoConsole, issueNum, true
	case 2:
		issueNum, err := strconv.Atoi(parts[1])
		if err != nil {
			return "", 0, false
		}
		targetRepo := models.TargetRepo(parts[0])
		if targetRepo != models.TargetRepoConsole && targetRepo != models.TargetRepoDocs {
			return "", 0, false
		}
		return targetRepo, issueNum, true
	default:
		return "", 0, false
	}
}

func verificationCommentBody(comment string) string {
	trimmedComment := strings.TrimSpace(comment)
	if trimmedComment == "" {
		return "The reporter tested the merged fix and it is still broken."
	}
	return fmt.Sprintf("The reporter tested the merged fix and it is still broken.\n\nStill failing:\n%s", trimmedComment)
}

func (h *FeedbackHandler) findStoredFeatureRequestByIssue(ctx context.Context, userID uuid.UUID, targetRepo models.TargetRepo, issueNumber int) (*models.FeatureRequest, error) {
	request, err := h.store.GetFeatureRequestByIssueNumber(ctx, issueNumber)
	if err != nil || request == nil {
		return request, err
	}
	storedTargetRepo := request.TargetRepo
	if storedTargetRepo == "" {
		storedTargetRepo = models.TargetRepoConsole
	}
	if request.UserID != userID || storedTargetRepo != targetRepo {
		return nil, nil
	}
	return request, nil
}

func (h *FeedbackHandler) CreateFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	var input models.CreateFeatureRequestInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate input
	if input.Title == "" || len(input.Title) < 10 {
		return fiber.NewError(fiber.StatusBadRequest, "Title must be at least 10 characters")
	}
	if input.Description == "" || len(input.Description) < 20 {
		return fiber.NewError(fiber.StatusBadRequest, "Description must be at least 20 characters")
	}
	if len(strings.Fields(input.Description)) < 3 {
		return fiber.NewError(fiber.StatusBadRequest, "Description must contain at least 3 words")
	}
	if input.RequestType != models.RequestTypeBug && input.RequestType != models.RequestTypeFeature {
		return fiber.NewError(fiber.StatusBadRequest, "Request type must be 'bug' or 'feature'")
	}
	if input.ParentIssueNumber != nil && *input.ParentIssueNumber < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "Parent issue number must be a positive integer")
	}

	// Reject early if GitHub issue creation is not configured
	if h.getEffectiveToken() == "" || h.repoOwner == "" || h.repoName == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Issue submission is not available: FEEDBACK_GITHUB_TOKEN is not configured. "+
			"Add FEEDBACK_GITHUB_TOKEN=<your-pat> to your .env file. "+
			"Classic PAT: needs 'repo' scope. Fine-grained PAT: needs 'Issues' + 'Contents' read/write permissions.")
	}

	// Determine target repo — default to console if not specified or invalid
	targetRepo := input.TargetRepo
	if targetRepo != models.TargetRepoConsole && targetRepo != models.TargetRepoDocs {
		targetRepo = models.TargetRepoConsole
	}

	// Resolve the actual GitHub repo name based on target
	targetRepoName := h.resolveRepoName(targetRepo)

	// Get user info for the issue
	user, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || user == nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}

	// Create feature request in database first
	request := &models.FeatureRequest{
		UserID:      userID,
		Title:       input.Title,
		Description: input.Description,
		RequestType: input.RequestType,
		TargetRepo:  targetRepo,
		Status:      models.RequestStatusOpen,
	}

	if err := h.store.CreateFeatureRequest(c.UserContext(), request); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create feature request")
	}

	// Per-user client credential used by the attribution proxy to
	// verify submitter identity (never logged). Empty is fine — the
	// proxy path is skipped in that case.
	clientAuth := c.Get("X-KC-Client-Auth")

	// Create GitHub issue (route to the correct repo). The issue itself is
	// created synchronously so the client receives the issue number/URL in
	// the response; screenshot comments are uploaded asynchronously below
	// (#9898) so slow GitHub responses do not block Fiber workers.
	issueNumber, issueWarning, validScreenshots, ssResult, err := h.createGitHubIssueInRepo(c.UserContext(), request, user, h.repoOwner, targetRepoName, input.Screenshots, input.ConsoleErrors, input.FailedApiCalls, input.Diagnostics, input.ParentIssueNumber, clientAuth)
	if err != nil {
		slog.Error("[Feedback] failed to create GitHub issue", "error", err)
		// Clean up the orphaned database record. Log but don't fail the
		// outer error path on cleanup failure — the upstream GitHub error
		// is the useful signal to return.
		if cErr := h.store.CloseFeatureRequest(c.UserContext(), request.ID, false); cErr != nil {
			slog.Warn("[Feedback] failed to close orphaned feature request",
				"request_id", request.ID, "error", cErr)
		}
		// #6186: distinguish an expired/invalid FEEDBACK_GITHUB_TOKEN (the
		// GitHub API returned 401) from other upstream failures. The generic
		// "create a GitHub OAuth app" guidance the client shows on generic
		// errors misleads users whose real problem is a stale PAT.
		if errors.Is(err, errGitHubUnauthorized) {
			return fiber.NewError(fiber.StatusUnauthorized, "FEEDBACK_GITHUB_TOKEN is invalid or expired. Refresh the PAT in your .env and restart the console.")
		}
		if errors.Is(err, errGitHubInsufficientPermissions) {
			return fiber.NewError(fiber.StatusForbidden, "GitHub could not create the issue because the current token does not have permission to open issues in this repository. Re-authenticate with GitHub OAuth and try again, or open the issue directly on GitHub.")
		}
		return fiber.NewError(fiber.StatusBadGateway, "Failed to create GitHub issue")
	}
	request.GitHubIssueNumber = &issueNumber
	request.Status = models.RequestStatusOpen
	// UpdateFeatureRequest writes user-visible state (issue number, status).
	// A failure here means the client will see stale data — return 500.
	if err := h.store.UpdateFeatureRequest(c.UserContext(), request); err != nil {
		slog.Error("[Feedback] failed to persist GitHub issue number",
			"request_id", request.ID, "issue", issueNumber, "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to persist feature request state")
	}

	// #9898: Upload screenshot comments asynchronously so slow GitHub
	// responses cannot block the Fiber worker handling this request.
	// The FeatureRequest + issue number are already persisted above, so
	// a dropped screenshot does not lose the user's submission — it can
	// be retried from the persisted record.
	if len(validScreenshots) > 0 {
		asyncCtx, cancel := context.WithTimeout(context.Background(), asyncScreenshotUploadTimeout)
		safego.GoWith("feedback-screenshot-upload", func() {
			defer cancel()
			h.uploadScreenshotCommentsAsync(asyncCtx, issueNumber, h.repoOwner, targetRepoName, request.ID.String(), validScreenshots)
		})
	}

	// Create notification for the user
	notifTitle := "Request Submitted"
	actionURL := ""
	if request.GitHubIssueNumber != nil {
		notifTitle = fmt.Sprintf("Issue #%d Created", *request.GitHubIssueNumber)
		actionURL = fmt.Sprintf("https://github.com/%s/%s/issues/%d", h.repoOwner, targetRepoName, *request.GitHubIssueNumber)
	}
	notification := &models.Notification{
		UserID:           userID,
		FeatureRequestID: &request.ID,
		NotificationType: models.NotificationTypeIssueCreated,
		Title:            notifTitle,
		Message:          fmt.Sprintf("Your %s request '%s' has been submitted.", request.RequestType, request.Title),
		ActionURL:        actionURL,
	}
	if err := h.store.CreateNotification(c.UserContext(), notification); err != nil {
		slog.Warn("[Feedback] failed to create issue notification",
			"user", userID, "request_id", request.ID, "error", err)
	}

	// Return the request with screenshot queue status so the frontend can
	// display an accurate message. #9898: with the async upload path,
	// ScreenshotsUploaded now reports the number of screenshots queued
	// for upload (validated data URIs) and ScreenshotsFailed reports
	// data-URI validation failures. Per-comment upload failures are
	// logged via slog in the background goroutine — surfacing them
	// synchronously would re-introduce the blocking behavior this fix
	// is removing.
	type createResponse struct {
		*models.FeatureRequest
		ScreenshotsUploaded int    `json:"screenshots_uploaded"`
		ScreenshotsFailed   int    `json:"screenshots_failed"`
		Warning             string `json:"warning,omitempty"`
	}
	return c.Status(fiber.StatusCreated).JSON(createResponse{
		FeatureRequest:      request,
		ScreenshotsUploaded: ssResult.Uploaded,
		ScreenshotsFailed:   ssResult.Failed,
		Warning:             issueWarning,
	})
}

func (h *FeedbackHandler) GetIssueLinkCapabilities(c *fiber.Ctx) error {
	clientAuth := c.Get("X-KC-Client-Auth")
	if clientAuth == "" {
		return c.JSON(fiber.Map{"can_link_parent": false})
	}

	targetRepo := models.TargetRepo(c.Query("target_repo"))
	if targetRepo != models.TargetRepoConsole && targetRepo != models.TargetRepoDocs {
		targetRepo = models.TargetRepoConsole
	}

	canLinkParent, err := h.canLinkParentIssue(c.UserContext(), h.repoOwner, h.resolveRepoName(targetRepo), clientAuth)
	if err != nil {
		slog.Warn("[Feedback] failed to determine issue link capabilities", "target_repo", targetRepo, "error", err)
		return c.JSON(fiber.Map{"can_link_parent": false})
	}

	return c.JSON(fiber.Map{"can_link_parent": canLinkParent})
}

// ListFeatureRequests returns the user's feature requests
// Only returns requests that have been triaged (to prevent abuse/profanity in UI)
func (h *FeedbackHandler) ListFeatureRequests(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	limit, offset, err := parsePageParams(c)
	if err != nil {
		return err
	}

	requests, err := h.store.GetUserFeatureRequests(c.UserContext(), userID, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list feature requests")
	}

	if requests == nil {
		requests = []models.FeatureRequest{}
	}

	// Filter to only show triaged requests (hide open/needs_triage to prevent abuse)
	// Requests only become visible after a maintainer adds triage/accepted label
	triaged := make([]models.FeatureRequest, 0, len(requests))
	for _, r := range requests {
		if r.Status != models.RequestStatusOpen && r.Status != models.RequestStatusNeedsTriage {
			triaged = append(triaged, r)
		}
	}

	// #10174: Count untriaged submissions so the frontend can distinguish
	// "no submissions" from "submissions pending review".
	pendingReview, err := h.store.CountUserPendingFeatureRequests(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to count pending feature requests")
	}

	type listResponse struct {
		Items         []models.FeatureRequest `json:"items"`
		Total         int                     `json:"total"`
		PendingReview int                     `json:"pending_review"`
	}

	return c.JSON(listResponse{
		Items:         triaged,
		Total:         len(triaged) + pendingReview,
		PendingReview: pendingReview,
	})
}

// GitHubIssue represents an issue from GitHub API
type GitHubIssue struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	State     string `json:"state"`
	HTMLURL   string `json:"html_url"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
	User      struct {
		Login string `json:"login"`
		ID    int    `json:"id"`
	} `json:"user"`
	ClosedBy *struct {
		Login string `json:"login"`
	} `json:"closed_by"`
	Labels []struct {
		Name string `json:"name"`
	} `json:"labels"`
	// PullRequest is non-nil when the issue is actually a pull request.
	// GitHub's issues API returns PRs as issues with this field populated.
	PullRequest *struct {
		URL string `json:"url"`
	} `json:"pull_request"`
}

// QueueItem represents an issue in the queue for the frontend
type QueueItem struct {
	ID                string `json:"id"`
	UserID            string `json:"user_id"`
	GitHubLogin       string `json:"github_login"`
	Title             string `json:"title"`
	Description       string `json:"description"`
	RequestType       string `json:"request_type"`
	TargetRepo        string `json:"target_repo,omitempty"`
	GitHubIssueNumber int    `json:"github_issue_number"`
	GitHubIssueURL    string `json:"github_issue_url"`
	Status            string `json:"status"`
	PRNumber          int    `json:"pr_number,omitempty"`
	PRURL             string `json:"pr_url,omitempty"`
	PreviewURL        string `json:"netlify_preview_url,omitempty"`
	CopilotSessionURL string `json:"copilot_session_url,omitempty"`
	ClosedByUser      bool   `json:"closed_by_user,omitempty"`
	LatestComment     string `json:"latest_comment,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

// QueueItemCount — minimal shape returned by ListAllFeatureRequests when
// count_only=true. Only the navbar badge (and the closed-request set it
// filters against) consumes this path, so we serialize just id + status
// instead of every QueueItem field as empty strings.
//
// PR #6573 item E — a standalone struct is preferable to sprinkling
// ,omitempty on QueueItem because the full QueueItem shape is consumed
// by the queue UI which DOES want zero-value title/description rendered
// as "" (blurred placeholder for untriaged items), not omitted entirely.
type QueueItemCount struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// ListAllFeatureRequests returns all issues from GitHub as a queue
// For untriaged issues that don't belong to the current user, title and description are redacted
// Frontend will display these with blur effect
//
// PR #6518 item G — supports `?count_only=true` which returns a minimal
// payload of just {id, status} pairs for every queue item. The navbar
// FeatureRequestButton only needs closed-request IDs (to filter notifications
// for the badge count) and does not render titles/descriptions/bodies on
// mount, so requesting the full queue on every page load wastes bandwidth
// and CPU. The lean response still requires the GitHub round-trip (we need
// each issue's current status/labels) but avoids serializing bodies, titles,
// and user-blurring logic the client doesn't consume.
func (h *FeedbackHandler) ListAllFeatureRequests(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	countOnly := c.Query("count_only") == "true"

	// Get current user's GitHub login for ownership comparison
	user, _ := h.store.GetUser(c.UserContext(), userID)
	currentGitHubLogin := ""
	if user != nil {
		currentGitHubLogin = user.GitHubLogin
	}

	storedRequestsByIssue := map[string]models.FeatureRequest{}
	storedRequests, storedErr := h.store.GetUserFeatureRequests(c.UserContext(), userID, 0, 0)
	if storedErr != nil {
		slog.Warn("[Feedback] failed to load stored feature requests for queue merge", "error", storedErr)
	} else {
		for _, stored := range storedRequests {
			if stored.GitHubIssueNumber == nil {
				continue
			}
			storedRequestsByIssue[featureRequestIssueKey(stored.TargetRepo, *stored.GitHubIssueNumber)] = stored
		}
	}

	// Fetch issues created by the logged-in user from both console and docs repos
	consoleIssues, err := h.fetchGitHubIssuesFromRepo(c.UserContext(), currentGitHubLogin, h.repoName)
	if err != nil {
		slog.Error("[Feedback] failed to fetch GitHub issues from console repo", "error", err)
		// Fall back to local database if GitHub fetch fails
		return h.listLocalFeatureRequests(c, userID)
	}

	// Also fetch from docs repo — issues can be filed there too (#5529)
	docsRepoName := "docs"
	docsIssues, docsErr := h.fetchGitHubIssuesFromRepo(c.UserContext(), currentGitHubLogin, docsRepoName)
	if docsErr != nil {
		slog.Warn("[Feedback] failed to fetch GitHub issues from docs repo", "error", docsErr)
		// Non-fatal — continue with console issues only
	}

	// Tag each issue with its source repo for the queue
	type taggedIssue struct {
		GitHubIssue
		TargetRepo string
	}
	taggedIssues := make([]taggedIssue, 0, len(consoleIssues)+len(docsIssues))
	for _, issue := range consoleIssues {
		taggedIssues = append(taggedIssues, taggedIssue{issue, "console"})
	}
	for _, issue := range docsIssues {
		taggedIssues = append(taggedIssues, taggedIssue{issue, "docs"})
	}

	// Fetch linked PRs for console issues only (docs issues use different PR workflow)
	linkedPRs := h.fetchLinkedPRs(c.UserContext(), consoleIssues)

	// Convert to queue items
	// Note: preview URLs are fetched on-demand via CheckPreviewStatus endpoint
	// PR #6573 item E — countOnly returns []QueueItemCount (id + status only)
	// instead of a []QueueItem full of empty strings. See QueueItemCount type.
	queueItems := make([]QueueItem, 0, len(taggedIssues))
	queueItemCounts := make([]QueueItemCount, 0, len(taggedIssues))
	for _, tagged := range taggedIssues {
		issue := tagged.GitHubIssue
		// Determine status based on labels
		status := "needs_triage"
		requestType := "feature"
		for _, label := range issue.Labels {
			switch label.Name {
			case "triage/accepted":
				if status == "needs_triage" {
					status = "triage_accepted"
				}
			case "copilot/working", "feasibility-study", "ai-processing", "ai-awaiting-fix":
				status = "feasibility_study"
			case "ai-pr-active":
				status = "fix_in_progress"
			case "fix-ready", "copilot/fix-ready", "ai-pr-ready", "ai-pr-draft":
				status = "fix_ready"
			case "fix-complete", "ai-processing-complete":
				status = "fix_complete"
			case "unable-to-fix", "needs-human-review", "ai-needs-human":
				status = "unable_to_fix"
			case "bug", "kind/bug":
				requestType = "bug"
			case "enhancement", "feature":
				requestType = "feature"
			}
		}

		// Check for linked PR - if we have one, at minimum it's fix_ready
		var prNumber int
		var prURL string
		if pr, ok := linkedPRs[issue.Number]; ok {
			prNumber = pr.Number
			prURL = pr.HTMLURL
			// If PR is merged (check MergedAt since Merged field isn't in list response), status is fix_complete
			if pr.MergedAt != nil {
				status = "fix_complete"
			} else if pr.Draft {
				// Draft PR means AI is still working - keep at feasibility_study
				if status == "needs_triage" || status == "triage_accepted" {
					status = "feasibility_study"
				}
			} else if status == "needs_triage" || status == "triage_accepted" || status == "feasibility_study" {
				// If we have a non-draft open PR and status is still early, upgrade to fix_ready
				status = "fix_ready"
			}
		}

		// Handle closed issues without a merged PR
		if issue.State == "closed" && status != "fix_complete" {
			status = "closed"
		}

		isOwnedByUser := issue.User.Login == currentGitHubLogin
		isTriaged := status != "needs_triage"

		title := issue.Title
		description := issue.Body
		// Blur untriaged issues that aren't owned by the current user
		if !isTriaged && !isOwnedByUser {
			title = "[Pending Review]"
			description = "This request is pending maintainer review."
		}

		// Check if issue was closed by the current user (the one viewing the queue)
		closedByUser := issue.State == "closed" && issue.ClosedBy != nil && issue.ClosedBy.Login == currentGitHubLogin
		queueID := fmt.Sprintf("gh-%s-%d", tagged.TargetRepo, issue.Number)
		if stored, ok := storedRequestsByIssue[featureRequestIssueKey(models.TargetRepo(tagged.TargetRepo), issue.Number)]; ok {
			queueID = stored.ID.String()
			if stored.ClosedByUser {
				closedByUser = true
				status = string(models.RequestStatusClosed)
			} else if status == string(models.RequestStatusFixComplete) && stored.Status != "" && stored.Status != models.RequestStatusFixComplete {
				status = string(stored.Status)
			}
		}

		// PR #6518 item G / #6573 item E — count_only responses carry only
		// id + status, no titles or bodies. The client uses these to compute
		// the navbar badge (which filters notifications by the set of
		// closed-request IDs); nothing else is needed for that path.
		if countOnly {
			queueItemCounts = append(queueItemCounts, QueueItemCount{
				ID:     queueID,
				Status: status,
			})
			continue
		}

		latestComment := ""
		if stored, ok := storedRequestsByIssue[featureRequestIssueKey(models.TargetRepo(tagged.TargetRepo), issue.Number)]; ok {
			latestComment = stored.LatestComment
		}

		queueItems = append(queueItems, QueueItem{
			ID:                queueID,
			UserID:            fmt.Sprintf("gh-%d", issue.User.ID),
			GitHubLogin:       issue.User.Login,
			Title:             title,
			Description:       description,
			RequestType:       requestType,
			TargetRepo:        tagged.TargetRepo,
			GitHubIssueNumber: issue.Number,
			GitHubIssueURL:    issue.HTMLURL,
			Status:            status,
			PRNumber:          prNumber,
			PRURL:             prURL,
			ClosedByUser:      closedByUser,
			LatestComment:     latestComment,
			CreatedAt:         issue.CreatedAt,
			UpdatedAt:         issue.UpdatedAt,
		})
	}

	if countOnly {
		return c.JSON(queueItemCounts)
	}
	return c.JSON(queueItems)
}

// CheckPreviewStatus checks the Netlify deploy preview status for a PR on-demand.
// Uses GitHub Deployments API to find the actual preview URL — only returns "ready"
// when the deploy has succeeded. This avoids showing "Preview Available" prematurely.
func (h *FeedbackHandler) CheckPreviewStatus(c *fiber.Ctx) error {
	prNumber, err := strconv.Atoi(c.Params("pr_number"))
	if err != nil || prNumber <= 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid PR number")
	}

	if h.getEffectiveToken() == "" {
		return c.JSON(fiber.Map{"status": "unavailable", "message": "GitHub not configured"})
	}

	// Reuse the shared package-level client (connection pooling, keep-alive).
	// Previously a new client was created per request which defeated pooling.
	client := h.httpClient

	// Query GitHub Deployments API for the Netlify deploy preview environment.
	// Honor GITHUB_URL for GitHub Enterprise deployments.
	envName := fmt.Sprintf("deploy-preview-%d", prNumber)
	apiBase := resolveGitHubAPIBase()
	deploymentsURL := fmt.Sprintf("%s/repos/%s/%s/deployments?environment=%s&per_page=1",
		apiBase, h.repoOwner, h.repoName, envName)

	// #9901: propagate request context so client disconnect cancels the outbound
	// call. Layer WithTimeout on top so the original deadline still applies.
	ctx, cancel := context.WithTimeout(c.UserContext(), githubAPITimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", deploymentsURL, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create request")
	}
	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := client.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": "Failed to reach GitHub API"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": fmt.Sprintf("GitHub API returned %d", resp.StatusCode)})
	}

	var deployments []struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&deployments); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Failed to parse deployments"})
	}

	if len(deployments) == 0 {
		return c.JSON(fiber.Map{"status": "pending", "message": "No deployment found yet"})
	}

	// Fetch the latest status for this deployment
	statusesURL := fmt.Sprintf("%s/repos/%s/%s/deployments/%d/statuses?per_page=1",
		apiBase, h.repoOwner, h.repoName, deployments[0].ID)

	// #9901: reuse the same request-scoped context for the follow-up call.
	ctx2, cancel2 := context.WithTimeout(c.UserContext(), githubAPITimeout)
	defer cancel2()

	req2, err := http.NewRequestWithContext(ctx2, "GET", statusesURL, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create status request")
	}
	req2.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req2.Header.Set("Accept", "application/vnd.github.v3+json")

	resp2, err := client.Do(req2)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": "Failed to fetch deployment status"})
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"status": "error", "message": fmt.Sprintf("GitHub status API returned %d", resp2.StatusCode)})
	}

	var statuses []struct {
		State     string `json:"state"`
		TargetURL string `json:"target_url"`
		CreatedAt string `json:"created_at"`
	}
	if err := json.NewDecoder(resp2.Body).Decode(&statuses); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"status": "error", "message": "Failed to parse deployment statuses"})
	}

	if len(statuses) == 0 {
		return c.JSON(fiber.Map{"status": "pending", "message": "Deployment in progress"})
	}

	latestStatus := statuses[0]
	if latestStatus.State == "success" && latestStatus.TargetURL != "" {
		return c.JSON(fiber.Map{
			"status":      "ready",
			"preview_url": latestStatus.TargetURL,
			"ready_at":    latestStatus.CreatedAt,
		})
	}

	return c.JSON(fiber.Map{
		"status":  latestStatus.State,
		"message": fmt.Sprintf("Deploy status: %s", latestStatus.State),
	})
}

// GitHubPR represents a pull request from GitHub API
type GitHubPR struct {
	Number   int        `json:"number"`
	HTMLURL  string     `json:"html_url"`
	State    string     `json:"state"`
	Title    string     `json:"title"`
	Body     string     `json:"body"`
	Draft    bool       `json:"draft"`
	Merged   bool       `json:"merged"`
	MergedAt *time.Time `json:"merged_at"`
}

// fetchLinkedPRs fetches PRs that are linked to the given issues.
// Results are cached for prCacheTTL to reduce GitHub API usage.
// Pagination is used to fetch beyond the first page of results per state.
func (h *FeedbackHandler) fetchLinkedPRs(ctx context.Context, issues []GitHubIssue) map[int]GitHubPR {
	result := make(map[int]GitHubPR)
	if h.getEffectiveToken() == "" || h.repoOwner == "" || h.repoName == "" {
		return result
	}

	// Build issue number set for quick lookup
	issueNumbers := make(map[int]bool)
	for _, issue := range issues {
		issueNumbers[issue.Number] = true
	}

	allPRs := h.getCachedOrFetchPRs(ctx)

	// Match PRs to issues by looking for "Fixes #N", "Closes #N", or "Fixes owner/repo#N" in PR body
	fixesPattern := regexp.MustCompile(`(?i)(?:fixes|closes|resolves)\s+(?:[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)?#(\d+)`)

	for _, pr := range allPRs {
		matches := fixesPattern.FindAllStringSubmatch(pr.Body, -1)
		for _, match := range matches {
			if len(match) > 1 {
				issueNum, err := strconv.Atoi(match[1])
				if err == nil && issueNumbers[issueNum] {
					// Prefer merged PRs > open PRs > closed-without-merge
					existing, exists := result[issueNum]
					prIsMerged := pr.MergedAt != nil
					existingIsMerged := existing.MergedAt != nil
					if !exists || prIsMerged || (pr.State == "open" && !existingIsMerged) {
						result[issueNum] = pr
					}
				}
			}
		}
	}

	return result
}

// getCachedOrFetchPRs returns cached PR data if fresh, otherwise fetches
// from the GitHub API with pagination and caches the result.
//
// #7057 — Uses singleflight to coalesce concurrent cold-cache fetches into
// a single set of paginated GitHub PR API calls.
func (h *FeedbackHandler) getCachedOrFetchPRs(ctx context.Context) []GitHubPR {
	h.prCacheMu.RLock()
	if h.prCache != nil && time.Since(h.prCacheTime) < prCacheTTL {
		cached := h.prCache
		h.prCacheMu.RUnlock()
		return cached
	}
	h.prCacheMu.RUnlock()

	v, _, _ := h.prFetchGroup.Do("prs", func() (interface{}, error) {
		allPRs := make([]GitHubPR, 0)
		for _, state := range []string{"open", "closed"} {
			prs := h.fetchPRPages(ctx, state)
			allPRs = append(allPRs, prs...)
		}

		h.prCacheMu.Lock()
		// Re-check: another goroutine may have populated the cache while we fetched.
		if h.prCache != nil && time.Since(h.prCacheTime) < prCacheTTL {
			cached := h.prCache
			h.prCacheMu.Unlock()
			return cached, nil
		}
		h.prCache = allPRs
		h.prCacheTime = time.Now()
		h.prCacheMu.Unlock()

		return allPRs, nil
	})

	if prs, ok := v.([]GitHubPR); ok {
		return prs
	}
	return nil
}

// fetchPRPages fetches up to maxPRPages pages of PRs for the given state,
// using the shared HTTP client for connection reuse.
func (h *FeedbackHandler) fetchPRPages(ctx context.Context, state string) []GitHubPR {
	allPRs := make([]GitHubPR, 0)

	apiBase := resolveGitHubAPIBase()
	for page := 1; page <= maxPRPages; page++ {
		url := fmt.Sprintf(
			"%s/repos/%s/%s/pulls?state=%s&per_page=50&sort=updated&direction=desc&page=%d",
			apiBase, h.repoOwner, h.repoName, state, page)

		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			break
		}
		req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := h.httpClient.Do(req)
		if err != nil {
			break
		}

		prs, ok := func() ([]GitHubPR, bool) {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil, false
			}
			prs := make([]GitHubPR, 0)
			if err := json.NewDecoder(resp.Body).Decode(&prs); err != nil {
				return nil, false
			}
			return prs, true
		}()
		if !ok {
			break
		}

		allPRs = append(allPRs, prs...)

		// If we got fewer than a full page, there are no more results
		if len(prs) < 50 {
			break
		}
	}

	return allPRs
}

// fetchGitHubIssues fetches issues created by the given user from the specified repo
func (h *FeedbackHandler) fetchGitHubIssues(ctx context.Context, githubLogin string) ([]GitHubIssue, error) {
	return h.fetchGitHubIssuesFromRepo(ctx, githubLogin, h.repoName)
}

// fetchGitHubIssuesFromRepo fetches issues created by the given user from a
// specific repo, paginating through all results up to maxIssuePages pages.
// #7642: the previous implementation fetched only per_page=50 with no
// pagination, so users with >50 issues saw truncated counts.
func (h *FeedbackHandler) fetchGitHubIssuesFromRepo(ctx context.Context, githubLogin string, repoName string) ([]GitHubIssue, error) {
	if h.getEffectiveToken() == "" || h.repoOwner == "" || repoName == "" {
		return nil, fmt.Errorf("GitHub not configured")
	}
	if githubLogin == "" {
		return nil, fmt.Errorf("GitHub login not available")
	}

	// #7059: reuse shared HTTP client for connection pooling.
	client := h.httpClient
	if client == nil {
		client = &http.Client{Timeout: githubAPITimeout}
	}

	apiBase := resolveGitHubAPIBase()
	allIssues := make([]GitHubIssue, 0)

	for page := 1; page <= maxIssuePages; page++ {
		pageURL := fmt.Sprintf(
			"%s/repos/%s/%s/issues?state=all&creator=%s&per_page=%d&sort=updated&direction=desc&page=%d",
			apiBase, h.repoOwner, repoName, url.QueryEscape(githubLogin), issuesPerPage, page)

		req, err := http.NewRequestWithContext(ctx, "GET", pageURL, nil)
		if err != nil {
			break
		}
		req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := client.Do(req)
		if err != nil {
			break
		}

		issues, loopErr := func() ([]GitHubIssue, error) {
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				// First page failure is a hard error; subsequent pages are best-effort.
				if page == 1 {
					return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
				}
				return nil, nil
			}
			// #7063: limit response body to prevent memory exhaustion.
			body, err := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
			if err != nil {
				return nil, nil
			}
			issues := make([]GitHubIssue, 0)
			if err := json.Unmarshal(body, &issues); err != nil {
				return nil, nil
			}
			return issues, nil
		}()
		if loopErr != nil {
			return nil, loopErr
		}
		if issues == nil {
			break
		}

		allIssues = append(allIssues, issues...)

		// Fewer results than a full page means we've fetched everything.
		if len(issues) < issuesPerPage {
			break
		}
	}

	// Filter out pull requests — GitHub's issues API returns PRs as issues.
	// The PullRequest field is non-nil when the item is actually a PR.
	filtered := make([]GitHubIssue, 0, len(allIssues))
	for _, issue := range allIssues {
		if issue.PullRequest == nil {
			filtered = append(filtered, issue)
		}
	}

	return filtered, nil
}

// listLocalFeatureRequests falls back to local database when GitHub is unavailable.
//
// #9896: the happy path in ListAllFeatureRequests emits []QueueItem with fields
// like github_issue_url, github_login, and pr_number that the frontend Queue UI
// consumes. Previously this fallback returned raw []models.FeatureRequest which
// has different JSON field names and no URL/login fields — so when GitHub is
// unreachable the client silently received an incompatible shape and rendered
// broken rows. We now normalize to []QueueItem via featureRequestsToQueueItems
// so both paths emit the same contract.
func (h *FeedbackHandler) listLocalFeatureRequests(c *fiber.Ctx, userID uuid.UUID) error {
	limit, offset, err := parsePageParams(c)
	if err != nil {
		return err
	}
	requests, err := h.store.GetAllFeatureRequests(c.UserContext(), limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list feature requests")
	}

	if requests == nil {
		requests = []models.FeatureRequest{}
	}

	// For untriaged issues (open, needs_triage) that don't belong to the current user,
	// redact title and description to prevent abuse/profanity display
	for i := range requests {
		r := &requests[i]
		isUntriaged := r.Status == models.RequestStatusOpen || r.Status == models.RequestStatusNeedsTriage
		isOwnedByUser := r.UserID == userID
		if isUntriaged && !isOwnedByUser {
			r.Title = "[Pending Review]"
			r.Description = "This request is pending maintainer review."
		}
	}

	return c.JSON(h.featureRequestsToQueueItems(requests))
}

// featureRequestsToQueueItems converts persisted models.FeatureRequest records
// into the QueueItem shape the frontend expects from ListAllFeatureRequests.
//
// #9896: called from the GitHub-down fallback path. Fields derivable from
// local data are populated (e.g. github_issue_url is reconstructed from the
// owner/repo/number); fields that aren't persisted locally (github_login,
// PR preview URL when absent, etc.) are left at zero value. QueueItem tags
// the optional fields with ,omitempty so empty strings/ints are dropped
// from the wire response.
func (h *FeedbackHandler) featureRequestsToQueueItems(requests []models.FeatureRequest) []QueueItem {
	items := make([]QueueItem, 0, len(requests))
	for _, r := range requests {
		repoName := h.resolveRepoName(r.TargetRepo)

		issueNumber := 0
		issueURL := ""
		if r.GitHubIssueNumber != nil {
			issueNumber = *r.GitHubIssueNumber
			// Reconstruct the HTML URL GitHub would have returned. We can only
			// do this when the owner/repo are configured; otherwise leave empty
			// and let the frontend degrade gracefully.
			if h.repoOwner != "" && repoName != "" {
				issueURL = fmt.Sprintf("https://github.com/%s/%s/issues/%d", h.repoOwner, repoName, issueNumber)
			}
		}

		prNumber := 0
		if r.PRNumber != nil {
			prNumber = *r.PRNumber
		}

		updatedAt := ""
		if r.UpdatedAt != nil {
			updatedAt = r.UpdatedAt.UTC().Format(time.RFC3339)
		}

		items = append(items, QueueItem{
			ID:                r.ID.String(),
			UserID:            r.UserID.String(),
			GitHubLogin:       "", // not persisted on FeatureRequest; omitted on the wire
			Title:             r.Title,
			Description:       r.Description,
			RequestType:       string(r.RequestType),
			TargetRepo:        string(r.TargetRepo),
			GitHubIssueNumber: issueNumber,
			GitHubIssueURL:    issueURL,
			Status:            string(r.Status),
			PRNumber:          prNumber,
			PRURL:             r.PRURL,
			PreviewURL:        r.NetlifyPreviewURL,
			CopilotSessionURL: r.CopilotSessionURL,
			ClosedByUser:      r.ClosedByUser,
			LatestComment:     r.LatestComment,
			CreatedAt:         r.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt:         updatedAt,
		})
	}
	return items
}

// GetFeatureRequest returns a single feature request
func (h *FeedbackHandler) GetFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	request, err := h.store.GetFeatureRequest(c.UserContext(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get feature request")
	}
	if request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	// Ensure user owns this request
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	return c.JSON(request)
}

// CloseRequest closes a feature request.
func (h *FeedbackHandler) CloseRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	var input models.CloseFeatureRequestInput
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&input); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
		}
	}

	clientAuth := c.Get("X-KC-Client-Auth")
	idParam := c.Params("id")
	if targetRepo, issueNum, ok := parseGitHubRequestID(idParam); ok {
		repoName := h.resolveRepoName(targetRepo)
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(c.UserContext(), issueNum, repoName, currentLogin); ownerErr != nil {
			return ownerErr
		}
		if h.getEffectiveToken() != "" {
			if closeErr := h.closeGitHubIssueForUser(c.UserContext(), issueNum, repoName, clientAuth); closeErr != nil {
				slog.Error("[Feedback] failed to close GitHub issue", "issue", issueNum, "repo", repoName, "error", closeErr)
				return fiber.NewError(fiber.StatusBadGateway, "Failed to close issue on GitHub")
			}
		}
		storedRequest, err := h.findStoredFeatureRequestByIssue(c.UserContext(), userID, targetRepo, issueNum)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to load feature request")
		}
		if storedRequest != nil {
			if err := h.store.CloseFeatureRequest(c.UserContext(), storedRequest.ID, true); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to close request")
			}
			updatedRequest, getErr := h.store.GetFeatureRequest(c.UserContext(), storedRequest.ID)
			if getErr == nil && updatedRequest != nil {
				return c.JSON(updatedRequest)
			}
		}
		return c.JSON(map[string]any{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"status":              string(models.RequestStatusClosed),
			"closed_by_user":      true,
			"message":             "Issue closed",
		})
	}

	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	if request.GitHubIssueNumber != nil && h.getEffectiveToken() != "" {
		if err := h.closeGitHubIssueForUser(c.UserContext(), *request.GitHubIssueNumber, h.resolveRepoName(request.TargetRepo), clientAuth); err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "Failed to close issue on GitHub")
		}
	}
	if err := h.store.CloseFeatureRequest(c.UserContext(), requestID, true); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to close request")
	}
	if refreshed, err := h.store.GetFeatureRequest(c.UserContext(), requestID); err == nil && refreshed != nil {
		request = refreshed
	} else if err != nil {
		slog.Warn("[Feedback] failed to refresh request after close", "id", requestID, "error", err)
	} else {
		slog.Warn("[Feedback] refresh returned nil request after close", "id", requestID)
	}
	return c.JSON(request)
}

// ReopenRequest posts the reporter's follow-up comment and reopens the issue.
func (h *FeedbackHandler) ReopenRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	var input models.ReopenFeatureRequestInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	input.Comment = strings.TrimSpace(input.Comment)
	if input.Comment == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Comment is required")
	}
	if len(input.Comment) > maxVerificationCommentChars {
		return fiber.NewError(fiber.StatusBadRequest, "Comment is too long")
	}

	clientAuth := c.Get("X-KC-Client-Auth")
	idParam := c.Params("id")
	if targetRepo, issueNum, ok := parseGitHubRequestID(idParam); ok {
		repoName := h.resolveRepoName(targetRepo)
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(c.UserContext(), issueNum, repoName, currentLogin); ownerErr != nil {
			return ownerErr
		}
		commentBody := verificationCommentBody(input.Comment)
		if h.getEffectiveToken() != "" {
			if err := h.addIssueCommentForUser(c.UserContext(), issueNum, commentBody, repoName, clientAuth); err != nil {
				return fiber.NewError(fiber.StatusBadGateway, "Failed to add issue comment")
			}
			if err := h.updateGitHubIssueStateForUser(c.UserContext(), issueNum, repoName, "open", clientAuth); err != nil {
				return fiber.NewError(fiber.StatusBadGateway, "Failed to reopen issue on GitHub")
			}
		}
		storedRequest, err := h.findStoredFeatureRequestByIssue(c.UserContext(), userID, targetRepo, issueNum)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to load feature request")
		}
		if storedRequest != nil {
			if err := h.store.UpdateFeatureRequestLatestComment(c.UserContext(), storedRequest.ID, input.Comment); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to save verification comment")
			}
			if err := h.store.UpdateFeatureRequestStatus(c.UserContext(), storedRequest.ID, models.RequestStatusTriageAccepted); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "Failed to reopen request")
			}
			updatedRequest, getErr := h.store.GetFeatureRequest(c.UserContext(), storedRequest.ID)
			if getErr == nil && updatedRequest != nil {
				return c.JSON(updatedRequest)
			}
		}
		return c.JSON(map[string]any{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"status":              string(models.RequestStatusTriageAccepted),
			"latest_comment":      input.Comment,
			"message":             "Issue reopened",
		})
	}

	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	commentBody := verificationCommentBody(input.Comment)
	if request.GitHubIssueNumber != nil && h.getEffectiveToken() != "" {
		if err := h.addIssueCommentForUser(c.UserContext(), *request.GitHubIssueNumber, commentBody, h.resolveRepoName(request.TargetRepo), clientAuth); err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "Failed to add issue comment")
		}
		if err := h.updateGitHubIssueStateForUser(c.UserContext(), *request.GitHubIssueNumber, h.resolveRepoName(request.TargetRepo), "open", clientAuth); err != nil {
			return fiber.NewError(fiber.StatusBadGateway, "Failed to reopen issue on GitHub")
		}
	}
	if err := h.store.UpdateFeatureRequestLatestComment(c.UserContext(), requestID, input.Comment); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to save verification comment")
	}
	if err := h.store.UpdateFeatureRequestStatus(c.UserContext(), requestID, models.RequestStatusTriageAccepted); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to reopen request")
	}
	if refreshed, err := h.store.GetFeatureRequest(c.UserContext(), requestID); err == nil && refreshed != nil {
		request = refreshed
	} else if err != nil {
		slog.Warn("[Feedback] failed to refresh request after reopen", "id", requestID, "error", err)
	} else {
		slog.Warn("[Feedback] refresh returned nil request after reopen", "id", requestID)
	}
	return c.JSON(request)
}

// RequestUpdate requests an update on a feature request (pings the issue)
func (h *FeedbackHandler) RequestUpdate(c *fiber.Ctx) error {
	idParam := c.Params("id")

	if targetRepo, issueNum, ok := parseGitHubRequestID(idParam); ok {
		repoName := h.resolveRepoName(targetRepo)
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(c.UserContext(), issueNum, repoName, currentLogin); ownerErr != nil {
			return ownerErr
		}
		if h.getEffectiveToken() != "" {
			runAsyncGitHubOp("addIssueComment", func(ctx context.Context) {
				h.addIssueComment(ctx, issueNum, "The user has requested an update on this issue.", repoName)
			})
		}
		return c.JSON(map[string]interface{}{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"message":             "Update requested",
		})
	}

	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}
	if h.getEffectiveToken() != "" && request.GitHubIssueNumber != nil {
		runAsyncGitHubOp("addIssueComment", func(ctx context.Context) {
			h.addIssueComment(ctx, *request.GitHubIssueNumber, "The user has requested an update on this issue.", h.resolveRepoName(request.TargetRepo))
		})
	}

	return c.JSON(request)
}

// docsRepoName is the GitHub repository name for console documentation issues.
const docsRepoName = "docs"

// resolveRepoName returns the GitHub repo name for the given target repo.
func (h *FeedbackHandler) resolveRepoName(target models.TargetRepo) string {
	if target == models.TargetRepoDocs {
		return docsRepoName
	}
	return h.repoName
}

// verifyGitHubIssueOwnership fetches a GitHub issue and checks that the
// requesting user (identified by their GitHub login) is the issue author.
// Returns nil on success, or a fiber error (403/502/404) on failure.
func (h *FeedbackHandler) verifyGitHubIssueOwnership(ctx context.Context, issueNumber int, repoName, currentLogin string) error {
	if currentLogin == "" {
		return fiber.NewError(fiber.StatusForbidden, "GitHub login not available — cannot verify ownership")
	}

	if h.getEffectiveToken() == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "GitHub not configured")
	}

	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d",
		resolveGitHubAPIBase(), h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create ownership check request")
	}
	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, "Failed to reach GitHub API for ownership check")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fiber.NewError(fiber.StatusNotFound, "GitHub issue not found")
	}
	if resp.StatusCode != http.StatusOK {
		return fiber.NewError(fiber.StatusBadGateway, fmt.Sprintf("GitHub API returned %d during ownership check", resp.StatusCode))
	}

	var issue GitHubIssue
	if err := json.NewDecoder(resp.Body).Decode(&issue); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to parse GitHub issue for ownership check")
	}

	if !strings.EqualFold(issue.User.Login, currentLogin) {
		return fiber.NewError(fiber.StatusForbidden, "Access denied: you can only modify your own feedback issues")
	}

	return nil
}

type feedbackProxyIssueAction struct {
	Action      string   `json:"action,omitempty"`
	RepoOwner   string   `json:"repoOwner"`
	RepoName    string   `json:"repoName"`
	IssueNumber int      `json:"issueNumber,omitempty"`
	Title       string   `json:"title,omitempty"`
	Body        string   `json:"body,omitempty"`
	State       string   `json:"state,omitempty"`
	Labels      []string `json:"labels,omitempty"`
}

func (h *FeedbackHandler) invokeFeedbackProxy(ctx context.Context, payload feedbackProxyIssueAction, clientAuth string) error {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal feedback proxy payload: %w", err)
	}
	reqCtx, cancel := context.WithTimeout(ctx, githubAPITimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, h.attributionProxyURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create feedback proxy request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-KC-Client-Auth", clientAuth)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("feedback proxy request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return fmt.Errorf("feedback proxy returned %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *FeedbackHandler) updateGitHubIssueState(ctx context.Context, issueNumber int, repoName, state string) error {
	payload := map[string]string{"state": state}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal issue state payload: %w", err)
	}

	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d",
		resolveGitHubAPIBase(), h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create issue state request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to update GitHub issue state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return fmt.Errorf("GitHub API returned %d updating issue state: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *FeedbackHandler) updateGitHubIssueStateForUser(ctx context.Context, issueNumber int, repoName, state, clientAuth string) error {
	if h.attributionProxyURL != "" && clientAuth != "" {
		if err := h.invokeFeedbackProxy(ctx, feedbackProxyIssueAction{
			Action:      "update_issue_state",
			RepoOwner:   h.repoOwner,
			RepoName:    repoName,
			IssueNumber: issueNumber,
			State:       state,
		}, clientAuth); err == nil {
			return nil
		} else {
			slog.Warn("[Feedback] feedback proxy state update failed, falling back to direct GitHub", "repo", repoName, "issue", issueNumber, "error", err)
		}
	}
	return h.updateGitHubIssueState(ctx, issueNumber, repoName, state)
}

// closeGitHubIssue closes an issue on GitHub in the specified repo.
func (h *FeedbackHandler) closeGitHubIssue(ctx context.Context, issueNumber int, repoName string) error {
	return h.updateGitHubIssueState(ctx, issueNumber, repoName, "closed")
}

func (h *FeedbackHandler) closeGitHubIssueForUser(ctx context.Context, issueNumber int, repoName, clientAuth string) error {
	return h.updateGitHubIssueStateForUser(ctx, issueNumber, repoName, "closed", clientAuth)
}

// addIssueComment adds a comment to a GitHub issue in the specified repo.
// #7062: returns an error so callers can detect delivery failures
// (e.g. for accurate screenshot upload counts).
func (h *FeedbackHandler) addIssueComment(ctx context.Context, issueNumber int, comment string, repoName string) error {
	payload := map[string]string{"body": comment}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal issue comment payload: %w", err)
	}

	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d/comments",
		resolveGitHubAPIBase(), h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create issue comment request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to add issue comment: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		return fmt.Errorf("GitHub API returned %d adding comment: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (h *FeedbackHandler) addIssueCommentForUser(ctx context.Context, issueNumber int, comment string, repoName, clientAuth string) error {
	if h.attributionProxyURL != "" && clientAuth != "" {
		if err := h.invokeFeedbackProxy(ctx, feedbackProxyIssueAction{
			Action:      "comment_issue",
			RepoOwner:   h.repoOwner,
			RepoName:    repoName,
			IssueNumber: issueNumber,
			Body:        comment,
		}, clientAuth); err == nil {
			return nil
		} else {
			slog.Warn("[Feedback] feedback proxy comment failed, falling back to direct GitHub", "repo", repoName, "issue", issueNumber, "error", err)
		}
	}
	return h.addIssueComment(ctx, issueNumber, comment, repoName)
}

// SubmitFeedback submits thumbs up/down feedback on a PR
func (h *FeedbackHandler) SubmitFeedback(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	requestID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	var input models.SubmitFeedbackInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate feedback type
	if input.FeedbackType != models.FeedbackTypePositive && input.FeedbackType != models.FeedbackTypeNegative {
		return fiber.NewError(fiber.StatusBadRequest, "Feedback type must be 'positive' or 'negative'")
	}

	// Get the feature request
	request, err := h.store.GetFeatureRequest(c.UserContext(), requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	// Ensure user owns this request
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	// Ensure there's a PR to provide feedback on
	if request.PRNumber == nil {
		return fiber.NewError(fiber.StatusBadRequest, "No PR available for feedback")
	}

	// Create feedback
	feedback := &models.PRFeedback{
		FeatureRequestID: requestID,
		UserID:           userID,
		FeedbackType:     input.FeedbackType,
		Comment:          input.Comment,
	}

	if err := h.store.CreatePRFeedback(c.UserContext(), feedback); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to submit feedback")
	}

	// Add comment to GitHub PR if configured
	if h.getEffectiveToken() != "" && request.PRNumber != nil {
		runAsyncGitHubOp("addPRComment", func(ctx context.Context) {
			h.addPRComment(ctx, request, feedback)
		})
	}

	return c.Status(fiber.StatusCreated).JSON(feedback)
}

// GetNotifications returns the user's notifications
func (h *FeedbackHandler) GetNotifications(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	limit := c.QueryInt("limit", 50)
	if limit > 100 {
		limit = 100
	}
	// #6291: a caller passing limit<=0 previously returned 0 rows (SQLite
	// treats LIMIT 0 as zero rows). After #6286 added clampLimit(limit)
	// to the store, limit=0 would return 1 row instead — a silent
	// semantic change. Treat any non-positive value as "use default" so
	// the handler contract is preserved.
	if limit <= 0 {
		limit = 50
	}

	notifications, err := h.store.GetUserNotifications(c.UserContext(), userID, limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get notifications")
	}

	if notifications == nil {
		notifications = []models.Notification{}
	}

	return c.JSON(notifications)
}

// GetUnreadCount returns the count of unread notifications
func (h *FeedbackHandler) GetUnreadCount(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	count, err := h.store.GetUnreadNotificationCount(c.UserContext(), userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get unread count")
	}

	return c.JSON(fiber.Map{"count": count})
}

// MarkNotificationRead marks a notification as read
func (h *FeedbackHandler) MarkNotificationRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}
	notificationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid notification ID")
	}

	// Mark the notification as read, verifying ownership in a single query.
	// The store returns an error containing "not found" when the notification
	// does not exist or is not owned by the caller.
	if err := h.store.MarkNotificationReadByUser(c.UserContext(), notificationID, userID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return fiber.NewError(fiber.StatusNotFound, "Notification not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to mark notification read")
	}

	return c.JSON(fiber.Map{"success": true})
}

// MarkAllNotificationsRead marks all notifications as read
func (h *FeedbackHandler) MarkAllNotificationsRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User authentication required")
	}

	if err := h.store.MarkAllNotificationsRead(c.UserContext(), userID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to mark all notifications read")
	}

	return c.JSON(fiber.Map{"success": true})
}
