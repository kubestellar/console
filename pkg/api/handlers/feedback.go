package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// githubAPITimeout is the timeout for HTTP requests to the GitHub API.
const githubAPITimeout = 10 * time.Second

// FeedbackHandler handles feature requests and feedback
type FeedbackHandler struct {
	store         store.Store
	githubToken   string
	webhookSecret string
	repoOwner     string
	repoName      string
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
	return &FeedbackHandler{
		store:         s,
		githubToken:   cfg.GitHubToken,
		webhookSecret: cfg.WebhookSecret,
		repoOwner:     cfg.RepoOwner,
		repoName:      cfg.RepoName,
	}
}

// CreateFeatureRequest creates a new feature request and GitHub issue
func (h *FeedbackHandler) CreateFeatureRequest(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var input models.CreateFeatureRequestInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate input
	if input.Title == "" || len(input.Title) < 5 {
		return fiber.NewError(fiber.StatusBadRequest, "Title must be at least 5 characters")
	}
	if input.Description == "" || len(input.Description) < 10 {
		return fiber.NewError(fiber.StatusBadRequest, "Description must be at least 10 characters")
	}
	if input.RequestType != models.RequestTypeBug && input.RequestType != models.RequestTypeFeature {
		return fiber.NewError(fiber.StatusBadRequest, "Request type must be 'bug' or 'feature'")
	}

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
		Status:      models.RequestStatusOpen,
	}

	if err := h.store.CreateFeatureRequest(request); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create feature request")
	}

	// Create GitHub issue
	if h.githubToken != "" && h.repoOwner != "" && h.repoName != "" {
		issueNumber, issueURL, err := h.createGitHubIssue(request, user)
		if err != nil {
			log.Printf("Failed to create GitHub issue: %v", err)
			// Continue anyway - issue creation is best-effort
		} else {
			request.GitHubIssueNumber = &issueNumber
			request.GitHubIssueURL = issueURL
			request.Status = models.RequestStatusOpen
			h.store.UpdateFeatureRequest(request)
		}
	}

	// Create notification for the user
	notifTitle := "Request Submitted"
	if request.GitHubIssueNumber != nil {
		notifTitle = fmt.Sprintf("Issue #%d Created", *request.GitHubIssueNumber)
	}
	notification := &models.Notification{
		UserID:           userID,
		FeatureRequestID: &request.ID,
		NotificationType: models.NotificationTypeIssueCreated,
		Title:            notifTitle,
		Message:          fmt.Sprintf("Your %s request '%s' has been submitted.", request.RequestType, request.Title),
		ActionURL:        request.GitHubIssueURL,
	}
	h.store.CreateNotification(notification)

	return c.Status(fiber.StatusCreated).JSON(request)
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
		log.Printf("Failed to fetch GitHub issues: %v", err)
		// Fall back to local database if GitHub fetch fails
		return h.listLocalFeatureRequests(c, userID)
	}

	// Fetch linked PRs for all issues
	linkedPRs := h.fetchLinkedPRs(issues)

	// Convert to queue items
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
			case "fix-ready", "copilot/fix-ready", "ai-pr-ready", "ai-pr-draft":
				status = "fix_ready"
			case "fix-complete", "ai-processing-complete":
				status = "fix_complete"
			case "unable-to-fix", "needs-human-review", "ai-needs-human":
				status = "unable_to_fix"
			case "bug":
				requestType = "bug"
			case "enhancement", "feature":
				requestType = "feature"
			}
		}

		// Check for linked PR - if we have one, at minimum it's fix_ready
		var prNumber int
		var prURL string
		var previewURL string
		var copilotSessionURL string
		if pr, ok := linkedPRs[issue.Number]; ok {
			prNumber = pr.Number
			prURL = pr.HTMLURL
			// Build preview URL using KubeStellar domain
			previewURL = fmt.Sprintf("https://deploy-preview-%d.console-deploy-preview.kubestellar.io", pr.Number)
			copilotSessionURL = pr.HTMLURL
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
			PreviewURL:        previewURL,
			CopilotSessionURL: copilotSessionURL,
			ClosedByUser:      closedByUser,
			CreatedAt:         issue.CreatedAt,
			UpdatedAt:         issue.UpdatedAt,
		})
	}

	return c.JSON(queueItems)
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

// fetchLinkedPRs fetches PRs that are linked to the given issues
func (h *FeedbackHandler) fetchLinkedPRs(issues []GitHubIssue) map[int]GitHubPR {
	result := make(map[int]GitHubPR)
	if h.githubToken == "" || h.repoOwner == "" || h.repoName == "" {
		return result
	}

	// Build issue number set for quick lookup
	issueNumbers := make(map[int]bool)
	for _, issue := range issues {
		issueNumbers[issue.Number] = true
	}

	// Match PRs to issues by looking for "Fixes #N", "Closes #N", or "Fixes owner/repo#N" in PR body
	fixesPattern := regexp.MustCompile(`(?i)(?:fixes|closes|resolves)\s+(?:[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)?#(\d+)`)

	// Fetch both open and closed PRs (closed includes merged)
	for _, state := range []string{"open", "closed"} {
		url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls?state=%s&per_page=50&sort=updated&direction=desc",
			h.repoOwner, h.repoName, state)

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			continue
		}

		req.Header.Set("Authorization", "Bearer "+h.githubToken)
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		client := &http.Client{Timeout: githubAPITimeout}
		resp, err := client.Do(req)
		if err != nil {
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			continue
		}

		var prs []GitHubPR
		if err := json.NewDecoder(resp.Body).Decode(&prs); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()

		for _, pr := range prs {
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
	}

	return result
}

// fetchGitHubIssues fetches issues created by the given user from the configured GitHub repo
func (h *FeedbackHandler) fetchGitHubIssues(githubLogin string) ([]GitHubIssue, error) {
	if h.githubToken == "" || h.repoOwner == "" || h.repoName == "" {
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

	req.Header.Set("Authorization", "Bearer "+h.githubToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	var issues []GitHubIssue
	if err := json.NewDecoder(resp.Body).Decode(&issues); err != nil {
		return nil, err
	}

	// Filter out pull requests (GitHub API returns PRs as issues)
	filtered := make([]GitHubIssue, 0, len(issues))
	for _, issue := range issues {
		// PRs have a pull_request field, but our struct doesn't include it
		// So we check if the URL contains /pull/
		if issue.HTMLURL != "" && !bytes.Contains([]byte(issue.HTMLURL), []byte("/pull/")) {
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

		// Close the GitHub issue
		if h.githubToken != "" {
			go h.closeGitHubIssue(issueNum)
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
	if h.githubToken != "" && request.GitHubIssueNumber != nil {
		go h.closeGitHubIssue(*request.GitHubIssueNumber)
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

		// Add a comment to the GitHub issue requesting an update
		if h.githubToken != "" {
			go h.addIssueComment(issueNum, "The user has requested an update on this issue.")
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
	if h.githubToken != "" && request.GitHubIssueNumber != nil {
		go h.addIssueComment(*request.GitHubIssueNumber, "The user has requested an update on this issue.")
	}

	return c.JSON(request)
}

// closeGitHubIssue closes an issue on GitHub
func (h *FeedbackHandler) closeGitHubIssue(issueNumber int) {
	payload := map[string]string{"state": "closed"}
	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d",
		h.repoOwner, h.repoName, issueNumber)

	req, err := http.NewRequest("PATCH", url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to create close issue request: %v", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.githubToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to close GitHub issue: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("GitHub API returned %d when closing issue: %s", resp.StatusCode, string(body))
	}
}

// addIssueComment adds a comment to a GitHub issue
func (h *FeedbackHandler) addIssueComment(issueNumber int, comment string) {
	payload := map[string]string{"body": comment}
	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments",
		h.repoOwner, h.repoName, issueNumber)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to create issue comment request: %v", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.githubToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to add issue comment: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("GitHub API returned %d when adding comment: %s", resp.StatusCode, string(body))
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
	if h.githubToken != "" && request.PRNumber != nil {
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
	// Verify webhook signature if secret is configured
	if h.webhookSecret != "" {
		signature := c.Get("X-Hub-Signature-256")
		if !h.verifyWebhookSignature(c.Body(), signature) {
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid webhook signature")
		}
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

// ensureFeatureRequestExists looks up or creates a DB record for a GitHub issue.
// This bridges issues created externally (via GitHub UI/API) with the Console's
// notification system. Returns the request and whether it was newly created.
func (h *FeedbackHandler) ensureFeatureRequestExists(issueNumber int, issue map[string]interface{}) (*models.FeatureRequest, bool, error) {
	// Check if record already exists
	request, err := h.store.GetFeatureRequestByIssueNumber(issueNumber)
	if err == nil && request != nil {
		return request, false, nil
	}

	// Extract issue data
	issueURL, _ := issue["html_url"].(string)
	title, _ := issue["title"].(string)
	body, _ := issue["body"].(string)

	// Determine request type from labels
	requestType := models.RequestTypeFeature
	labels, _ := issue["labels"].([]interface{})
	for _, l := range labels {
		if lm, ok := l.(map[string]interface{}); ok {
			if name, _ := lm["name"].(string); name == "bug" {
				requestType = models.RequestTypeBug
			}
		}
	}

	// Try to find the Console user by GitHub ID
	var userID uuid.UUID
	if user, _ := issue["user"].(map[string]interface{}); user != nil {
		if ghID, ok := user["id"].(float64); ok {
			if dbUser, _ := h.store.GetUserByGitHubID(fmt.Sprintf("%d", int(ghID))); dbUser != nil {
				userID = dbUser.ID
			}
		}
	}
	// If no matching Console user, use a nil UUID (system-created)
	if userID == uuid.Nil {
		userID = uuid.MustParse("00000000-0000-0000-0000-000000000000")
	}

	request = &models.FeatureRequest{
		UserID:            userID,
		Title:             title,
		Description:       body,
		RequestType:       requestType,
		GitHubIssueNumber: &issueNumber,
		GitHubIssueURL:    issueURL,
		Status:            models.RequestStatusOpen,
	}

	if err := h.store.CreateFeatureRequest(request); err != nil {
		log.Printf("[Webhook] Failed to create feature request for issue #%d: %v", issueNumber, err)
		return nil, false, err
	}

	log.Printf("[Webhook] Created DB record for external issue #%d (user=%s)", issueNumber, userID)
	return request, true, nil
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

	issueNumber := int(issue["number"].(float64))
	issueURL, _ := issue["html_url"].(string)

	log.Printf("[Webhook] Issue #%d %s", issueNumber, action)

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

		// Handle pipeline label transitions
		if info, ok := pipelineLabels[labelName]; ok {
			request, created, err := h.ensureFeatureRequestExists(issueNumber, issue)
			if err != nil || request == nil {
				return nil
			}

			h.store.UpdateFeatureRequestStatus(request.ID, info.status)

			// Create notification (skip if we just auto-created the record — avoid duplicate "created" noise)
			if !created || info.notifType != models.NotificationTypeIssueCreated {
				h.createNotification(
					request.UserID,
					&request.ID,
					info.notifType,
					fmt.Sprintf("Issue #%d: %s", issueNumber, info.message),
					info.message,
					issueURL,
				)
			}
			return nil
		}

		// Handle ai-fix-requested label — ensure DB record exists
		if labelName == "ai-fix-requested" {
			request, created, err := h.ensureFeatureRequestExists(issueNumber, issue)
			if err != nil || request == nil {
				return nil
			}
			if created {
				h.createNotification(
					request.UserID,
					&request.ID,
					models.NotificationTypeIssueCreated,
					fmt.Sprintf("Issue #%d Tracked", issueNumber),
					"This issue is now being tracked for AI processing.",
					issueURL,
				)
			}
			return nil
		}
	}

	// Handle issue opened with ai-fix-requested label — auto-create record
	if action == "opened" {
		labels, _ := issue["labels"].([]interface{})
		for _, l := range labels {
			if lm, ok := l.(map[string]interface{}); ok {
				if name, _ := lm["name"].(string); name == "ai-fix-requested" {
					_, _, _ = h.ensureFeatureRequestExists(issueNumber, issue)
					break
				}
			}
		}
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
		log.Printf("[Webhook] Feature request not found for issue #%d", issueNumber)
		return nil
	}

	// If there's already a PR, don't update - the PR webhook will handle it
	if request.PRNumber != nil {
		return nil
	}

	// Update status to unable to fix (needs human review)
	h.store.UpdateFeatureRequestStatus(request.ID, models.RequestStatusUnableToFix)

	// Get the most recent bot comment to summarize the status
	summary := h.getLatestBotComment(issueNumber)
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

// getLatestBotComment fetches the most recent bot comment from the issue
func (h *FeedbackHandler) getLatestBotComment(issueNumber int) string {
	if h.githubToken == "" {
		return ""
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments?per_page=10&sort=created&direction=desc",
		h.repoOwner, h.repoName, issueNumber)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}

	req.Header.Set("Authorization", "Bearer "+h.githubToken)
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

	prNumber := int(pr["number"].(float64))
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
			log.Printf("[Webhook] Error getting feature request %s: %v", requestID, err)
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
				log.Printf("[Webhook] PR #%d linked to feature request via issue #%d", prNumber, issueNum)
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
		log.Printf("[Webhook] PR #%d has ai-generated label but no linked feature request", prNumber)
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

	log.Printf("[Webhook] PR #%d %s for request %s", prNumber, action, requestID)
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

	log.Printf("[Webhook] Deployment success for PR #%d: %s", prNumber, targetURL)

	// Find feature request by PR number and update preview URL
	request, err := h.store.GetFeatureRequestByPRNumber(prNumber)
	if err != nil || request == nil {
		log.Printf("[Webhook] No feature request found for PR #%d", prNumber)
		return nil
	}

	// Update preview URL
	if err := h.store.UpdateFeatureRequestPreview(request.ID, targetURL); err != nil {
		log.Printf("[Webhook] Failed to update preview URL: %v", err)
		return err
	}

	// Notify user that preview is ready
	h.createNotification(request.UserID, &request.ID, models.NotificationTypePreviewReady,
		fmt.Sprintf("Preview Ready for PR #%d", prNumber),
		fmt.Sprintf("A preview for '%s' is now available.", request.Title),
		targetURL)

	log.Printf("[Webhook] Updated preview URL for request %s: %s", request.ID, targetURL)
	return nil
}

// createGitHubIssue creates an issue on GitHub
func (h *FeedbackHandler) createGitHubIssue(request *models.FeatureRequest, user *models.User) (int, string, error) {
	// Determine labels based on request type
	labels := []string{"ai-fix-requested", "needs-triage"}
	if request.RequestType == models.RequestTypeBug {
		labels = append(labels, "bug")
	} else {
		labels = append(labels, "enhancement")
	}

	issueBody := fmt.Sprintf(`## User Request

**Type:** %s
**Submitted by:** @%s
**Console Request ID:** %s

## Description

%s

---
*This issue was automatically created from the KubeStellar Console.*
`, request.RequestType, user.GitHubLogin, request.ID.String(), request.Description)

	payload := map[string]interface{}{
		"title":  request.Title,
		"body":   issueBody,
		"labels": labels,
	}

	jsonData, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues", h.repoOwner, h.repoName)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return 0, "", err
	}

	req.Header.Set("Authorization", "Bearer "+h.githubToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return 0, "", fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
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
	jsonData, _ := json.Marshal(payload)

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments",
		h.repoOwner, h.repoName, *request.PRNumber)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("Failed to create PR comment request: %v", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.githubToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: githubAPITimeout}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to add PR comment: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("GitHub API returned %d when adding PR comment: %s", resp.StatusCode, string(body))
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
		log.Printf("Failed to create notification: %v", err)
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

// LoadFeedbackConfigFromEnv loads feedback configuration from environment
func LoadFeedbackConfigFromEnv() FeedbackConfig {
	return FeedbackConfig{
		GitHubToken:   os.Getenv("FEEDBACK_GITHUB_TOKEN"),
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
