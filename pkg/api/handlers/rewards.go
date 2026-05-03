package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/rewards"
	"github.com/kubestellar/console/pkg/settings"
)

// Point values for GitHub contributions
const (
	rewardsCacheTTL         = 10 * time.Minute
	rewardsAPITimeout       = 30 * time.Second
	rewardsPerPage          = 100              // GitHub max per page
	rewardsMaxPages         = 100              // REST Issues API supports up to 10,000 per repo
	rewardsMaxItems         = 10_000           // Hard cap on total items across all pages
	maxRewardsResponseBytes = 10 * 1024 * 1024 // 10 MiB cap on GitHub API responses
	maxRewardsTotalItems    = 10_000           // Hard cap on total items across all repos
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
	repos       []string // e.g. ["kubestellar/console", "kubestellar/console-kb"]
	httpClient  *http.Client

	mu    sync.RWMutex
	cache map[string]*rewardsCacheEntry // keyed by github_login

	evictMu  sync.Mutex
	evictCtx context.Context
	evictFn  context.CancelFunc
}

// parseRepos extracts "owner/repo" pairs from the org filter string.
// Accepts both "repo:owner/name" and "org:owner" tokens.
// Org-level tokens are not expanded (no API call); only explicit repo
// tokens are used.
func parseRepos(orgs string) []string {
	var repos []string
	for _, token := range strings.Fields(orgs) {
		if strings.HasPrefix(token, "repo:") {
			repos = append(repos, strings.TrimPrefix(token, "repo:"))
		}
	}
	return repos
}

// NewRewardsHandler creates a handler for GitHub activity rewards.
func NewRewardsHandler(cfg RewardsConfig) *RewardsHandler {
	return &RewardsHandler{
		githubToken: cfg.GitHubToken,
		repos:       parseRepos(cfg.Orgs),
		httpClient:  &http.Client{Timeout: rewardsAPITimeout},
		cache:       make(map[string]*rewardsCacheEntry),
	}
}

// GetGitHubRewards returns the logged-in user's GitHub contribution rewards.
// GET /api/rewards/github
func (h *RewardsHandler) GetGitHubRewards(c *fiber.Ctx) error {
	h.startEviction()

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
	yearStart := fmt.Sprintf("%d-01-01T00:00:00Z", time.Now().Year())

	contributions := make([]GitHubContribution, 0)
	var fetchErr error

	for _, repo := range h.repos {
		items, err := h.listRepoItems(repo, login, yearStart, token)
		if err != nil {
			slog.Error("[rewards] failed to list items", "repo", repo, "user", login, "error", err)
			fetchErr = fmt.Errorf("list %s failed: %w", repo, err)
			continue
		}
		for _, item := range items {
			if item.PullRequest != nil {
				contributions = append(contributions, classifyPR(item)...)
			} else {
				contributions = append(contributions, classifyIssue(item))
			}
		}
	}

	if fetchErr != nil && len(contributions) == 0 {
		return nil, fetchErr
	}

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

// searchItem is the subset of GitHub REST issue/PR item we care about.
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
	// User is the issue/PR author — used to filter results from the REST
	// Issues API which returns all issues, not just those by a given author.
	User *searchUser `json:"user,omitempty"`
}

type searchUser struct {
	Login string `json:"login"`
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

// listRepoItems fetches all issues+PRs by a user in a single repo using
// the REST Issues API (no 1,000-result cap like the Search API).
// sinceISO is an ISO-8601 timestamp; only items updated on or after this
// time are returned. Items created before sinceISO are filtered out
// client-side (the API's `since` param filters by updated_at, not created_at).
func (h *RewardsHandler) listRepoItems(repo, login, sinceISO, token string) ([]searchItem, error) {
	allItems := make([]searchItem, 0, rewardsPerPage)

	for page := 1; page <= rewardsMaxPages; page++ {
		apiURL := fmt.Sprintf("https://api.github.com/repos/%s/issues?state=all&per_page=%d&page=%d&sort=created&direction=desc&since=%s",
			repo, rewardsPerPage, page, sinceISO)

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

		body, err := io.ReadAll(io.LimitReader(resp.Body, maxRewardsResponseBytes))
		resp.Body.Close()

		if err != nil {
			return allItems, fmt.Errorf("read body: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			return allItems, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
		}

		var pageItems []searchItem
		if err := json.Unmarshal(body, &pageItems); err != nil {
			return allItems, fmt.Errorf("unmarshal: %w", err)
		}

		for i := range pageItems {
			item := &pageItems[i]
			if item.User == nil || !strings.EqualFold(item.User.Login, login) {
				continue
			}
			if item.CreatedAt < sinceISO {
				continue
			}
			item.RepoURL = "https://api.github.com/repos/" + repo
			allItems = append(allItems, *item)
			if len(allItems) >= maxRewardsTotalItems {
				slog.Warn("[rewards] total items cap reached", "repo", repo, "login", login, "cap", maxRewardsTotalItems)
				return allItems, nil
			}
		}

		if len(pageItems) < rewardsPerPage {
			break
		}
		if len(allItems) >= rewardsMaxItems {
			slog.Warn("[rewards] hit max items cap", "repo", repo, "user", login, "count", len(allItems))
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

// startEviction begins a background goroutine that evicts expired cache entries
// every 5 minutes. Must be called exactly once, typically from GetGitHubRewards().
func (h *RewardsHandler) startEviction() {
	h.evictMu.Lock()
	defer h.evictMu.Unlock()

	if h.evictCtx != nil {
		return // Already running
	}

	h.evictCtx, h.evictFn = context.WithCancel(context.Background())
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				h.mu.RLock()
				now := time.Now()
				var staleKeys []string
				for login, entry := range h.cache {
					if now.Sub(entry.fetchedAt) > rewardsCacheTTL {
						staleKeys = append(staleKeys, login)
					}
				}
				h.mu.RUnlock()
				if len(staleKeys) > 0 {
					h.mu.Lock()
					for _, login := range staleKeys {
						if entry, ok := h.cache[login]; ok && now.Sub(entry.fetchedAt) > rewardsCacheTTL {
							delete(h.cache, login)
						}
					}
					h.mu.Unlock()
				}
			case <-h.evictCtx.Done():
				return
			}
		}
	}()
}

// StopEviction stops the background eviction goroutine. Call during graceful shutdown.
func (h *RewardsHandler) StopEviction() {
	h.evictMu.Lock()
	defer h.evictMu.Unlock()

	if h.evictFn != nil {
		h.evictFn()
		h.evictCtx = nil
	}
}
