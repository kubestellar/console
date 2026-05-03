package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- badge-test helpers ----------

// badgeMockTransport is a race-safe HTTP transport that creates a fresh
// response body on every call (unlike mockRoundTripper which reuses a
// single *http.Response and exhausts the body after the first read).
type badgeMockTransport struct {
	mu       sync.Mutex
	bodies   map[string]string        // URL → body template
	statuses map[string]int           // URL → status code
	delays   map[string]time.Duration // URL → simulated latency
	calls    map[string]int           // URL → call count
}

func (m *badgeMockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	url := req.URL.String()

	m.mu.Lock()
	m.calls[url]++
	status := m.statuses[url]
	body := m.bodies[url]
	delay := m.delays[url]
	m.mu.Unlock()

	if delay > 0 {
		time.Sleep(delay)
	}

	if body == "" && status == 0 {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     make(http.Header),
		}, nil
	}
	if status == 0 {
		status = http.StatusOK
	}
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}, nil
}

func (m *badgeMockTransport) totalCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, c := range m.calls {
		n += c
	}
	return n
}

func (m *badgeMockTransport) callsFor(url string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls[url]
}

// setupBadgeMock replaces acmmHTTPClient with a mock transport.
// repos lists the repo slugs that may have background recompute goroutines;
// cleanup blocks until all their computing flags clear, preventing a DATA
// RACE on the client pointer.
func setupBadgeMock(t *testing.T, repos ...string) *badgeMockTransport {
	m := &badgeMockTransport{
		bodies:   make(map[string]string),
		statuses: make(map[string]int),
		delays:   make(map[string]time.Duration),
		calls:    make(map[string]int),
	}
	oldClient := acmmHTTPClient
	acmmHTTPClient = &http.Client{Transport: m}
	t.Cleanup(func() {
		// Wait for background recomputeBadge goroutines to finish so we
		// don't race on the acmmHTTPClient pointer.
		waitForBadgeRecompute(repos, 5*time.Second)
		acmmHTTPClient = oldClient
	})
	return m
}

// waitForBadgeRecompute polls the cache entries for the given repos and
// blocks until none of them have computing==true (or the timeout expires).
func waitForBadgeRecompute(repos []string, timeout time.Duration) {
	deadline := time.After(timeout)
	for {
		allDone := true
		for _, r := range repos {
			raw, ok := badgeCache.Load(r)
			if !ok {
				continue
			}
			e := raw.(*badgeCacheEntry)
			e.mu.Lock()
			c := e.computing
			e.mu.Unlock()
			if c {
				allDone = false
				break
			}
		}
		if allDone {
			return
		}
		select {
		case <-deadline:
			return
		case <-time.After(20 * time.Millisecond):
		}
	}
}

// clearBadgeCache removes all entries from the global badge cache.
func clearBadgeCache() {
	badgeCache.Range(func(key, _ any) bool {
		badgeCache.Delete(key)
		return true
	})
}

// mockGitHubTree builds repo-info and tree JSON strings for the given files.
func mockGitHubTree(filePaths []string) (repoJSON, treeJSON string) {
	repoJSON = `{"default_branch":"main"}`
	entries := make([]string, 0, len(filePaths))
	for _, p := range filePaths {
		entries = append(entries, fmt.Sprintf(`{"path":%q,"type":"blob"}`, p))
	}
	treeJSON = fmt.Sprintf(`{"tree":[%s]}`, strings.Join(entries, ","))
	return
}

// seedBadgeCache pre-populates the cache, back-dated by age.
func seedBadgeCache(repo string, badge *shieldsEndpointBadge, age time.Duration) {
	entry := &badgeCacheEntry{
		badge:    badge,
		cachedAt: time.Now().Add(-age),
	}
	badgeCache.Store(repo, entry)
}

// parseBadgeJSON decodes a Fiber test response into a shieldsEndpointBadge.
func parseBadgeJSON(t *testing.T, resp *http.Response) shieldsEndpointBadge {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	var badge shieldsEndpointBadge
	require.NoError(t, json.Unmarshal(body, &badge), "body: %s", string(body))
	return badge
}

func newBadgeApp() *fiber.App {
	app := fiber.New()
	app.Get("/api/acmm/badge", ACMMBadgeHandler)
	return app
}

// l2TreePaths satisfies L2: one instruction file + prompts-catalog + editor.
func l2TreePaths() []string {
	return []string{
		".github/copilot-instructions.md",
		".github/prompts/foo.prompt.md",
		".editorconfig",
	}
}

// mockRepoEndpoints registers the two GitHub API endpoints for a repo slug.
func mockRepoEndpoints(m *badgeMockTransport, repo, repoJSON, treeJSON string) {
	m.bodies[fmt.Sprintf("https://api.github.com/repos/%s", repo)] = repoJSON
	m.bodies[fmt.Sprintf("https://api.github.com/repos/%s/git/trees/main?recursive=1", repo)] = treeJSON
}

// ---------- Tests ----------

func TestACMMBadge_CacheMiss(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-miss"
	mock := setupBadgeMock(t, repo)

	repoJSON, treeJSON := mockGitHubTree(l2TreePaths())
	mockRepoEndpoints(mock, repo, repoJSON, treeJSON)

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	badge := parseBadgeJSON(t, resp)
	assert.Equal(t, 1, badge.SchemaVersion)
	assert.Equal(t, "ACMM", badge.Label)
	assert.Contains(t, badge.Message, "L")

	// Verify cache was populated
	raw, ok := badgeCache.Load(repo)
	assert.True(t, ok, "cache should contain entry for repo")
	entry := raw.(*badgeCacheEntry)
	entry.mu.Lock()
	assert.NotNil(t, entry.badge)
	entry.mu.Unlock()
}

func TestACMMBadge_CacheHit(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-hit"
	mock := setupBadgeMock(t, repo)

	seedBadgeCache(repo, &shieldsEndpointBadge{
		SchemaVersion: 1, Label: "ACMM",
		Message: "L3 · Measured · 5/10", Color: "yellowgreen",
	}, 10*time.Minute) // fresh

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	badge := parseBadgeJSON(t, resp)
	assert.Equal(t, "L3 · Measured · 5/10", badge.Message)

	assert.Equal(t, 0, mock.totalCalls(), "no GitHub calls expected on cache hit")
}

func TestACMMBadge_CacheExpiry(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-expiry"
	mock := setupBadgeMock(t, repo)

	seedBadgeCache(repo, &shieldsEndpointBadge{
		SchemaVersion: 1, Label: "ACMM",
		Message: "L1 · Assisted · 0/20", Color: "lightgrey",
	}, badgeCacheTTL+5*time.Minute)

	repoJSON, treeJSON := mockGitHubTree(l2TreePaths())
	mockRepoEndpoints(mock, repo, repoJSON, treeJSON)

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// Stale entry served immediately (stale-while-revalidate)
	badge := parseBadgeJSON(t, resp)
	assert.Equal(t, "L1 · Assisted · 0/20", badge.Message)

	// Wait for background goroutine to recompute
	waitForBadgeRecompute([]string{repo}, 3*time.Second)

	assert.Greater(t, mock.totalCalls(), 0, "GitHub API should be called to recompute expired entry")
}

func TestACMMBadge_StaleWhileRevalidate(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-swr"
	mock := setupBadgeMock(t, repo)

	staleMsg := "L2 · Instructed · 2/20"
	seedBadgeCache(repo, &shieldsEndpointBadge{
		SchemaVersion: 1, Label: "ACMM", Message: staleMsg, Color: "yellow",
	}, badgeCacheTTL+1*time.Minute)

	repoJSON, treeJSON := mockGitHubTree(l2TreePaths())
	mockRepoEndpoints(mock, repo, repoJSON, treeJSON)
	mock.mu.Lock()
	mock.delays[fmt.Sprintf("https://api.github.com/repos/%s", repo)] = 200 * time.Millisecond
	mock.mu.Unlock()

	app := newBadgeApp()

	start := time.Now()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	elapsed := time.Since(start)
	require.NoError(t, err)

	// Response should be immediate (stale value), not blocked by background
	assert.Less(t, elapsed, 150*time.Millisecond, "stale response should be immediate")

	badge := parseBadgeJSON(t, resp)
	assert.Equal(t, staleMsg, badge.Message, "should return stale cached value")

	// Wait for the background goroutine to finish and update the cache
	waitForBadgeRecompute([]string{repo}, 3*time.Second)

	raw, _ := badgeCache.Load(repo)
	entry := raw.(*badgeCacheEntry)
	entry.mu.Lock()
	updatedMsg := entry.badge.Message
	entry.mu.Unlock()
	assert.NotEqual(t, staleMsg, updatedMsg, "cache should be refreshed in background")
}

func TestACMMBadge_ConcurrentRequests(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-concurrent"
	mock := setupBadgeMock(t, repo)

	repoJSON, treeJSON := mockGitHubTree(l2TreePaths())
	mockRepoEndpoints(mock, repo, repoJSON, treeJSON)
	repoURL := fmt.Sprintf("https://api.github.com/repos/%s", repo)
	mock.mu.Lock()
	mock.delays[repoURL] = 100 * time.Millisecond
	mock.mu.Unlock()

	app := newBadgeApp()

	const numRequests = 10
	var wg sync.WaitGroup
	wg.Add(numRequests)
	results := make([]*http.Response, numRequests)
	errs := make([]error, numRequests)

	for i := 0; i < numRequests; i++ {
		go func(idx int) {
			defer wg.Done()
			r := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
			results[idx], errs[idx] = app.Test(r, -1)
		}(i)
	}
	wg.Wait()

	for i := 0; i < numRequests; i++ {
		require.NoError(t, errs[i], "request %d should not error", i)
		assert.Equal(t, http.StatusOK, results[i].StatusCode, "request %d", i)
	}

	// Only one goroutine should have called the GitHub API
	assert.LessOrEqual(t, mock.callsFor(repoURL), 1,
		"concurrent requests should not all trigger a scan")
}

func TestACMMBadge_GitHubFailure_WithCache(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-fail-cached"
	mock := setupBadgeMock(t, repo)

	cachedMsg := "L4 · Adaptive · 12/20"
	seedBadgeCache(repo, &shieldsEndpointBadge{
		SchemaVersion: 1, Label: "ACMM", Message: cachedMsg, Color: "brightgreen",
	}, badgeCacheTTL+10*time.Minute) // expired

	// GitHub returns 500
	mock.mu.Lock()
	mock.statuses[fmt.Sprintf("https://api.github.com/repos/%s", repo)] = 500
	mock.bodies[fmt.Sprintf("https://api.github.com/repos/%s", repo)] = `{"message":"internal error"}`
	mock.mu.Unlock()

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	badge := parseBadgeJSON(t, resp)
	assert.Equal(t, cachedMsg, badge.Message, "should serve stale cache when GitHub fails")
}

func TestACMMBadge_GitHubFailure_NoCache(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-fail-nocache"
	mock := setupBadgeMock(t, repo)

	mock.mu.Lock()
	mock.statuses[fmt.Sprintf("https://api.github.com/repos/%s", repo)] = 500
	mock.bodies[fmt.Sprintf("https://api.github.com/repos/%s", repo)] = `{"message":"internal error"}`
	mock.mu.Unlock()

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	badge := parseBadgeJSON(t, resp)
	assert.Equal(t, "computing...", badge.Message, "should return fallback badge")
	assert.Equal(t, "blue", badge.Color)
}

func TestACMMBadge_CacheControlHeaders(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-hdr-cc"
	mock := setupBadgeMock(t, repo)

	repoJSON, treeJSON := mockGitHubTree(l2TreePaths())
	mockRepoEndpoints(mock, repo, repoJSON, treeJSON)

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	assert.Equal(t, "public, max-age=3600, stale-while-revalidate=86400",
		resp.Header.Get("Cache-Control"))
}

func TestACMMBadge_CORSHeaders(t *testing.T) {
	clearBadgeCache()
	repo := "org/badge-hdr-cors"
	mock := setupBadgeMock(t, repo)

	repoJSON, treeJSON := mockGitHubTree(l2TreePaths())
	mockRepoEndpoints(mock, repo, repoJSON, treeJSON)

	app := newBadgeApp()
	req := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repo, nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)

	assert.Equal(t, "*", resp.Header.Get("Access-Control-Allow-Origin"))
}

func TestACMMBadge_DifferentRepos(t *testing.T) {
	clearBadgeCache()
	repoA := "org/badge-diff-a"
	repoB := "org/badge-diff-b"
	_ = setupBadgeMock(t, repoA, repoB)

	// Seed two repos with different cache values (both fresh)
	seedBadgeCache(repoA, &shieldsEndpointBadge{
		SchemaVersion: 1, Label: "ACMM",
		Message: "L3 · Measured · 5/10", Color: "yellowgreen",
	}, 10*time.Minute)
	seedBadgeCache(repoB, &shieldsEndpointBadge{
		SchemaVersion: 1, Label: "ACMM",
		Message: "L1 · Assisted · 0/20", Color: "lightgrey",
	}, 10*time.Minute)

	app := newBadgeApp()

	reqA := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repoA, nil)
	respA, err := app.Test(reqA, -1)
	require.NoError(t, err)
	badgeA := parseBadgeJSON(t, respA)

	reqB := httptest.NewRequest(http.MethodGet, "/api/acmm/badge?repo="+repoB, nil)
	respB, err := app.Test(reqB, -1)
	require.NoError(t, err)
	badgeB := parseBadgeJSON(t, respB)

	// Each repo returns its own cached badge independently
	assert.Equal(t, "L3 · Measured · 5/10", badgeA.Message)
	assert.Equal(t, "L1 · Assisted · 0/20", badgeB.Message)
	assert.NotEqual(t, badgeA.Message, badgeB.Message,
		"different repos should get independent cache entries")
}
