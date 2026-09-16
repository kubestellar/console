package missions

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
	req.Host = "localhost"
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
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- ValidateMission ----------

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
	req1.Host = "localhost"
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	assert.Equal(t, "MISS", resp1.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load(), "first request should call GitHub")

	// Second request — should serve from cache (HIT), NOT call GitHub again
	req2, err := http.NewRequest("GET", "/api/missions/browse?path=fixes", nil)
	require.NoError(t, err)
	req2.Host = "localhost"
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
	req1.Host = "localhost"
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
	req2.Host = "localhost"
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

func TestMissions_BrowseConsoleKB_EmbeddedFallback(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`unavailable`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubAPIURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/browse?path=subdir", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "EMBEDDED", resp.Header.Get("X-Cache"))

	body, _ := io.ReadAll(resp.Body)
	var items []map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &items))
	assert.NotEmpty(t, items)

	names := make([]string, 0, len(items))
	for _, item := range items {
		name, _ := item["name"].(string)
		names = append(names, name)
	}
	assert.Contains(t, names, "nested.txt")
}

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
	req.Host = "localhost"
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
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- Cache behavior ----------

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
	req1.Host = "localhost"
	resp1, err := app.Test(req1, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	assert.Equal(t, "MISS", resp1.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load())

	// Second request — HIT
	req2, err := http.NewRequest("GET", "/api/missions/file?path=fixes/index.json", nil)
	require.NoError(t, err)
	req2.Host = "localhost"
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
	assert.Equal(t, "HIT", resp2.Header.Get("X-Cache"))
	assert.Equal(t, int32(1), callCount.Load(), "cached file should not re-fetch from GitHub")

	body, _ := io.ReadAll(resp2.Body)
	assert.Equal(t, fileContent, string(body))
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
	req1.Host = "localhost"
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
	req2.Host = "localhost"
	resp2, err := app.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
	assert.Equal(t, "STALE", resp2.Header.Get("X-Cache"))

	body, _ := io.ReadAll(resp2.Body)
	assert.Equal(t, `{"title":"cached mission"}`, string(body))
}

func TestMissions_GetMissionFile_EmbeddedFallback(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`unavailable`))
	}))
	defer mock.Close()

	app, handler := setupMissionsTest()
	handler.githubRawURL = mock.URL

	req, err := http.NewRequest("GET", "/api/missions/file?path=subdir/nested.txt", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "EMBEDDED", resp.Header.Get("X-Cache"))

	body, _ := io.ReadAll(resp.Body)
	assert.NotEmpty(t, body)
}
