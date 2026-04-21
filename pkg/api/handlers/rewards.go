package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/rewards"
	"github.com/kubestellar/console/pkg/settings"
)

// Point values for GitHub contributions
const (
	rewardsCacheTTL   = 10 * time.Minute
	rewardsAPITimeout = 30 * time.Second
	rewardsPerPage    = 100 // GitHub max per page
	rewardsMaxPages   = 10  // GitHub search max 1000 results
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
	if entry, ok := h.cache[githubLogin]; ok && time.Since(entry.fetchedAt) < rewardsCacheTTL && entry.response != nil {
		h.mu.RUnlock()
		resp := *entry.response
		resp.FromCache = true
		return c.JSON(resp)
	}
	h.mu.RUnlock()

	// Resolve token: prefer user's personal token from settings, fall back to server PAT
	token := h.resolveToken()

	// Cache miss — fetch from GitHub
	resp, err := h.fetchUserRewards(githubLogin, token)
	if err != nil {
		slog.Error("[rewards] failed to fetch GitHub rewards", "user", githubLogin, "error", err)

		// Return stale cache if available
		h.mu.RLock()
		if entry, ok := h.cache[githubLogin]; ok && entry.response != nil {
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

// resolveToken returns the best available GitHub token.
func (h *RewardsHandler) resolveToken() string {
	token := h.githubToken
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
			token = all.FeedbackGitHubToken
		}
	}
	return token
}

func (h *RewardsHandler) fetchUserRewards(login, token string) (*GitHubRewardsResponse, error) {
	contributions := make([]GitHubContribution, 0)
	var fetchErr error

	// 1. Fetch issues authored by user
	issues, err := h.searchItems(login, "issue", token)
	if err != nil {
		slog.Error("[rewards] failed to search issues", "user", login, "error", err)
		fetchErr = fmt.Errorf("issue search failed: %w", err)
	} else {
		for _, item := range issues {
			c := classifyIssue(item)
			contributions = append(contributions, c)
		}
	}

	// 2. Fetch PRs authored by user
	prs, err := h.searchItems(login, "pr", token)
	if err != nil {
		slog.Error("[rewards] failed to search PRs", "user", login, "error", err)
		fetchErr = fmt.Errorf("PR search failed: %w", err)
	} else {
		for _, item := range prs {
			cs := classifyPR(item)
			contributions = append(contributions, cs...)
		}
	}

	// If either search failed, return error so caller falls back to stale cache
	// instead of caching partial results
	if fetchErr != nil {
		return nil, fetchErr
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
	Title   string `json:"title"`
	HTMLURL string `json:"html_url"`
	Number  int    `json:"number"`
	// CreatedAt is ISO-8601 — parsed by the rewards classifier to decide
	// whether to enforce GitHub App attribution (issues created before
	// the enforcement cutoff are grandfathered to keep the pre-App
	// reward tier).
	CreatedAt   string        `json:"created_at"`
	Labels      []searchLabel `json:"labels"`
	PullRequest *searchPRRef  `json:"pull_request,omitempty"`
	RepoURL     string        `json:"repository_url"` // e.g. https://api.github.com/repos/kubestellar/console
	// PerformedViaGitHubApp is GitHub-set and identifies which App (if
	// any) authored the issue. Unforgeable by regular users — GitHub
	// populates it server-side based on the credentials that made the
	// create call. For console-submitted issues, slug is
	// DefaultConsoleAppSlug (see github_app_auth.go). For issues opened
	// directly on github.com, this field is nil.
	PerformedViaGitHubApp *searchApp `json:"performed_via_github_app,omitempty"`
}

type searchApp struct {
	Slug string `json:"slug"`
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
func (h *RewardsHandler) searchItems(login, itemType, token string) ([]searchItem, error) {
	// Scope to current year only — matches the leaderboard at kubestellar.io/leaderboard
	yearStart := fmt.Sprintf("%d-01-01", time.Now().Year())
	query := fmt.Sprintf("author:%s %s type:%s created:>=%s", login, h.orgs, itemType, yearStart)
	allItems := make([]searchItem, 0)

	for page := 1; page <= rewardsMaxPages; page++ {
		apiURL := fmt.Sprintf("https://api.github.com/search/issues?q=%s&per_page=%d&page=%d&sort=created&order=desc",
			url.QueryEscape(query), rewardsPerPage, page)

		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return allItems, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}

		resp, err := h.httpClient.Do(req)
		if err != nil {
			return allItems, fmt.Errorf("execute request: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			return allItems, fmt.Errorf("read body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return allItems, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
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

// attributionEnforcementCutoffEnv is the env var that flips on GitHub
// App attribution enforcement for the rewards classifier. The value is
// an RFC 3339 timestamp; only issues created STRICTLY AFTER this time
// require performed_via_github_app.slug == kubestellar-console-bot to
// get the console-tier reward (300/100 pts). Issues created before the
// cutoff are grandfathered at their label-derived points.
//
// Rollout:
//
//	Phase 1 (this PR, post-merge): leave env var unset. Behavior is
//	  identical to before — every bug label = 300 pts, every feature
//	  label = 100 pts, regardless of where the issue was created.
//	  Console issues start getting App attribution baked in.
//	Phase 2 (after soak time): set CONSOLE_APP_ATTRIBUTION_CUTOFF to
//	  the merge timestamp. From that moment forward, new github.com
//	  issues drop to 50 pts; new console issues stay at 300/100.
const attributionEnforcementCutoffEnv = "CONSOLE_APP_ATTRIBUTION_CUTOFF"

// isConsoleAppSubmitted returns true when the issue was created by the
// kubestellar-console-bot GitHub App. GitHub sets
// performed_via_github_app server-side based on the credentials that
// made the create call — unforgeable by regular users.
func isConsoleAppSubmitted(item searchItem) bool {
	if item.PerformedViaGitHubApp == nil {
		return false
	}
	return item.PerformedViaGitHubApp.Slug == ExpectedAppSlug()
}

// requiresAppAttribution reports whether this issue is subject to the
// App-attribution gate. Returns false for issues created before the
// cutoff (grandfathered) and when the cutoff is not configured
// (Phase 1 rollout: no enforcement).
func requiresAppAttribution(createdAt string) bool {
	cutoffStr := os.Getenv(attributionEnforcementCutoffEnv)
	if cutoffStr == "" {
		return false
	}
	cutoff, err := time.Parse(time.RFC3339, cutoffStr)
	if err != nil {
		slog.Warn("[rewards] invalid "+attributionEnforcementCutoffEnv+" — enforcement disabled", "value", cutoffStr, "error", err)
		return false
	}
	created, err := time.Parse(time.RFC3339, createdAt)
	if err != nil {
		// Malformed issue timestamps are rare but non-fatal; default to
		// grandfathering so we don't accidentally drop points on legit issues.
		return false
	}
	return created.After(cutoff)
}

// classifyIssue determines the issue type and point value. After the
// App-attribution cutoff, bug/feature labels only award console-tier
// points when the issue was authored by the kubestellar-console-bot App.
// Before the cutoff, all labels are awarded at their full rate.
func classifyIssue(item searchItem) GitHubContribution {
	typ := "issue_other"
	points := rewards.PointsOtherIssue

	// Attribution gate: after the cutoff, only App-created issues get
	// the console-tier point values. See requiresAppAttribution.
	enforce := requiresAppAttribution(item.CreatedAt)
	consoleSubmitted := isConsoleAppSubmitted(item)

	for _, label := range item.Labels {
		switch label.Name {
		case "bug", "kind/bug", "type/bug":
			typ = "issue_bug"
			if !enforce || consoleSubmitted {
				points = rewards.PointsBugIssue
			}
			// else: keep pointsOtherIssue (50) — github.com submission after cutoff
		case "enhancement", "feature", "kind/feature", "type/feature":
			typ = "issue_feature"
			if !enforce || consoleSubmitted {
				points = rewards.PointsFeatureIssue
			}
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
			Points:    rewards.PointsPROpened,
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
			Points:    rewards.PointsPRMerged,
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

// Leaderboard data is now generated by a daily GitHub Action in the docs repo
// (kubestellar/docs) and served as a static page at kubestellar.io/leaderboard.
