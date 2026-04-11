package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupMissionsTest creates a fresh Fiber app and a MissionsHandler with routes registered.
func setupMissionsTest() (*fiber.App, *MissionsHandler) {
	app := fiber.New()
	handler := NewMissionsHandler()
	handler.RegisterRoutes(app.Group("/api/missions"))
	handler.RegisterPublicRoutes(app.Group("/api/missions"))
	return app, handler
}

// ---------- BrowseConsoleKB ----------

func TestMissions_BrowseConsoleKB_Success(t *testing.T) {
	mockBody := `[{"name":"mission1.yaml","type":"file"},{"name":"subdir","type":"dir"}]`
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/repos/kubestellar/console-kb/contents/missions")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/browse?path=missions", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var items []map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &items))
	assert.Len(t, items, 2)
	assert.Equal(t, "mission1.yaml", items[0]["name"])
}

func TestMissions_BrowseConsoleKB_NoPath(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// When no path is provided, the URL path should end with /contents/
		assert.Contains(t, r.URL.Path, "/repos/kubestellar/console-kb/contents/")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`[{"name":"README.md","type":"file"}]`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/browse", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- ValidateMission ----------

func TestMissions_ValidateMission_ValidMission(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"apiVersion":"kc-mission-v1","kind":"Mission","metadata":{"name":"test-mission"},"spec":{"description":"A test mission"}}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["valid"])
}

func TestMissions_ValidateMission_InvalidMission(t *testing.T) {
	app, _ := setupMissionsTest()

	// Missing apiVersion, kind, metadata.name
	payload := `{"apiVersion":"wrong","spec":{}}`
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
	errs, ok := body["errors"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(errs), 2, "should have at least 2 validation errors")
}

func TestMissions_ValidateMission_EmptyBody(t *testing.T) {
	app, _ := setupMissionsTest()

	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(""))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, false, body["valid"])
}

func TestMissions_ValidateMission_TooLarge(t *testing.T) {
	// Use a Fiber app with a large enough body limit so the request reaches our handler
	app := fiber.New(fiber.Config{
		BodyLimit: missionsMaxBodyBytes + 1024,
	})
	handler := NewMissionsHandler()
	handler.RegisterRoutes(app.Group("/api/missions"))

	largePayload := strings.Repeat("x", missionsMaxBodyBytes+1)
	req, err := http.NewRequest("POST", "/api/missions/validate", strings.NewReader(largePayload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	// Handler returns 413 for payload too large
	assert.True(t, resp.StatusCode == http.StatusRequestEntityTooLarge || resp.StatusCode == http.StatusBadRequest,
		"expected 413 or 400, got %d", resp.StatusCode)
}

// ---------- ShareToSlack ----------

func TestMissions_ShareToSlack_Success(t *testing.T) {
	slackMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer slackMock.Close()

	app, handler := setupMissionsTest()
	// The handler validates that webhook starts with https://hooks.slack.com/
	// so we need to override the httpClient to redirect that URL to our mock.
	handler.httpClient = slackMock.Client()

	// Since the handler validates the webhook URL prefix, we need to use a
	// transport that redirects to our mock.
	transport := &mockTransport{handler: func(req *http.Request) (*http.Response, error) {
		// Redirect any request to our mock server
		req.URL.Scheme = "http"
		req.URL.Host = strings.TrimPrefix(slackMock.URL, "http://")
		return http.DefaultTransport.RoundTrip(req)
	}}
	handler.httpClient = &http.Client{Transport: transport}

	payload := `{"webhookUrl":"https://hooks.slack.com/services/T00/B00/xxx","text":"Hello from mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["success"])
}

func TestMissions_ShareToSlack_InvalidWebhook(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"webhookUrl":"https://evil.com/webhook","text":"Hello"}`
	req, err := http.NewRequest("POST", "/api/missions/share/slack", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- ShareToGitHub ----------

func TestMissions_ShareToGitHub_NoToken(t *testing.T) {
	app, _ := setupMissionsTest()

	payload := `{"repo":"kubestellar/console","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestMissions_ShareToGitHub_Success(t *testing.T) {
	requestLog := map[string]int{}
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.Contains(r.URL.Path, "/forks"):
			requestLog["fork"]++
			json.NewEncoder(w).Encode(map[string]interface{}{
				"full_name": "testuser/console",
			})
		case strings.Contains(r.URL.Path, "/git/ref/heads/main"):
			requestLog["get_ref"]++
			json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]string{"sha": "abc123def456"},
			})
		case strings.Contains(r.URL.Path, "/git/refs"):
			requestLog["ref"]++
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{"ref": "refs/heads/test-branch"})
		case strings.Contains(r.URL.Path, "/contents/"):
			requestLog["commit"]++
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{"content": map[string]string{"sha": "abc123"}})
		case strings.Contains(r.URL.Path, "/pulls"):
			requestLog["pr"]++
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"html_url": "https://github.com/kubestellar/console/pull/42",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	payload := `{"repo":"kubestellar/console","filePath":"missions/test.yaml","content":"dGVzdA==","branch":"mission-test","message":"add mission"}`
	req, err := http.NewRequest("POST", "/api/missions/share/github", strings.NewReader(payload))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Token", "ghp_test123")
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.Equal(t, true, body["success"])
	assert.Equal(t, "https://github.com/kubestellar/console/pull/42", body["pr_url"])
	assert.Equal(t, "testuser/console", body["fork"])

	// Verify all steps were called
	assert.Equal(t, 1, requestLog["fork"])
	assert.Equal(t, 1, requestLog["ref"])
	assert.Equal(t, 1, requestLog["commit"])
	assert.Equal(t, 1, requestLog["pr"])
}

// ---------- GetMissionFile ----------

func TestMissions_GetMissionFile_Success(t *testing.T) {
	fileContent := "apiVersion: kc-mission-v1\nkind: Mission\nmetadata:\n  name: test\n"
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/kubestellar/console-kb/master/missions/example.yaml")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fileContent))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/file?path=missions/example.yaml", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, fileContent, string(body))
}

func TestMissions_GetMissionFile_NotFound(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("404: Not Found"))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/file?path=missions/nonexistent.yaml", nil)
	require.NoError(t, err)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- Cache behavior ----------

func TestMissions_BrowseConsoleKB_CacheHit(t *testing.T) {
	// Track how many times GitHub is called
	var callCount atomic.Int32
	mockBody := `[{"name":"cached.yaml","type":"file"}]`
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(mockBody))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	// First request — should call GitHub (MISS)
	req1, err := http.NewRequest("GET", "/api/missions/browse?path=fixes", nil)
	require.NoError(t, err)
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	assert.Equal(t, "MISS", resp1.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load(), "first request should call GitHub")

	// Second request — should serve from cache (HIT), NOT call GitHub again
	req2, err := http.NewRequest("GET", "/api/missions/browse?path=fixes", nil)
	require.NoError(t, err)
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
	assert.Equal(t, "HIT", resp2.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load(), "second request should NOT call GitHub (cache hit)")

	// Verify response body is correct on cache hit
	body, _ := io.ReadAll(resp2.Body)
	var items []map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &items))
	assert.Len(t, items, 1)
	assert.Equal(t, "cached.yaml", items[0]["name"])
}

func TestMissions_GetMissionFile_CacheHit(t *testing.T) {
	var callCount atomic.Int32
	fileContent := `{"missions": [{"path": "test.json", "title": "Test"}]}`
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount.Add(1)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fileContent))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	// First request — MISS
	req1, err := http.NewRequest("GET", "/api/missions/file?path=fixes/index.json", nil)
	require.NoError(t, err)
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	assert.Equal(t, "MISS", resp1.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load())

	// Second request — HIT
	req2, err := http.NewRequest("GET", "/api/missions/file?path=fixes/index.json", nil)
	require.NoError(t, err)
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
	assert.Equal(t, "HIT", resp2.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load(), "cached file should not re-fetch from GitHub")

	body, _ := io.ReadAll(resp2.Body)
	assert.Equal(t, fileContent, string(body))
}

func TestMissions_BrowseConsoleKB_RateLimitServesStaleCache(t *testing.T) {
	var requestCount atomic.Int32
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := requestCount.Add(1)
		if count == 1 {
			// First call succeeds
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`[{"name":"stale.yaml","type":"file"}]`))
		} else {
			// Second call returns rate limit
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte(`{"message":"API rate limit exceeded"}`))
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	// First request — populate the cache
	req1, err := http.NewRequest("GET", "/api/missions/browse?path=stale-test", nil)
	require.NoError(t, err)
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	// Expire the fresh cache by setting fetchedAt into the past
	handler.cache.mu.Lock()
	for _, entry := range handler.cache.entries {
		entry.fetchedAt = time.Now().Add(-missionsCacheTTL - time.Second)
	}
	handler.cache.mu.Unlock()

	// Second request — GitHub returns 403, should serve stale cache
	req2, err := http.NewRequest("GET", "/api/missions/browse?path=stale-test", nil)
	require.NoError(t, err)
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode, "rate-limited request should serve stale cache with 200")
	assert.Equal(t, "STALE", resp2.Header.Get("X-Cache"))

	body, _ := io.ReadAll(resp2.Body)
	var items []map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &items))
	assert.Len(t, items, 1)
	assert.Equal(t, "stale.yaml", items[0]["name"])
}

func TestMissions_GetMissionFile_RateLimitServesStaleCache(t *testing.T) {
	var requestCount atomic.Int32
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := requestCount.Add(1)
		if count == 1 {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"title":"cached mission"}`))
		} else {
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`rate limited`))
		}
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	// Populate cache
	req1, err := http.NewRequest("GET", "/api/missions/file?path=test/mission.json", nil)
	require.NoError(t, err)
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	// Expire fresh cache
	handler.cache.mu.Lock()
	for _, entry := range handler.cache.entries {
		entry.fetchedAt = time.Now().Add(-missionsCacheTTL - time.Second)
	}
	handler.cache.mu.Unlock()

	// Rate-limited request should serve stale
	req2, err := http.NewRequest("GET", "/api/missions/file?path=test/mission.json", nil)
	require.NoError(t, err)
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
	assert.Equal(t, "STALE", resp2.Header.Get("X-Cache"))

	body, _ := io.ReadAll(resp2.Body)
	assert.Equal(t, `{"title":"cached mission"}`, string(body))
}

func TestMissions_CacheEviction(t *testing.T) {
	cache := &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)}

	// Fill cache to capacity
	for i := 0; i < missionsCacheMaxEntries; i++ {
		cache.set(
			strings.Repeat("k", i+1), // unique keys
			&missionsCacheEntry{
				body:      []byte("test"),
				fetchedAt: time.Now().Add(time.Duration(i) * time.Second),
			},
		)
	}
	assert.Len(t, cache.entries, missionsCacheMaxEntries)

	// Adding one more should evict the oldest (key "k")
	cache.set("new-key", &missionsCacheEntry{
		body:      []byte("new"),
		fetchedAt: time.Now(),
	})
	assert.Len(t, cache.entries, missionsCacheMaxEntries, "cache should not exceed max entries")

	// The oldest entry (key "k") should be evicted
	assert.Nil(t, cache.get("k", time.Hour), "oldest entry should have been evicted")
	assert.NotNil(t, cache.get("new-key", time.Hour), "newest entry should exist")
}

// ---------- Security regression tests ----------

// TestSanitizePath_DoubleEncodedTraversal covers the #6418 regression:
// Fiber's c.Query decodes once, so a payload of %252e%252e%252f arrives at
// sanitizePath as the literal string "%2e%2e%2f". The pre-fix implementation
// used strings.Contains(rawPath, "..") and missed this because the literal
// ".." characters aren't present until a second decode happens.
func TestSanitizePath_DoubleEncodedTraversal(t *testing.T) {
	bad := []string{
		// Single-encoded traversal — rejected because we decode once inside sanitizePath
		"%2e%2e%2ftarget",
		// Double-encoded — decoded by sanitizePath to %2e%2e%2f, then cleaned to ..
		"%252e%252e%252ftarget",
		// Mixed
		"missions/%2e%2e/%2e%2e/etc/passwd",
		// Raw traversal
		"../etc/passwd",
		"foo/../../bar",
		// Backslash (decoded from %5c)
		"missions%5c..%5cetc",
		// Single literal backslash
		"missions\\file",
	}
	for _, p := range bad {
		_, err := sanitizePath(p)
		assert.Error(t, err, "expected sanitizePath to reject %q", p)
	}

	good := []string{
		"",                             // repo root
		"missions/fixes/cncf-generated", // nested path
		"fixes/kubernetes/foo.json",
		"a/b/c",
	}
	for _, p := range good {
		_, err := sanitizePath(p)
		assert.NoError(t, err, "expected sanitizePath to accept %q", p)
	}
}

// TestValidateSlackWebhookURL covers the #6416 regression: The pre-fix check
// used strings.HasPrefix to validate Slack webhook URLs, which is structural
// rather than semantic. Any URL parser quirk (userinfo, port, fragment,
// case-folding) could sneak past. The fixed version uses net/url.Parse and
// compares parsed.Hostname() to the literal allowlist entry.
func TestValidateSlackWebhookURL(t *testing.T) {
	cases := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"valid", "https://hooks.slack.com/services/T1/B1/xxx", false},
		{"empty", "", true},
		{"http not https", "http://hooks.slack.com/services/T1/B1/xxx", true},
		{"subdomain bypass", "https://hooks.slack.com.evil.example/services/x", true},
		{"userinfo smuggling", "https://hooks.slack.com@attacker.example/services/x", true},
		{"nested userinfo", "https://real:pass@hooks.slack.com/services/x", true},
		{"wrong host", "https://evil.example/services/x", true},
		{"port specified", "https://hooks.slack.com:8080/services/x", true},
		{"wrong path", "https://hooks.slack.com/not-services/x", true},
		{"missing path", "https://hooks.slack.com/", true},
		{"garbage", "not a url at all", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateSlackWebhookURL(tc.url)
			if tc.wantErr {
				assert.Error(t, err, "expected rejection for %q", tc.url)
			} else {
				assert.NoError(t, err, "expected acceptance for %q", tc.url)
			}
		})
	}
}

// TestMissionsCache_ByteCap covers the #6417 regression. The pre-fix cache
// bounded only the entry count (missionsCacheMaxEntries), allowing an
// attacker to pack 256 slots with up to ~10 MiB of body each, pushing
// several GiB of resident memory. The fixed version evicts oldest entries
// until both the entry-count AND the byte-size caps are satisfied.
func TestMissionsCache_ByteCap(t *testing.T) {
	cache := &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)}

	// entrySize chosen so that ~10 entries would blow the 256 MiB cap.
	// 30 MiB each * 10 = 300 MiB > 256 MiB cap.
	const entrySize = 30 * 1024 * 1024
	const numEntries = 10
	body := make([]byte, entrySize)

	for i := 0; i < numEntries; i++ {
		cache.set(
			// deterministic unique keys
			"k-"+string(rune('a'+i)),
			&missionsCacheEntry{
				body:      body,
				fetchedAt: time.Now().Add(time.Duration(i) * time.Second),
			},
		)
	}

	// totalBytes must not exceed the cap.
	assert.LessOrEqual(t, cache.totalBytes, missionsCacheMaxBytes,
		"cache totalBytes should respect missionsCacheMaxBytes")

	// At entrySize=30 MiB and cap=256 MiB, at most 8 entries can fit
	// (8 * 30 = 240). The earliest entries should have been evicted.
	maxFit := missionsCacheMaxBytes / entrySize
	assert.LessOrEqual(t, len(cache.entries), maxFit,
		"cache should have evicted down to what fits in the byte cap")
	assert.NotNil(t, cache.get("k-"+string(rune('a'+numEntries-1)), time.Hour),
		"newest entry should survive byte-cap eviction")
	assert.Nil(t, cache.get("k-a", time.Hour),
		"oldest entry should have been evicted by byte cap")
}

// TestMissionsCache_ByteCapRejectsOversizeEntry ensures a single entry
// larger than the whole cap is rejected rather than evicting everything.
func TestMissionsCache_ByteCapRejectsOversizeEntry(t *testing.T) {
	cache := &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)}
	cache.set("small", &missionsCacheEntry{body: []byte("abc"), fetchedAt: time.Now()})

	huge := make([]byte, missionsCacheMaxBytes+1)
	cache.set("huge", &missionsCacheEntry{body: huge, fetchedAt: time.Now()})

	assert.NotNil(t, cache.get("small", time.Hour), "small entry should survive")
	assert.Nil(t, cache.get("huge", time.Hour), "oversize entry should be rejected")
}

// ---------- Helpers ----------

// mockTransport is a http.RoundTripper that delegates to a handler function.
type mockTransport struct {
	handler func(*http.Request) (*http.Response, error)
}

func (t *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return t.handler(req)
}
