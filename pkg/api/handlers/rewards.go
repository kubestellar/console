package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/settings"
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

	leaderboardCacheTTL     = 24 * time.Hour  // leaderboard refreshes once per day
	contributorCacheTTL     = 15 * time.Minute // per-user detail cache
	leaderboardDefaultLimit = 5                // default number of leaderboard entries
	leaderboardMaxLimit     = 25               // max entries per request
	contributorsMaxFetch    = 50               // max contributors from GitHub API per repo
	prDetailMaxFetch        = 20               // max PRs to inspect for avg stats
	roundingFactor          = 10.0             // multiplier for rounding to 1 decimal place
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

// LeaderboardEntry represents one contributor's ranking.
type LeaderboardEntry struct {
	Login       string           `json:"login"`
	AvatarURL   string           `json:"avatar_url"`
	TotalPoints int              `json:"total_points"`
	Rank        int              `json:"rank"`
	Breakdown   RewardsBreakdown `json:"breakdown"`
	Level       string           `json:"level"`
	LevelRank   int              `json:"level_rank"`
}

// LeaderboardResponse wraps the leaderboard entries with cache metadata.
type LeaderboardResponse struct {
	Entries   []LeaderboardEntry `json:"entries"`
	CachedAt  string             `json:"cached_at"`
	FromCache bool               `json:"from_cache"`
}

// ContributorStats provides detailed per-contributor metrics.
type ContributorStats struct {
	Login             string               `json:"login"`
	AvatarURL         string               `json:"avatar_url"`
	TotalPoints       int                  `json:"total_points"`
	Breakdown         RewardsBreakdown     `json:"breakdown"`
	Level             string               `json:"level"`
	LevelRank         int                  `json:"level_rank"`
	AvgPRIterations   float64              `json:"avg_pr_iterations"`
	AvgPRTimeHours    float64              `json:"avg_pr_time_hours"`
	FirstContribution string               `json:"first_contribution"`
	MostActiveRepo    string               `json:"most_active_repo"`
	TotalPRs          int                  `json:"total_prs"`
	TotalIssues       int                  `json:"total_issues"`
	Contributions     []GitHubContribution `json:"contributions"`
	CachedAt          string               `json:"cached_at"`
	FromCache         bool                 `json:"from_cache"`
}

type leaderboardCacheEntry struct {
	response  *LeaderboardResponse
	fetchedAt time.Time
}

type contributorCacheEntry struct {
	response  *ContributorStats
	fetchedAt time.Time
}

// contributorLevel maps point thresholds to level names (mirrors frontend CONTRIBUTOR_LEVELS).
type contributorLevel struct {
	rank     int
	name     string
	minCoins int
}

// contributorLevels is sorted ascending by minCoins, mirroring the frontend ladder.
var contributorLevels = []contributorLevel{
	{rank: 1, name: "Observer", minCoins: 0},
	{rank: 2, name: "Explorer", minCoins: 500},
	{rank: 3, name: "Navigator", minCoins: 2000},
	{rank: 4, name: "Pilot", minCoins: 5000},
	{rank: 5, name: "Commander", minCoins: 15000},
	{rank: 6, name: "Captain", minCoins: 50000},
	{rank: 7, name: "Admiral", minCoins: 150000},
	{rank: 8, name: "Legend", minCoins: 500000},
}

// getContributorLevelForPoints returns (levelName, levelRank) for a given points total.
func getContributorLevelForPoints(totalPoints int) (string, int) {
	level := contributorLevels[0]
	for i := len(contributorLevels) - 1; i >= 0; i-- {
		if totalPoints >= contributorLevels[i].minCoins {
			level = contributorLevels[i]
			break
		}
	}
	return level.name, level.rank
}

// RewardsHandler serves GitHub-sourced reward data.
type RewardsHandler struct {
	githubToken string
	orgs        string
	httpClient  *http.Client

	mu    sync.RWMutex
	cache map[string]*rewardsCacheEntry // keyed by github_login

	leaderboardMu    sync.RWMutex
	leaderboardCache *leaderboardCacheEntry

	contributorMu    sync.RWMutex
	contributorCache map[string]*contributorCacheEntry // keyed by github_login
}

// NewRewardsHandler creates a handler for GitHub activity rewards.
func NewRewardsHandler(cfg RewardsConfig) *RewardsHandler {
	return &RewardsHandler{
		githubToken:      cfg.GitHubToken,
		orgs:             cfg.Orgs,
		httpClient:       &http.Client{Timeout: rewardsAPITimeout},
		cache:            make(map[string]*rewardsCacheEntry),
		contributorCache: make(map[string]*contributorCacheEntry),
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

	// Resolve token: prefer user's personal token from settings, fall back to server PAT
	token := h.resolveToken()

	// Cache miss — fetch from GitHub
	resp, err := h.fetchUserRewards(githubLogin, token)
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

// resolveToken returns the best available GitHub token.
func (h *RewardsHandler) resolveToken() string {
	token := h.githubToken
	if sm := settings.GetSettingsManager(); sm != nil {
		if all, err := sm.GetAll(); err == nil && all.GitHubToken != "" {
			token = all.GitHubToken
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
		log.Printf("[rewards] Warning: failed to search issues for %s: %v", login, err)
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
		log.Printf("[rewards] Warning: failed to search PRs for %s: %v", login, err)
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
	Title       string        `json:"title"`
	HTMLURL     string        `json:"html_url"`
	Number      int           `json:"number"`
	CreatedAt   string        `json:"created_at"`
	Labels      []searchLabel `json:"labels"`
	PullRequest *searchPRRef  `json:"pull_request,omitempty"`
	RepoURL     string        `json:"repository_url"` // e.g. https://api.github.com/repos/kubestellar/console
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

// ── Leaderboard Endpoints ─────────────────────────────────────────────

// githubContributor is the response shape from GitHub's Contributors API.
type githubContributor struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
}

// githubUser is the minimal shape from GET /users/:login.
type githubUser struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
}

// prDetail is the minimal shape from GET /repos/:owner/:repo/pulls/:number.
type prDetail struct {
	CreatedAt      string `json:"created_at"`
	MergedAt       string `json:"merged_at"`
	ReviewComments int    `json:"review_comments"`
	Commits        int    `json:"commits"`
}

// parseRepoPaths extracts "owner/repo" pairs from the orgs filter string.
// Supports "repo:owner/repo" format.
func parseRepoPaths(orgs string) []string {
	var repos []string
	for _, part := range strings.Fields(orgs) {
		if strings.HasPrefix(part, "repo:") {
			repos = append(repos, strings.TrimPrefix(part, "repo:"))
		}
	}
	return repos
}

// GetLeaderboard returns the top contributors ranked by reward points.
// GET /api/rewards/leaderboard?limit=25&include=login
func (h *RewardsHandler) GetLeaderboard(c *fiber.Ctx) error {
	limit, err := strconv.Atoi(c.Query("limit", strconv.Itoa(leaderboardMaxLimit)))
	if err != nil || limit < 1 {
		limit = leaderboardMaxLimit
	}
	if limit > leaderboardMaxLimit {
		limit = leaderboardMaxLimit
	}
	includeLogin := c.Query("include") // ensure this user appears in results

	// Check cache — but invalidate if the requested user isn't present
	h.leaderboardMu.RLock()
	if h.leaderboardCache != nil && time.Since(h.leaderboardCache.fetchedAt) < leaderboardCacheTTL {
		cached := *h.leaderboardCache.response
		includeFound := includeLogin == ""
		if !includeFound {
			for _, e := range cached.Entries {
				if e.Login == includeLogin {
					includeFound = true
					break
				}
			}
		}
		if includeFound {
			h.leaderboardMu.RUnlock()
			cached.FromCache = true
			if len(cached.Entries) > limit {
				cached.Entries = cached.Entries[:limit]
			}
			return c.JSON(cached)
		}
		// Requested user not in cache — fall through to rebuild
	}
	h.leaderboardMu.RUnlock()

	token := h.resolveToken()

	// Fetch contributors from each configured repo
	repos := parseRepoPaths(h.orgs)
	contributorMap := make(map[string]string) // login -> avatar_url

	for _, repo := range repos {
		apiURL := fmt.Sprintf("https://api.github.com/repos/%s/contributors?per_page=%d",
			repo, contributorsMaxFetch)

		req, reqErr := http.NewRequest("GET", apiURL, nil)
		if reqErr != nil {
			log.Printf("[leaderboard] Failed to create request for %s: %v", repo, reqErr)
			continue
		}
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}

		resp, doErr := h.httpClient.Do(req)
		if doErr != nil {
			log.Printf("[leaderboard] Failed to fetch contributors for %s: %v", repo, doErr)
			continue
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil || resp.StatusCode != http.StatusOK {
			log.Printf("[leaderboard] GitHub API error for %s: status=%d", repo, resp.StatusCode)
			continue
		}

		var contributors []githubContributor
		if unmarshalErr := json.Unmarshal(body, &contributors); unmarshalErr != nil {
			log.Printf("[leaderboard] Failed to parse contributors for %s: %v", repo, unmarshalErr)
			continue
		}

		for _, contrib := range contributors {
			if _, exists := contributorMap[contrib.Login]; !exists {
				contributorMap[contrib.Login] = contrib.AvatarURL
			}
		}
	}

	// Ensure the requested user is included (e.g., the logged-in user)
	if includeLogin != "" {
		if _, exists := contributorMap[includeLogin]; !exists {
			avatar := h.fetchUserAvatar(includeLogin, token)
			contributorMap[includeLogin] = avatar
		}
	}

	if len(contributorMap) == 0 {
		// Fall back to stale cache
		h.leaderboardMu.RLock()
		if h.leaderboardCache != nil {
			stale := *h.leaderboardCache.response
			h.leaderboardMu.RUnlock()
			stale.FromCache = true
			if len(stale.Entries) > limit {
				stale.Entries = stale.Entries[:limit]
			}
			return c.JSON(stale)
		}
		h.leaderboardMu.RUnlock()
		return c.JSON(LeaderboardResponse{
			Entries:  []LeaderboardEntry{},
			CachedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}

	// Compute rewards for each contributor
	var entries []LeaderboardEntry
	for login, avatar := range contributorMap {
		rewards, fetchErr := h.fetchUserRewards(login, token)
		if fetchErr != nil {
			log.Printf("[leaderboard] Failed to fetch rewards for %s: %v", login, fetchErr)
			continue
		}

		levelName, levelRank := getContributorLevelForPoints(rewards.TotalPoints)
		entries = append(entries, LeaderboardEntry{
			Login:       login,
			AvatarURL:   avatar,
			TotalPoints: rewards.TotalPoints,
			Breakdown:   rewards.Breakdown,
			Level:       levelName,
			LevelRank:   levelRank,
		})
	}

	// Sort by points descending, then alphabetically by login for ties
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].TotalPoints != entries[j].TotalPoints {
			return entries[i].TotalPoints > entries[j].TotalPoints
		}
		return entries[i].Login < entries[j].Login
	})

	// Assign ranks
	for i := range entries {
		entries[i].Rank = i + 1
	}

	response := &LeaderboardResponse{
		Entries:  entries,
		CachedAt: time.Now().UTC().Format(time.RFC3339),
	}

	// Cache the full result
	h.leaderboardMu.Lock()
	h.leaderboardCache = &leaderboardCacheEntry{
		response:  response,
		fetchedAt: time.Now(),
	}
	h.leaderboardMu.Unlock()

	// Return trimmed result
	result := *response
	if len(result.Entries) > limit {
		result.Entries = result.Entries[:limit]
	}
	return c.JSON(result)
}

// GetContributorDetail returns detailed stats for a specific contributor.
// GET /api/rewards/contributor/:login
func (h *RewardsHandler) GetContributorDetail(c *fiber.Ctx) error {
	login := c.Params("login")
	if login == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "login parameter required"})
	}

	// Check cache
	h.contributorMu.RLock()
	if entry, ok := h.contributorCache[login]; ok && time.Since(entry.fetchedAt) < contributorCacheTTL {
		h.contributorMu.RUnlock()
		result := *entry.response
		result.FromCache = true
		return c.JSON(result)
	}
	h.contributorMu.RUnlock()

	token := h.resolveToken()

	// Fetch basic rewards
	rewards, err := h.fetchUserRewards(login, token)
	if err != nil {
		log.Printf("[contributor] Failed to fetch rewards for %s: %v", login, err)

		// Return stale cache if available
		h.contributorMu.RLock()
		if entry, ok := h.contributorCache[login]; ok {
			h.contributorMu.RUnlock()
			stale := *entry.response
			stale.FromCache = true
			return c.JSON(stale)
		}
		h.contributorMu.RUnlock()

		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "GitHub API unavailable"})
	}

	// Fetch avatar URL
	avatarURL := h.fetchUserAvatar(login, token)

	// Count issues and PRs
	totalIssues := rewards.Breakdown.BugIssues + rewards.Breakdown.FeatureIssues + rewards.Breakdown.OtherIssues
	totalPRs := rewards.Breakdown.PRsOpened

	// Compute PR detail stats
	avgIterations, avgTimeHours := h.computePRStats(login, token)

	// Find first contribution and most active repo
	firstContribution, mostActiveRepo := analyzeContributions(rewards.Contributions)

	levelName, levelRank := getContributorLevelForPoints(rewards.TotalPoints)

	stats := &ContributorStats{
		Login:             login,
		AvatarURL:         avatarURL,
		TotalPoints:       rewards.TotalPoints,
		Breakdown:         rewards.Breakdown,
		Level:             levelName,
		LevelRank:         levelRank,
		AvgPRIterations:   avgIterations,
		AvgPRTimeHours:    avgTimeHours,
		FirstContribution: firstContribution,
		MostActiveRepo:    mostActiveRepo,
		TotalPRs:          totalPRs,
		TotalIssues:       totalIssues,
		Contributions:     rewards.Contributions,
		CachedAt:          time.Now().UTC().Format(time.RFC3339),
	}

	// Cache the result
	h.contributorMu.Lock()
	h.contributorCache[login] = &contributorCacheEntry{
		response:  stats,
		fetchedAt: time.Now(),
	}
	h.contributorMu.Unlock()

	return c.JSON(stats)
}

// fetchUserAvatar fetches the avatar URL for a GitHub login.
func (h *RewardsHandler) fetchUserAvatar(login, token string) string {
	apiURL := fmt.Sprintf("https://api.github.com/users/%s", url.PathEscape(login))
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ""
	}

	var user githubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return ""
	}
	return user.AvatarURL
}

// computePRStats fetches merged PR details and returns (avgIterations, avgTimeHours).
func (h *RewardsHandler) computePRStats(login, token string) (float64, float64) {
	query := fmt.Sprintf("author:%s %s type:pr is:merged", login, h.orgs)
	apiURL := fmt.Sprintf("https://api.github.com/search/issues?q=%s&per_page=%d&sort=created&order=desc",
		url.QueryEscape(query), prDetailMaxFetch)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return 0, 0
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return 0, 0
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil || resp.StatusCode != http.StatusOK {
		return 0, 0
	}

	var sr searchResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		return 0, 0
	}

	if len(sr.Items) == 0 {
		return 0, 0
	}

	var totalIterations float64
	var totalHours float64
	var detailedCount int

	for _, item := range sr.Items {
		repo := extractRepo(item.RepoURL)
		prURL := fmt.Sprintf("https://api.github.com/repos/%s/pulls/%d", repo, item.Number)

		prReq, prErr := http.NewRequest("GET", prURL, nil)
		if prErr != nil {
			continue
		}
		prReq.Header.Set("Accept", "application/vnd.github.v3+json")
		if token != "" {
			prReq.Header.Set("Authorization", "Bearer "+token)
		}

		prResp, prDoErr := h.httpClient.Do(prReq)
		if prDoErr != nil {
			continue
		}
		prBody, prReadErr := io.ReadAll(prResp.Body)
		prResp.Body.Close()
		if prReadErr != nil || prResp.StatusCode != http.StatusOK {
			continue
		}

		var detail prDetail
		if unmarshalErr := json.Unmarshal(prBody, &detail); unmarshalErr != nil {
			continue
		}

		totalIterations += float64(detail.ReviewComments)

		if detail.MergedAt != "" && detail.CreatedAt != "" {
			created, errC := time.Parse(time.RFC3339, detail.CreatedAt)
			merged, errM := time.Parse(time.RFC3339, detail.MergedAt)
			if errC == nil && errM == nil {
				totalHours += merged.Sub(created).Hours()
			}
		}

		detailedCount++
		if detailedCount >= prDetailMaxFetch {
			break
		}
	}

	if detailedCount == 0 {
		return 0, 0
	}

	avgIterations := math.Round(totalIterations/float64(detailedCount)*roundingFactor) / roundingFactor
	avgHours := math.Round(totalHours/float64(detailedCount)*roundingFactor) / roundingFactor

	return avgIterations, avgHours
}

// analyzeContributions finds the earliest contribution date and most active repo.
func analyzeContributions(contributions []GitHubContribution) (string, string) {
	if len(contributions) == 0 {
		return "", ""
	}

	earliest := contributions[0].CreatedAt
	repoCounts := make(map[string]int)

	for _, c := range contributions {
		if c.CreatedAt < earliest {
			earliest = c.CreatedAt
		}
		repoCounts[c.Repo]++
	}

	mostActive := ""
	maxCount := 0
	for repo, count := range repoCounts {
		if count > maxCount {
			maxCount = count
			mostActive = repo
		}
	}

	return earliest, mostActive
}
