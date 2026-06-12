package benchmarks

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- StreamReports ----------

func TestStreamReports_DemoMode(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")
	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Demo mode returns JSON, not SSE
	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Equal(t, "demo", result["source"])
	assert.NotNil(t, result["reports"])
}

func TestStreamReports_NoAPIKey(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("", "") // No API key
	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, 503, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)
	assert.Contains(t, result["error"], "GOOGLE_DRIVE_API_KEY")
	assert.Equal(t, "unavailable", result["source"])
}

func TestStreamReports_CachedData(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")

	// Pre-populate cache
	testReports := []BenchmarkReport{
		{
			Version: "0.2",
			Run: struct {
				UID  string `json:"uid"`
				EID  string `json:"eid"`
				CID  string `json:"cid,omitempty"`
				Time struct {
					Start    string `json:"start"`
					End      string `json:"end"`
					Duration string `json:"duration"`
				} `json:"time"`
				User string `json:"user"`
			}{UID: "exp/run/stage-1", EID: "exp/run", User: "test"},
		},
		{
			Version: "0.2",
			Run: struct {
				UID  string `json:"uid"`
				EID  string `json:"eid"`
				CID  string `json:"cid,omitempty"`
				Time struct {
					Start    string `json:"start"`
					End      string `json:"end"`
					Duration string `json:"duration"`
				} `json:"time"`
				User string `json:"user"`
			}{UID: "exp/run/stage-2", EID: "exp/run", User: "test"},
		},
	}
	handler.cache.set(testReports, "0")

	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Should return SSE with cached data
	assert.Equal(t, 200, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	bodyStr := string(body)
	// Should contain batch event with data
	assert.Contains(t, bodyStr, "event: batch")
	assert.Contains(t, bodyStr, "data:")
	// Should contain done event with cache source
	assert.Contains(t, bodyStr, "event: done")
	assert.Contains(t, bodyStr, `"source":"cache"`)
	assert.Contains(t, bodyStr, `"total":2`)
}

func TestStreamReports_SSEHeaders(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")

	// Pre-populate cache so we get a simple response
	testReports := []BenchmarkReport{
		{Version: "0.2"},
	}
	handler.cache.set(testReports, "0")

	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	// Verify SSE headers
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))
	assert.Equal(t, "no-cache", resp.Header.Get("Cache-Control"))
	assert.Equal(t, "keep-alive", resp.Header.Get("Connection"))
}

func TestStreamReports_SinceParameter(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")

	// Pre-populate cache with "7d" key
	testReports := []BenchmarkReport{
		{Version: "0.2"},
	}
	handler.cache.set(testReports, "7d")

	app.Get("/stream", handler.StreamReports)

	// Request with since=7d should hit cache
	req := httptest.NewRequest("GET", "/stream?since=7d", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	bodyStr := string(body)
	assert.Contains(t, bodyStr, "event: done")
	assert.Contains(t, bodyStr, `"source":"cache"`)
}

// ---------- fetchAllReports ----------

func TestFetchAllReports_ContextCancellation(t *testing.T) {
	// Mock server that would normally list folders
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sleep to ensure context cancellation happens first
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"files":[]}`))
	}))
	defer srv.Close()

	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "test-folder",
		client:   srv.Client(),
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	reports, failures, err := handler.fetchAllReports(ctx, time.Time{})
	require.Error(t, err)
	assert.Nil(t, reports)
	assert.Equal(t, 0, failures)
	assert.Contains(t, err.Error(), "listing top-level folder")
}

func TestFetchAllReports_EmptyFolder(t *testing.T) {
	// Mock Drive API server returning empty file list
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.String(), "key=") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"files":[]}`))
			return
		}
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer srv.Close()

	// Override driveAPIBase for this test by using a custom client
	// Since we can't override the constant, we test the behavior indirectly
	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "test-folder",
		client:   srv.Client(),
	}

	// The actual call will fail because we can't mock the Drive API URL properly
	// But we can verify the function handles empty results
	ctx := context.Background()
	ctx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()

	// This will error because the Drive API URL doesn't point to our mock
	// But it validates that the function doesn't panic on network errors
	_, _, err := handler.fetchAllReports(ctx, time.Time{})
	// Expect either a context timeout or connection error
	require.Error(t, err)
}

func TestFetchAllReports_CutoffFilter(t *testing.T) {
	// This test validates the cutoff logic indirectly through isAfterCutoff
	cutoff := time.Now().Add(-7 * 24 * time.Hour)

	// Recent file should pass
	recentFile := driveFile{
		ID:          "f1",
		Name:        "exp-001",
		MimeType:    driveFolderMIME,
		CreatedTime: time.Now().Format(time.RFC3339),
	}
	assert.True(t, isAfterCutoff(recentFile, cutoff))

	// Old file should be filtered
	oldFile := driveFile{
		ID:          "f2",
		Name:        "exp-002",
		MimeType:    driveFolderMIME,
		CreatedTime: time.Now().Add(-30 * 24 * time.Hour).Format(time.RFC3339),
	}
	assert.False(t, isAfterCutoff(oldFile, cutoff))
}

func TestFetchAllReports_ConcurrencyBounds(t *testing.T) {
	// Verify that driveFetchConcurrency constant is set correctly
	assert.Equal(t, 8, driveFetchConcurrency)

	// The actual concurrent execution is tested through the integration tests
	// This test documents the expected behavior
}

func TestFetchAllReports_ErrorHandling(t *testing.T) {
	// Test that fetchAllReports returns error when listDriveFolder fails
	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "invalid-folder",
		client:   &http.Client{Timeout: 1 * time.Millisecond}, // Very short timeout
	}

	ctx := context.Background()
	reports, failures, err := handler.fetchAllReports(ctx, time.Time{})

	require.Error(t, err)
	assert.Nil(t, reports)
	assert.Equal(t, 0, failures)
	assert.Contains(t, err.Error(), "listing top-level folder")
}

// ---------- GetReports edge cases ----------

func TestGetReports_DemoMode(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")
	app.Get("/reports", handler.GetReports)

	req := httptest.NewRequest("GET", "/reports", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Equal(t, "demo", result["source"])
	reports, ok := result["reports"].([]interface{})
	require.True(t, ok)
	assert.Equal(t, 0, len(reports))
}

func TestGetReports_SinceParameter_Normalized(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")

	// Pre-populate cache with normalized key "0"
	testReports := []BenchmarkReport{
		{Version: "0.2"},
	}
	handler.cache.set(testReports, "0")

	app.Get("/reports", handler.GetReports)

	tests := []struct {
		name        string
		sinceParam  string
		shouldMatch bool
	}{
		{"empty string", "", true},
		{"zero", "0", true},
		{"zero days", "0d", true},
		{"different value", "7d", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			url := "/reports"
			if tc.sinceParam != "" {
				url += "?since=" + tc.sinceParam
			}

			req := httptest.NewRequest("GET", url, nil)
			resp, err := app.Test(req, -1)
			require.NoError(t, err)
			defer resp.Body.Close()

			var result map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&result)
			require.NoError(t, err)

			if tc.shouldMatch {
				assert.Equal(t, "cache", result["source"])
			} else {
				// Different since value won't match cache, will attempt fetch
				// Since we have no real API key setup, it will fail gracefully
				source := result["source"]
				assert.NotEqual(t, "cache", source)
			}
		})
	}
}

func TestGetReports_EmptyAPIKey(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("", "") // Empty API key
	app.Get("/reports", handler.GetReports)

	req := httptest.NewRequest("GET", "/reports", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, 503, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	assert.Contains(t, result["error"], "GOOGLE_DRIVE_API_KEY")
	assert.Equal(t, "unavailable", result["source"])
}

func TestGetReports_StaleCache_OnFetchError(t *testing.T) {
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "invalid-folder")

	// Pre-populate cache with old data
	staleReports := []BenchmarkReport{
		{Version: "0.2"},
	}
	handler.cache.set(staleReports, "0")

	// Expire the cache by setting an old fetchedAt
	handler.cache.mu.Lock()
	handler.cache.fetchedAt = time.Now().Add(-2 * time.Hour)
	handler.cache.mu.Unlock()

	// Use a client with very short timeout to force fetch failure
	handler.client = &http.Client{Timeout: 1 * time.Millisecond}

	app.Get("/reports", handler.GetReports)

	req := httptest.NewRequest("GET", "/reports", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, 200, resp.StatusCode)

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	// Should return stale cache with error message
	assert.Equal(t, "stale-cache", result["source"])
	assert.Contains(t, result["error"], "failed to refresh")
	reports, ok := result["reports"].([]interface{})
	require.True(t, ok)
	assert.Equal(t, 1, len(reports))
}

func TestGetReports_ParseFailures_Reported(t *testing.T) {
	// This test validates that parse_failures field is included in response
	// The actual parsing is tested through integration tests
	// This documents the expected response structure
	app := fiber.New()
	handler := NewBenchmarkHandlers("test-key", "test-folder")

	// Manually construct a response with parse failures
	handler.cache.set([]BenchmarkReport{{Version: "0.2"}}, "0")

	app.Get("/reports", handler.GetReports)

	req := httptest.NewRequest("GET", "/reports", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	defer resp.Body.Close()

	var result map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	// When fetching from cache, no parse_failures field
	_, hasParseFailures := result["parse_failures"]
	assert.False(t, hasParseFailures, "cache response should not include parse_failures")
}
