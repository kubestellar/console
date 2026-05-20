package handlers

import (
	"bytes"
	"context"
	"encoding/json"
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
	httpclient "github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/models"
)

// docsRepoName is the GitHub repository name for console documentation issues.
const docsRepoName = "docs"

var fixesPatternRe = regexp.MustCompile(`(?i)(?:fixes|closes|resolves)\s+(?:[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+)?#(\d+)`)

// GitHubPR represents a pull request from the GitHub API.
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

// notifyUpstream creates the GitHub issue and returns issue details.
func (h *FeedbackHandler) notifyUpstream(ctx context.Context, request *models.FeatureRequest, user *models.User, targetRepoName string, input *models.CreateFeatureRequestInput, clientAuth string) (int, string, []string, screenshotUploadResult, error) {
	return h.createGitHubIssueInRepo(ctx, request, user, h.repoOwner, targetRepoName, input.Screenshots, input.ConsoleErrors, input.FailedApiCalls, input.Diagnostics, input.ParentIssueNumber, clientAuth)
}

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

// addIssueLabels adds labels to a GitHub issue in the specified repo.
// Logs failures but does not return errors so label failures don't block the request.
func (h *FeedbackHandler) addIssueLabels(ctx context.Context, issueNumber int, repoName string, labels []string) {
	if len(labels) == 0 {
		return
	}

	payload := map[string]interface{}{
		"labels": labels,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		slog.Warn("[Feedback] failed to marshal labels payload", "issue", issueNumber, "error", err)
		return
	}

	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d/labels",
		resolveGitHubAPIBase(), h.repoOwner, repoName, issueNumber)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(jsonData))
	if err != nil {
		slog.Warn("[Feedback] failed to create add labels request", "issue", issueNumber, "error", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+h.getEffectiveToken())
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		slog.Warn("[Feedback] failed to add labels to issue", "issue", issueNumber, "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		if readErr != nil {
			body = []byte("(failed to read response body)")
		}
		slog.Warn("[Feedback] GitHub API returned error adding labels", "issue", issueNumber, "status", resp.StatusCode, "body", string(body))
		return
	}

	slog.Info("[Feedback] labels added to issue", "issue", issueNumber, "labels", labels)
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
	for _, pr := range allPRs {
		matches := fixesPatternRe.FindAllStringSubmatch(pr.Body, -1)
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
		client = httpclient.GitHub
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
