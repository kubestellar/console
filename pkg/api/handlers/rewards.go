package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
)

// Point values for GitHub contributions
const (
	pointsBugIssue     = 300
	pointsFeatureIssue = 100
	pointsOtherIssue   = 50
	pointsPROpened     = 200
	pointsPRMerged     = 500
	rewardsCacheTTL    = 10 * time.Minute
	rewardsAPITimeout  = 30 * time.Second
	rewardsPerPage     = 100 // GitHub max per page
	rewardsMaxPages    = 10  // GitHub search max 1000 results
)

// RewardsConfig holds configuration for the rewards handler.
type RewardsConfig struct {
	GitHubToken string // PAT with public_repo scope
	Orgs        string // GitHub search org filter, e.g. "org:kubestellar org:llm-d"
}

// GitHubContribution represents a single scored contribution.
type GitHubContribution struct {
	Type      string `json:"type"`       // issue_bug, issue_feature, issue_other, pr_opened, pr_merged
	Title     string `json:"title"`      // Issue/PR title
	URL       string `json:"url"`        // GitHub URL
	Repo      string `json:"repo"`       // owner/repo
	Number    int    `json:"number"`     // Issue/PR number
	Points    int    `json:"points"`     // Points awarded
	CreatedAt string `json:"created_at"` // ISO 8601
}

// RewardsBreakdown summarizes counts by category.
type RewardsBreakdown struct {
	BugIssues     int `json:"bug_issues"`
	FeatureIssues int `json:"feature_issues"`
	OtherIssues   int `json:"other_issues"`
	PRsOpened     int `json:"prs_opened"`
	PRsMerged     int `json:"prs_merged"`
}

// GitHubRewardsResponse is the API response.
type GitHubRewardsResponse struct {
	TotalPoints   int                  `json:"total_points"`
	Contributions []GitHubContribution `json:"contributions"`
	Breakdown     RewardsBreakdown     `json:"breakdown"`
	CachedAt      string               `json:"cached_at"`
	FromCache     bool                 `json:"from_cache"`
}

type rewardsCacheEntry struct {
	response  *GitHubRewardsResponse
	fetchedAt time.Time
}

// RewardsHandler serves GitHub-sourced reward data.
type RewardsHandler struct {
	githubToken string
	orgs        string
	httpClient  *http.Client

	mu    sync.RWMutex
	cache map[string]*rewardsCacheEntry // keyed by github_login
}

// NewRewardsHandler creates a handler for GitHub activity rewards.
func NewRewardsHandler(cfg RewardsConfig) *RewardsHandler {
	return &RewardsHandler{
		githubToken: cfg.GitHubToken,
		orgs:        cfg.Orgs,
		httpClient:  &http.Client{Timeout: rewardsAPITimeout},
		cache:       make(map[string]*rewardsCacheEntry),
	}
}

// GetGitHubRewards returns the logged-in user's GitHub contribution rewards.
// GET /api/rewards/github
func (h *RewardsHandler) GetGitHubRewards(c *fiber.Ctx) error {
	githubLogin := middleware.GetGitHubLogin(c)
	if githubLogin == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "GitHub login not available"})
	}

	// Check cache
	h.mu.RLock()
	if entry, ok := h.cache[githubLogin]; ok && time.Since(entry.fetchedAt) < rewardsCacheTTL {
		h.mu.RUnlock()
		resp := *entry.response
		resp.FromCache = true
		return c.JSON(resp)
	}
	h.mu.RUnlock()

	// Cache miss — fetch from GitHub
	resp, err := h.fetchUserRewards(githubLogin)
	if err != nil {
		log.Printf("[rewards] Failed to fetch GitHub rewards for %s: %v", githubLogin, err)

		// Return stale cache if available
		h.mu.RLock()
		if entry, ok := h.cache[githubLogin]; ok {
			h.mu.RUnlock()
			stale := *entry.response
			stale.FromCache = true
			return c.JSON(stale)
		}
		h.mu.RUnlock()

		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub API unavailable"})
	}

	// Update cache
	h.mu.Lock()
	h.cache[githubLogin] = &rewardsCacheEntry{
		response:  resp,
		fetchedAt: time.Now(),
	}
	h.mu.Unlock()

	return c.JSON(resp)
}

func (h *RewardsHandler) fetchUserRewards(login string) (*GitHubRewardsResponse, error) {
	var contributions []GitHubContribution

	// 1. Fetch issues authored by user
	issues, err := h.searchItems(login, "issue")
	if err != nil {
		log.Printf("[rewards] Warning: failed to search issues for %s: %v", login, err)
	} else {
		for _, item := range issues {
			c := classifyIssue(item)
			contributions = append(contributions, c)
		}
	}

	// 2. Fetch PRs authored by user
	prs, err := h.searchItems(login, "pr")
	if err != nil {
		log.Printf("[rewards] Warning: failed to search PRs for %s: %v", login, err)
	} else {
		for _, item := range prs {
			cs := classifyPR(item)
			contributions = append(contributions, cs...)
		}
	}

	// Compute totals
	total := 0
	breakdown := RewardsBreakdown{}
	for _, c := range contributions {
		total += c.Points
		switch c.Type {
		case "issue_bug":
			breakdown.BugIssues++
		case "issue_feature":
			breakdown.FeatureIssues++
		case "issue_other":
			breakdown.OtherIssues++
		case "pr_opened":
			breakdown.PRsOpened++
		case "pr_merged":
			breakdown.PRsMerged++
		}
	}

	return &GitHubRewardsResponse{
		TotalPoints:   total,
		Contributions: contributions,
		Breakdown:     breakdown,
		CachedAt:      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// searchItem is the subset of GitHub Search issue/PR item we care about.
type searchItem struct {
	Title       string            `json:"title"`
	HTMLURL     string            `json:"html_url"`
	Number      int               `json:"number"`
	CreatedAt   string            `json:"created_at"`
	Labels      []searchLabel     `json:"labels"`
	PullRequest *searchPRRef      `json:"pull_request,omitempty"`
	RepoURL     string            `json:"repository_url"` // e.g. https://api.github.com/repos/kubestellar/console
}

type searchLabel struct {
	Name string `json:"name"`
}

type searchPRRef struct {
	MergedAt *string `json:"merged_at,omitempty"`
}

type searchResponse struct {
	TotalCount int          `json:"total_count"`
	Items      []searchItem `json:"items"`
}

// searchItems queries GitHub Search API with pagination.
// itemType is "issue" or "pr".
func (h *RewardsHandler) searchItems(login, itemType string) ([]searchItem, error) {
	query := fmt.Sprintf("author:%s %s type:%s", login, h.orgs, itemType)
	var allItems []searchItem

	for page := 1; page <= rewardsMaxPages; page++ {
		apiURL := fmt.Sprintf("https://api.github.com/search/issues?q=%s&per_page=%d&page=%d&sort=created&order=desc",
			url.QueryEscape(query), rewardsPerPage, page)

		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return allItems, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		if h.githubToken != "" {
			req.Header.Set("Authorization", "Bearer "+h.githubToken)
		}

		resp, err := h.httpClient.Do(req)
		if err != nil {
			return allItems, fmt.Errorf("execute request: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return allItems, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
		}

		if err != nil {
			return allItems, fmt.Errorf("read body: %w", err)
		}

		var sr searchResponse
		if err := json.Unmarshal(body, &sr); err != nil {
			return allItems, fmt.Errorf("unmarshal: %w", err)
		}

		allItems = append(allItems, sr.Items...)

		// Stop if we've fetched all results or hit the page limit
		if len(allItems) >= sr.TotalCount || len(sr.Items) < rewardsPerPage {
			break
		}
	}

	return allItems, nil
}

// classifyIssue determines the issue type based on labels.
func classifyIssue(item searchItem) GitHubContribution {
	typ := "issue_other"
	points := pointsOtherIssue

	for _, label := range item.Labels {
		switch label.Name {
		case "bug", "kind/bug", "type/bug":
			typ = "issue_bug"
			points = pointsBugIssue
		case "enhancement", "feature", "kind/feature", "type/feature":
			typ = "issue_feature"
			points = pointsFeatureIssue
		}
	}

	return GitHubContribution{
		Type:      typ,
		Title:     item.Title,
		URL:       item.HTMLURL,
		Repo:      extractRepo(item.RepoURL),
		Number:    item.Number,
		Points:    points,
		CreatedAt: item.CreatedAt,
	}
}

// classifyPR returns one or two contributions: pr_opened (always) + pr_merged (if merged).
func classifyPR(item searchItem) []GitHubContribution {
	repo := extractRepo(item.RepoURL)
	result := []GitHubContribution{
		{
			Type:      "pr_opened",
			Title:     item.Title,
			URL:       item.HTMLURL,
			Repo:      repo,
			Number:    item.Number,
			Points:    pointsPROpened,
			CreatedAt: item.CreatedAt,
		},
	}

	if item.PullRequest != nil && item.PullRequest.MergedAt != nil {
		result = append(result, GitHubContribution{
			Type:      "pr_merged",
			Title:     item.Title,
			URL:       item.HTMLURL,
			Repo:      repo,
			Number:    item.Number,
			Points:    pointsPRMerged,
			CreatedAt: *item.PullRequest.MergedAt,
		})
	}

	return result
}

// extractRepo parses "kubestellar/console" from "https://api.github.com/repos/kubestellar/console".
func extractRepo(repoURL string) string {
	const prefix = "https://api.github.com/repos/"
	if len(repoURL) > len(prefix) {
		return repoURL[len(prefix):]
	}
	return repoURL
}
