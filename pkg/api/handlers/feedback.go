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
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

// githubAPITimeout is the timeout for HTTP requests to the GitHub API.
const githubAPITimeout = 10 * time.Second

// screenshotUploadTimeout is a longer timeout for uploading base64 screenshots
// to GitHub via the Contents API, which can be slow for large images.
const screenshotUploadTimeout = 60 * time.Second

// prCacheTTL is how long cached PR data is considered fresh.
const prCacheTTL = 5 * time.Minute

// maxPRPages is the maximum number of pages to fetch per PR state to bound API usage.
const maxPRPages = 5

// FeedbackHandler handles feature requests and feedback
type FeedbackHandler struct {
	store         store.Store
	githubToken   string
	webhookSecret string
	repoOwner     string
	repoName      string
	httpClient    *http.Client // shared HTTP client for connection reuse

	prCacheMu   sync.RWMutex
	prCache     []GitHubPR
	prCacheTime time.Time
}

// FeedbackConfig holds configuration for the feedback handler
type FeedbackConfig struct {
	GitHubToken   string // PAT for creating issues
	WebhookSecret string // Secret for validating GitHub webhooks
	RepoOwner     string // GitHub org/owner (e.g., "kubestellar")
	RepoName      string // GitHub repo name (e.g., "console")
}

// NewFeedbackHandler creates a new feedback handler
func NewFeedbackHandler(s store.Store, cfg FeedbackConfig) *FeedbackHandler {
	if cfg.GitHubToken == "" {
		slog.Warn("[Feedback] WARNING: FEEDBACK_GITHUB_TOKEN is not set — issue submission will be disabled. " +
			"Add FEEDBACK_GITHUB_TOKEN=<your-pat> to your .env file. " +
			"Classic PAT: needs 'repo' scope. Fine-grained PAT: needs 'Issues' + 'Contents' read/write permissions.")
	}
	return &FeedbackHandler{
		store:         s,
		githubToken:   cfg.GitHubToken,
		webhookSecret: cfg.WebhookSecret,
		repoOwner:     cfg.RepoOwner,
		repoName:      cfg.RepoName,
		httpClient:    &http.Client{Timeout: githubAPITimeout},
	}
}

// getEffectiveToken returns the current feedback GitHub token, preferring
// a user-configured token from the settings manager (set via UI at runtime)
// and falling back to the startup value (from environment variable).
func (h *FeedbackHandler) getEffectiveToken() string {
	// Check settings manager first (user-configured via UI)
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			return all.FeedbackGitHubToken
		}
	}
	// Fallback to startup value (from env var)
	return h.githubToken
}

// NOTE: HasToken, SaveToken, DeleteToken were removed — the consolidated
// token is managed via /api/github/token/* endpoints in github_proxy.go.

// CreateFeatureRequest creates a new feature request and GitHub issue
func (h *FeedbackHandler) CreateFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

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
	user, err := h.store.GetUser(userID)
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

	if err := h.store.CreateFeatureRequest(request); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create feature request")
	}

	// Create GitHub issue (route to the correct repo)
	issueNumber, _, ssResult, err := h.createGitHubIssueInRepo(request, user, h.repoOwner, targetRepoName, input.Screenshots)
	if err != nil {
		slog.Error("[Feedback] failed to create GitHub issue", "error", err)
		// Clean up the orphaned database record
		h.store.CloseFeatureRequest(request.ID, false)
		return fiber.NewError(fiber.StatusBadGateway, fmt.Sprintf("Failed to create GitHub issue: %v", err))
	}
	request.GitHubIssueNumber = &issueNumber
	request.Status = models.RequestStatusOpen
	h.store.UpdateFeatureRequest(request)

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
	h.store.CreateNotification(notification)

	// Return the request with screenshot upload status so the frontend can
	// display an accurate message instead of always claiming success.
	type createResponse struct {
		*models.FeatureRequest
		ScreenshotsUploaded int `json:"screenshots_uploaded"`
		ScreenshotsFailed   int `json:"screenshots_failed"`
	}
	return c.Status(fiber.StatusCreated).JSON(createResponse{
		FeatureRequest:      request,
		ScreenshotsUploaded: ssResult.Uploaded,
		ScreenshotsFailed:   ssResult.Failed,
	})
}

// ListFeatureRequests returns the user's feature requests
// Only returns requests that have been triaged (to prevent abuse/profanity in UI)
func (h *FeedbackHandler) ListFeatureRequests(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	requests, err := h.store.GetUserFeatureRequests(userID)
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

	return c.JSON(triaged)
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
	GitHubIssueNumber int    `json:"github_issue_number"`
	GitHubIssueURL    string `json:"github_issue_url"`
	Status            string `json:"status"`
	PRNumber          int    `json:"pr_number,omitempty"`
	PRURL             string `json:"pr_url,omitempty"`
	PreviewURL        string `json:"netlify_preview_url,omitempty"`
	CopilotSessionURL string `json:"copilot_session_url,omitempty"`
	ClosedByUser      bool   `json:"closed_by_user,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at,omitempty"`
}

// ListAllFeatureRequests returns all issues from GitHub as a queue
// For untriaged issues that don't belong to the current user, title and description are redacted
// Frontend will display these with blur effect
func (h *FeedbackHandler) ListAllFeatureRequests(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	// Get current user's GitHub login for ownership comparison
	user, _ := h.store.GetUser(userID)
	currentGitHubLogin := ""
	if user != nil {
		currentGitHubLogin = user.GitHubLogin
	}

	// Fetch issues created by the logged-in user from GitHub
	issues, err := h.fetchGitHubIssues(currentGitHubLogin)
	if err != nil {
		slog.Error("[Feedback] failed to fetch GitHub issues", "error", err)
		// Fall back to local database if GitHub fetch fails
		return h.listLocalFeatureRequests(c, userID)
	}

	// Fetch linked PRs for all issues
	linkedPRs := h.fetchLinkedPRs(issues)

	// Convert to queue items
	// Note: preview URLs are fetched on-demand via CheckPreviewStatus endpoint
	queueItems := make([]QueueItem, 0, len(issues))
	for _, issue := range issues {
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

		queueItems = append(queueItems, QueueItem{
			ID:                fmt.Sprintf("gh-%d", issue.Number),
			UserID:            fmt.Sprintf("gh-%d", issue.User.ID),
			GitHubLogin:       issue.User.Login,
			Title:             title,
			Description:       description,
			RequestType:       requestType,
			GitHubIssueNumber: issue.Number,
			GitHubIssueURL:    issue.HTMLURL,
			Status:            status,
			PRNumber:          prNumber,
			PRURL:             prURL,
			ClosedByUser:      closedByUser,
			CreatedAt:         issue.CreatedAt,
			UpdatedAt:         issue.UpdatedAt,
		})
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

	client := &http.Client{Timeout: githubAPITimeout}

	// Query GitHub Deployments API for the Netlify deploy preview environment
	envName := fmt.Sprintf("deploy-preview-%d", prNumber)
	deploymentsURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/deployments?environment=%s&per_page=1",
		h.repoOwner, h.repoName, envName)

	req, err := http.NewRequest("GET", deploymentsURL, nil)
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
	statusesURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/deployments/%d/statuses?per_page=1",
		h.repoOwner, h.repoName, deployments[0].ID)

	req2, err := http.NewRequest("GET", statusesURL, nil)
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
func (h *FeedbackHandler) fetchLinkedPRs(issues []GitHubIssue) map[int]GitHubPR {
	result := make(map[int]GitHubPR)
	if h.getEffectiveToken() == "" || h.repoOwner == "" || h.repoName == "" {
		return result
	}

	// Build issue number set for quick lookup
	issueNumbers := make(map[int]bool)
	for _, issue := range issues {
		issueNumbers[issue.Number] = true
	}

	allPRs := h.getCachedOrFetchPRs()

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
func (h *FeedbackHandler) getCachedOrFetchPRs() []GitHubPR {
	h.prCacheMu.RLock()
	if h.prCache != nil && time.Since(h.prCacheTime) < prCacheTTL {
		cached := h.prCache
		h.prCacheMu.RUnlock()
		return cached
	}
	h.prCacheMu.RUnlock()

	var allPRs []GitHubPR
	for _, state := range []string{"open", "closed"} {
		prs := h.fetchPRPages(state)
		allPRs = append(allPRs, prs...)
	}

	h.prCacheMu.Lock()
	// Re-check: another goroutine may have populated the cache while we fetched.
	if h.prCache != nil && time.Since(h.prCacheTime) < prCacheTTL {
		cached := h.prCache
		h.prCacheMu.Unlock()
		return cached
	}
	h.prCache = allPRs
	h.prCacheTime = time.Now()
	h.prCacheMu.Unlock()

	return allPRs
}

// fetchPRPages fetches up to maxPRPages pages of PRs for the given state,
// using the shared HTTP client for connection reuse.
func (h *FeedbackHandler) fetchPRPages(state string) []GitHubPR {
	var allPRs []GitHubPR

	for page := 1; page <= maxPRPages; page++ {
		url := fmt.Sprintf(
			"https://api.github.com/repos/%s/%s/pulls?state=%s&per_page=50&sort=updated&direction=desc&page=%d",
			h.repoOwner, h.repoName, state, page)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			break
		}
		req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := h.httpClient.Do(req)
		if err != nil {
			break
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			break
		}

		var prs []GitHubPR
		if err := json.NewDecoder(resp.Body).Decode(&prs); err != nil {
			resp.Body.Close()
			break
		}
		resp.Body.Close()

		allPRs = append(allPRs, prs...)

		// If we got fewer than a full page, there are no more results
		if len(prs) < 50 {
			break
		}
	}

	return allPRs
}

// fetchGitHubIssues fetches issues created by the given user from the configured GitHub repo
func (h *FeedbackHandler) fetchGitHubIssues(githubLogin string) ([]GitHubIssue, error) {
	if h.getEffectiveToken() == "" || h.repoOwner == "" || h.repoName == "" {
		return nil, fmt.Errorf("GitHub not configured")
	}
	if githubLogin == "" {
		return nil, fmt.Errorf("GitHub login not available")
	}

	// Fetch all issues created by the logged-in user
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues?state=all&creator=%s&per_page=50&sort=updated&direction=desc",
		h.repoOwner, h.repoName, githubLogin)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	// Use the shared HTTP client for connection reuse (falls back to default if nil).
	client := h.httpClient
	if client == nil {
		client = &http.Client{Timeout: githubAPITimeout}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Read the full body into a buffer so we can use it for both error
	// reporting and JSON decoding (json.Decoder would consume the stream).
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read GitHub response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var issues []GitHubIssue
	if err := json.Unmarshal(body, &issues); err != nil {
		return nil, err
	}

	// Filter out pull requests — GitHub's issues API returns PRs as issues.
	// The PullRequest field is non-nil when the item is actually a PR.
	filtered := make([]GitHubIssue, 0, len(issues))
	for _, issue := range issues {
		if issue.PullRequest == nil {
			filtered = append(filtered, issue)
		}
	}

	return filtered, nil
}

// listLocalFeatureRequests falls back to local database when GitHub is unavailable
func (h *FeedbackHandler) listLocalFeatureRequests(c *fiber.Ctx, userID uuid.UUID) error {
	requests, err := h.store.GetAllFeatureRequests()
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

	return c.JSON(requests)
}

// GetFeatureRequest returns a single feature request
func (h *FeedbackHandler) GetFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	request, err := h.store.GetFeatureRequest(id)
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

// CloseRequest closes a feature request
func (h *FeedbackHandler) CloseRequest(c *fiber.Ctx) error {
	idParam := c.Params("id")

	// Handle GitHub-sourced items (format: gh-{issue_number})
	if strings.HasPrefix(idParam, "gh-") {
		issueNumStr := strings.TrimPrefix(idParam, "gh-")
		issueNum, err := strconv.Atoi(issueNumStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid GitHub issue number")
		}

		// Verify the requesting user owns this GitHub issue
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(issueNum, currentLogin); ownerErr != nil {
			return ownerErr
		}

		// Close the GitHub issue
		if h.getEffectiveToken() != "" {
			go h.closeGitHubIssue(issueNum, h.repoName)
		}

		// Return a minimal response for GitHub items
		return c.JSON(map[string]any{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"status":              "closed",
			"message":             "Issue closed",
		})
	}

	// Handle local database items (UUID format)
	userID := middleware.GetUserID(c)
	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	// Get the feature request
	request, err := h.store.GetFeatureRequest(requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	// Ensure user owns this request
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	// Update status to closed (closed by the user themselves)
	if err := h.store.CloseFeatureRequest(requestID, true); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to close request")
	}

	// Close the GitHub issue if we have one
	if h.getEffectiveToken() != "" && request.GitHubIssueNumber != nil {
		go h.closeGitHubIssue(*request.GitHubIssueNumber, h.resolveRepoName(request.TargetRepo))
	}

	// Refresh and return the updated request
	request, _ = h.store.GetFeatureRequest(requestID)
	return c.JSON(request)
}

// RequestUpdate requests an update on a feature request (pings the issue)
func (h *FeedbackHandler) RequestUpdate(c *fiber.Ctx) error {
	idParam := c.Params("id")

	// Handle GitHub-sourced items (format: gh-{issue_number})
	if strings.HasPrefix(idParam, "gh-") {
		issueNumStr := strings.TrimPrefix(idParam, "gh-")
		issueNum, err := strconv.Atoi(issueNumStr)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid GitHub issue number")
		}

		// Verify the requesting user owns this GitHub issue
		currentLogin := middleware.GetGitHubLogin(c)
		if ownerErr := h.verifyGitHubIssueOwnership(issueNum, currentLogin); ownerErr != nil {
			return ownerErr
		}

		// Add a comment to the GitHub issue requesting an update
		if h.getEffectiveToken() != "" {
			go h.addIssueComment(issueNum, "The user has requested an update on this issue.", h.repoName)
		}

		// Return a minimal response for GitHub items
		return c.JSON(map[string]interface{}{
			"id":                  idParam,
			"github_issue_number": issueNum,
			"message":             "Update requested",
		})
	}

	// Handle local database items (UUID format)
	userID := middleware.GetUserID(c)
	requestID, err := uuid.Parse(idParam)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request ID")
	}

	// Get the feature request
	request, err := h.store.GetFeatureRequest(requestID)
	if err != nil || request == nil {
		return fiber.NewError(fiber.StatusNotFound, "Feature request not found")
	}

	// Ensure user owns this request
	if request.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	// Add a comment to the GitHub issue requesting an update
	if h.getEffectiveToken() != "" && request.GitHubIssueNumber != nil {
		go h.addIssueComment(*request.GitHubIssueNumber, "The user has requested an update on this issue.", h.resolveRepoName(request.TargetRepo))
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
func (h *FeedbackHandler) verifyGitHubIssueOwnership(issueNumber int, currentLogin string) error {
	if currentLogin == "" {
		return fiber.NewError(fiber.StatusForbidden, "GitHub login not available — cannot verify ownership")
	}

	if h.getEffectiveToken() == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "GitHub not configured")
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d",
		h.repoOwner, h.repoName, issueNumber)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create ownership check request")
	}
	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
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

// closeGitHubIssue closes an issue on GitHub in the specified repo
func (h *FeedbackHandler) closeGitHubIssue(issueNumber int, repoName string) {
	payload := map[string]string{"state": "closed"}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		slog.Error("[Feedback] failed to marshal close issue payload", "error", err)
		return
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d",
		h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequest("PATCH", url, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Error("[Feedback] failed to create close issue request", "error", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("[Feedback] failed to close GitHub issue", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		slog.Info("[Feedback] GitHub API error closing issue", "status", resp.StatusCode, "body", string(body))
	}
}

// addIssueComment adds a comment to a GitHub issue in the specified repo
func (h *FeedbackHandler) addIssueComment(issueNumber int, comment string, repoName string) {
	payload := map[string]string{"body": comment}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		slog.Error("[Feedback] failed to marshal issue comment payload", "error", err)
		return
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments",
		h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Error("[Feedback] failed to create issue comment request", "error", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("[Feedback] failed to add issue comment", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		slog.Info("[Feedback] GitHub API error adding comment", "status", resp.StatusCode, "body", string(body))
	}
}

// SubmitFeedback submits thumbs up/down feedback on a PR
func (h *FeedbackHandler) SubmitFeedback(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
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
	request, err := h.store.GetFeatureRequest(requestID)
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

	if err := h.store.CreatePRFeedback(feedback); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to submit feedback")
	}

	// Add comment to GitHub PR if configured
	if h.getEffectiveToken() != "" && request.PRNumber != nil {
		go h.addPRComment(request, feedback)
	}

	return c.Status(fiber.StatusCreated).JSON(feedback)
}

// GetNotifications returns the user's notifications
func (h *FeedbackHandler) GetNotifications(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	limit := c.QueryInt("limit", 50)
	if limit > 100 {
		limit = 100
	}

	notifications, err := h.store.GetUserNotifications(userID, limit)
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

	count, err := h.store.GetUnreadNotificationCount(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get unread count")
	}

	return c.JSON(fiber.Map{"count": count})
}

// MarkNotificationRead marks a notification as read
func (h *FeedbackHandler) MarkNotificationRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	notificationID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid notification ID")
	}

	// Get notification to verify ownership
	notifications, err := h.store.GetUserNotifications(userID, 100)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify notification")
	}

	found := false
	for _, n := range notifications {
		if n.ID == notificationID {
			found = true
			break
		}
	}
	if !found {
		return fiber.NewError(fiber.StatusNotFound, "Notification not found")
	}

	if err := h.store.MarkNotificationRead(notificationID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to mark notification read")
	}

	return c.JSON(fiber.Map{"success": true})
}

// MarkAllNotificationsRead marks all notifications as read
func (h *FeedbackHandler) MarkAllNotificationsRead(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	if err := h.store.MarkAllNotificationsRead(userID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to mark all notifications read")
	}

	return c.JSON(fiber.Map{"success": true})
}

// HandleGitHubWebhook handles incoming GitHub webhook events
func (h *FeedbackHandler) HandleGitHubWebhook(c *fiber.Ctx) error {
	// Reject webhooks if no secret is configured — signature verification is mandatory
	if h.webhookSecret == "" {
		slog.Info("[Webhook] Rejected: GITHUB_WEBHOOK_SECRET not configured")
		return fiber.NewError(fiber.StatusServiceUnavailable, "Webhook signature verification not configured")
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
		return h.handleIssueEvent(payload)
	case "pull_request":
		return h.handlePREvent(payload)
	case "deployment_status":
		return h.handleDeploymentStatus(payload)
	default:
		// Ignore other events
		return c.JSON(fiber.Map{"status": "ignored", "event": eventType})
	}
}

// findFeatureRequest looks up an existing DB record for a GitHub issue.
// Returns nil if no record exists — we do NOT auto-create records for issues
// that weren't submitted through the Console UI. GitHub is the source of truth.
func (h *FeedbackHandler) findFeatureRequest(issueNumber int) *models.FeatureRequest {
	request, err := h.store.GetFeatureRequestByIssueNumber(issueNumber)
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
func (h *FeedbackHandler) handleIssueEvent(payload map[string]interface{}) error {
	action, _ := payload["action"].(string)
	issue, _ := payload["issue"].(map[string]interface{})
	if issue == nil {
		return nil
	}

	numF, ok := issue["number"].(float64)
	if !ok {
		return fiber.NewError(fiber.StatusBadRequest, "missing or invalid issue number in webhook payload")
	}
	issueNumber := int(numF)
	issueURL, _ := issue["html_url"].(string)

	slog.Info("[Webhook] issue event", "issue", issueNumber, "action", action)

	// Handle label events — track pipeline progression
	if action == "labeled" {
		label, _ := payload["label"].(map[string]interface{})
		if label == nil {
			return nil
		}
		labelName, _ := label["name"].(string)

		// Special case: ai-processing-complete needs extra logic
		if labelName == "ai-processing-complete" {
			return h.handleAIProcessingComplete(issueNumber, issueURL, issue)
		}

		// Handle pipeline label transitions — only update existing DB records
		// (records created through the Console UI via CreateFeatureRequest)
		if info, ok := pipelineLabels[labelName]; ok {
			request := h.findFeatureRequest(issueNumber)
			if request == nil {
				slog.Info("[Webhook] no DB record, skipping label update", "issue", issueNumber)
				return nil
			}

			h.store.UpdateFeatureRequestStatus(request.ID, info.status)
			h.createNotification(
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
			request := h.findFeatureRequest(issueNumber)
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
		return h.handleIssueClosed(issueNumber, issueURL, issue)
	}

	return nil
}

// handleAIProcessingComplete handles when AI processing is complete
func (h *FeedbackHandler) handleAIProcessingComplete(issueNumber int, issueURL string, issue map[string]interface{}) error {
	// Find feature request by issue number
	request, err := h.store.GetFeatureRequestByIssueNumber(issueNumber)
	if err != nil || request == nil {
		slog.Info("[Webhook] feature request not found", "issue", issueNumber)
		return nil
	}

	// If there's already a PR, don't update - the PR webhook will handle it
	if request.PRNumber != nil {
		return nil
	}

	// Update status to unable to fix (needs human review)
	h.store.UpdateFeatureRequestStatus(request.ID, models.RequestStatusUnableToFix)

	// Get the most recent bot comment to summarize the status
	summary := h.getLatestBotComment(issueNumber, h.resolveRepoName(request.TargetRepo))
	if summary == "" {
		summary = "AI analysis complete. A human developer will review this issue."
	}

	// Store the latest comment on the request
	h.store.UpdateFeatureRequestLatestComment(request.ID, summary)

	// Create notification
	h.createNotification(
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
func (h *FeedbackHandler) handleIssueClosed(issueNumber int, issueURL string, issue map[string]interface{}) error {
	request, err := h.store.GetFeatureRequestByIssueNumber(issueNumber)
	if err != nil || request == nil {
		return nil
	}

	// If already closed (e.g., user closed via console), don't overwrite
	if request.Status == models.RequestStatusClosed {
		return nil
	}

	// Update status to closed (closed externally, not by the user via console)
	h.store.CloseFeatureRequest(request.ID, false)

	// Get close reason from state_reason if available
	stateReason, _ := issue["state_reason"].(string)
	message := "This issue has been closed."
	if stateReason == "completed" {
		message = "This issue has been resolved and closed."
	} else if stateReason == "not_planned" {
		message = "This issue was closed as not planned."
	}

	h.createNotification(
		request.UserID,
		&request.ID,
		models.NotificationTypeClosed,
		fmt.Sprintf("Issue #%d Closed", issueNumber),
		message,
		issueURL,
	)

	return nil
}

// getLatestBotComment fetches the most recent bot comment from the issue in the specified repo
func (h *FeedbackHandler) getLatestBotComment(issueNumber int, repoName string) string {
	if h.getEffectiveToken() == "" {
		return ""
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments?per_page=10&sort=created&direction=desc",
		h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
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
func (h *FeedbackHandler) handlePREvent(payload map[string]interface{}) error {
	action, _ := payload["action"].(string)
	pr, _ := payload["pull_request"].(map[string]interface{})
	if pr == nil {
		return nil
	}

	prNumF, ok := pr["number"].(float64)
	if !ok {
		return fiber.NewError(fiber.StatusBadRequest, "missing or invalid PR number in webhook payload")
	}
	prNumber := int(prNumF)
	prURL, _ := pr["html_url"].(string)
	body, _ := pr["body"].(string)

	// Try to find the associated feature request
	var request *models.FeatureRequest
	var requestID uuid.UUID

	// Method 1: Check for embedded UUID (Console Request ID:** <uuid>)
	requestID = extractFeatureRequestID(body)
	if requestID != uuid.Nil {
		var err error
		request, err = h.store.GetFeatureRequest(requestID)
		if err != nil {
			slog.Error("[Webhook] error getting feature request", "requestID", requestID, "error", err)
		}
	}

	// Method 2: Check for linked issue numbers (Fixes #123, Closes #456)
	if request == nil {
		linkedIssues := extractLinkedIssueNumbers(body)
		for _, issueNum := range linkedIssues {
			var err error
			request, err = h.store.GetFeatureRequestByIssueNumber(issueNum)
			if err == nil && request != nil {
				requestID = request.ID
				slog.Info("[Webhook] PR linked to feature request via issue", "pr", prNumber, "issue", issueNum)
				break
			}
		}
	}

	// If we still don't have a feature request, check labels for ai-generated
	if request == nil {
		labels, _ := pr["labels"].([]interface{})
		isAIGenerated := false
		for _, l := range labels {
			label, _ := l.(map[string]interface{})
			if name, _ := label["name"].(string); name == "ai-generated" {
				isAIGenerated = true
				break
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
		h.store.UpdateFeatureRequestPR(requestID, prNumber, prURL)
		h.store.UpdateFeatureRequestStatus(requestID, models.RequestStatusFixReady)
		if action == "opened" {
			h.createNotification(request.UserID, &requestID, models.NotificationTypeFixReady,
				fmt.Sprintf("PR #%d Created", prNumber),
				fmt.Sprintf("A fix for '%s' is ready for review.", request.Title),
				prURL)
		}

	case "closed":
		merged, _ := pr["merged"].(bool)
		if merged {
			h.store.UpdateFeatureRequestStatus(requestID, models.RequestStatusFixComplete)
			h.createNotification(request.UserID, &requestID, models.NotificationTypeFixComplete,
				fmt.Sprintf("PR #%d Merged", prNumber),
				fmt.Sprintf("The fix for '%s' has been merged!", request.Title),
				prURL)
		} else {
			h.createNotification(request.UserID, &requestID, models.NotificationTypeClosed,
				fmt.Sprintf("PR #%d Closed", prNumber),
				fmt.Sprintf("The PR for '%s' was closed without merging.", request.Title),
				prURL)
		}
	}

	slog.Info("[Webhook] PR event processed", "pr", prNumber, "action", action, "requestID", requestID)
	return nil
}

// handleDeploymentStatus processes deployment status events (for Netlify previews)
func (h *FeedbackHandler) handleDeploymentStatus(payload map[string]interface{}) error {
	deploymentStatus, _ := payload["deployment_status"].(map[string]interface{})
	if deploymentStatus == nil {
		return nil
	}

	state, _ := deploymentStatus["state"].(string)
	if state != "success" {
		return nil
	}

	targetURL, _ := deploymentStatus["target_url"].(string)
	if targetURL == "" {
		return nil
	}

	deployment, _ := payload["deployment"].(map[string]interface{})
	if deployment == nil {
		return nil
	}

	// Extract PR number from deployment ref
	ref, _ := deployment["ref"].(string)
	prNumber := extractPRNumber(ref)
	if prNumber == 0 {
		return nil
	}

	slog.Info("[Webhook] deployment success", "pr", prNumber, "targetURL", targetURL)

	// Find feature request by PR number and update preview URL
	request, err := h.store.GetFeatureRequestByPRNumber(prNumber)
	if err != nil || request == nil {
		slog.Info("[Webhook] no feature request found for PR", "pr", prNumber)
		return nil
	}

	// Update preview URL
	if err := h.store.UpdateFeatureRequestPreview(request.ID, targetURL); err != nil {
		slog.Error("[Webhook] failed to update preview URL", "error", err)
		return err
	}

	// Notify user that preview is ready
	h.createNotification(request.UserID, &request.ID, models.NotificationTypePreviewReady,
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

func (h *FeedbackHandler) createGitHubIssueInRepo(request *models.FeatureRequest, user *models.User, repoOwner, repoName string, screenshots []string) (int, string, screenshotUploadResult, error) {
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
		ssResult.Uploaded++
	}

	issueBody := fmt.Sprintf(`## User Request

**Type:** %s
**Target:** %s
**Submitted by:** @%s
**Console Request ID:** %s

## Description

%s

---
*This issue was automatically created from the KubeStellar Console.*
`, request.RequestType, repoLabel, user.GitHubLogin, request.ID.String(), request.Description)

	// First attempt: create issue with labels
	number, htmlURL, err := h.postGitHubIssue(repoOwner, repoName, request.Title, issueBody, labels)
	if err != nil && isLabelPermissionError(err) {
		// The token lacks permission to create/apply labels on this repo.
		// Retry without labels — the issue body includes the request type
		// so maintainers can triage and label it manually.
		slog.Info("[Feedback] label permission denied, retrying without labels", "repo", repoOwner+"/"+repoName)
		number, htmlURL, err = h.postGitHubIssue(repoOwner, repoName, request.Title, issueBody, nil)
	}

	// Add screenshots as separate comments (one per screenshot) so they
	// don't blow up the 65K issue body limit. Each comment contains a
	// base64 data URI in a collapsible <details> block with a marker
	// that the process-screenshots GHA workflow can find and process.
	if err == nil && len(validScreenshots) > 0 {
		for i, dataURI := range validScreenshots {
			commentBody := fmt.Sprintf(
				"<!-- screenshot-base64:%d -->\n<details>\n<summary>Screenshot %d (processing...)</summary>\n\n```\n%s\n```\n\n</details>",
				i+1, i+1, dataURI)
			h.addIssueComment(number, commentBody, repoName)
		}
		slog.Info("[Feedback] added screenshot comments to issue", "count", len(validScreenshots), "issue", number)
	}

	return number, htmlURL, ssResult, err
}

// postGitHubIssue sends a POST request to the GitHub Issues API.
// If labels is nil or empty, the "labels" field is omitted from the payload.
func (h *FeedbackHandler) postGitHubIssue(repoOwner, repoName, title, body string, labels []string) (int, string, error) {
	payload := map[string]interface{}{
		"title": title,
		"body":  body,
	}
	if len(labels) > 0 {
		payload["labels"] = labels
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return 0, "", fmt.Errorf("failed to marshal issue payload: %w", err)
	}
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues", repoOwner, repoName)

	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return 0, "", err
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			respBody = []byte("(failed to read response body)")
		}
		return 0, "", fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Number  int    `json:"number"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, "", err
	}

	return result.Number, result.HTMLURL, nil
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

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", repoOwner, repoName, filePath)

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
		respBody, _ := io.ReadAll(resp.Body)
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

// addPRComment adds a comment to a GitHub PR
func (h *FeedbackHandler) addPRComment(request *models.FeatureRequest, feedback *models.PRFeedback) {
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

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments",
		h.repoOwner, h.repoName, *request.PRNumber)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Error("[Feedback] failed to create PR comment request", "error", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("[Feedback] failed to add PR comment", "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		slog.Info("[Feedback] GitHub API error adding PR comment", "status", resp.StatusCode, "body", string(body))
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
func (h *FeedbackHandler) createNotification(userID uuid.UUID, requestID *uuid.UUID, notifType models.NotificationType, title, message, actionURL string) {
	notification := &models.Notification{
		UserID:           userID,
		FeatureRequestID: requestID,
		NotificationType: notifType,
		Title:            title,
		Message:          message,
		ActionURL:        actionURL,
	}
	if err := h.store.CreateNotification(notification); err != nil {
		slog.Error("[Feedback] failed to create notification", "error", err)
	}
}

// extractFeatureRequestID extracts the feature request ID from a PR body
func extractFeatureRequestID(body string) uuid.UUID {
	// Look for pattern: Console Request ID: <uuid>
	prefix := "Console Request ID:** "
	idx := bytes.Index([]byte(body), []byte(prefix))
	if idx == -1 {
		return uuid.Nil
	}

	start := idx + len(prefix)
	if start+36 > len(body) {
		return uuid.Nil
	}

	id, err := uuid.Parse(body[start : start+36])
	if err != nil {
		return uuid.Nil
	}
	return id
}

// extractPRNumber extracts PR number from a deployment ref
func extractPRNumber(ref string) int {
	// Netlify deployments use refs like "pull/123/head"
	var prNumber int
	fmt.Sscanf(ref, "pull/%d/head", &prNumber)
	return prNumber
}

// extractLinkedIssueNumbers extracts issue numbers from PR body
// Looks for patterns like "Fixes #123", "Closes org/repo#456", "Resolves #789"
func extractLinkedIssueNumbers(body string) []int {
	var issueNumbers []int

	// Regex to match: Fixes/Closes/Resolves [org/repo]#123
	// Handles both "#123" and "org/repo#123" formats
	re := regexp.MustCompile(`(?i)(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+(?:[\w-]+/[\w-]+)?#(\d+)`)
	matches := re.FindAllStringSubmatch(body, -1)

	for _, match := range matches {
		if len(match) >= 2 {
			issueNum, err := strconv.Atoi(match[1])
			if err == nil && issueNum > 0 {
				// Check for duplicates
				found := false
				for _, n := range issueNumbers {
					if n == issueNum {
						found = true
						break
					}
				}
				if !found {
					issueNumbers = append(issueNumbers, issueNum)
				}
			}
		}
	}
	return issueNumbers
}

// LoadFeedbackConfig loads feedback configuration, preferring persisted settings
// from the settings manager (user-configured via UI) and falling back to
// environment variables (FEEDBACK_GITHUB_TOKEN or GITHUB_TOKEN alias).
func LoadFeedbackConfig() FeedbackConfig {
	githubToken := settings.ResolveGitHubTokenEnv()
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			githubToken = all.FeedbackGitHubToken
		}
	}

	// Warn when feedback repo env vars are not set — forks and enterprise
	// deployments should configure these to avoid routing feedback to the
	// upstream kubestellar repositories.  See #2826.
	feedbackEnvVars := map[string]string{
		"FEEDBACK_REPO_OWNER": "kubestellar",
		"FEEDBACK_REPO_NAME":  "console",
	}
	for envVar, defaultVal := range feedbackEnvVars {
		if os.Getenv(envVar) == "" {
			slog.Warn("[Feedback] env var not set, using default — set this for fork/enterprise deployments",
				"envVar", envVar, "default", defaultVal)
		}
	}

	return FeedbackConfig{
		GitHubToken:   githubToken,
		WebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		RepoOwner:     getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
		RepoName:      getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
