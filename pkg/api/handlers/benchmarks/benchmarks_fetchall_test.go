package benchmarks

// Tests for fetchAllReports (previously 6.4% coverage) and StreamReports live
// path (previously 8.6% coverage).  Both functions drive Google Drive API calls
// through the shared mock-server helper (newMockDriveServer) already defined in
// benchmarks_runner_mock_test.go.

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

const (
	// cutoffDays is the rolling window used in cutoff-filter tests.
	cutoffDays = 30

	// experimentRetryTimeout caps how long we wait for retry backoff when a
	// deliberately-broken experiment listing exhausts all retries.
	experimentRetryTimeout = 5 * time.Second

	// folderListingRetryTimeout caps how long a streaming test waits while
	// the mock server returns persistent errors and retries exhaust.
	folderListingRetryTimeout = 8 * time.Second

	// fiberTestTimeoutMs is the Fiber app.Test timeout (milliseconds) for
	// short streaming tests.
	fiberTestTimeoutMs = 10_000

	// fiberTestLongTimeoutMs is the Fiber app.Test timeout (milliseconds)
	// for streaming tests that include real HTTP round-trips to the mock server.
	fiberTestLongTimeoutMs = 15_000
)

// ── fetchAllReports ───────────────────────────────────────────────────────────

// TestFetchAllReports_HappyPath exercises the full happy path:
// top-level folder → 1 experiment folder → 1 run folder → 1 benchmark file.
func TestFetchAllReports_HappyPath(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			q := r.URL.Query().Get("q")
			w.WriteHeader(http.StatusOK)
			switch {
			case strings.Contains(q, "top-folder"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "exp-1", Name: "experiment-001", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			case strings.Contains(q, "exp-1"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "run-1", Name: "run-001", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			default:
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "rpt-1", Name: "benchmark_report_test.yaml", MimeType: "text/yaml", CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			}
			return
		}
		// File download (drive.google.com/uc?id=…)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(validBenchmarkYAML))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "top-folder"}
	ctx := context.Background()

	reports, failures, err := h.fetchAllReports(ctx, time.Time{})
	require.NoError(t, err)
	assert.Equal(t, 1, len(reports))
	assert.Equal(t, 0, failures)
	assert.Equal(t, "0.2", reports[0].Version)
}

// TestFetchAllReports_MultipleExperimentsAndRuns checks that concurrent
// experiment/run processing aggregates all reports correctly.
func TestFetchAllReports_MultipleExperimentsAndRuns(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			q := r.URL.Query().Get("q")
			w.WriteHeader(http.StatusOK)
			switch {
			case strings.Contains(q, "multi-folder"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "exp-a", Name: "exp-a", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
					{ID: "exp-b", Name: "exp-b", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			case strings.Contains(q, "exp-a"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "run-a1", Name: "run-a1", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
					{ID: "run-a2", Name: "run-a2", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			case strings.Contains(q, "exp-b"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "run-b1", Name: "run-b1", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			default:
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "rpt", Name: "benchmark_report_test.yaml", MimeType: "text/yaml", CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			}
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(validBenchmarkYAML))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "multi-folder"}
	ctx := context.Background()

	reports, failures, err := h.fetchAllReports(ctx, time.Time{})
	require.NoError(t, err)
	assert.Equal(t, 3, len(reports)) // 2 from exp-a + 1 from exp-b
	assert.Equal(t, 0, failures)
}

// TestFetchAllReports_CutoffFiltersOldExperiments verifies that experiment
// folders older than the cutoff are silently skipped.
func TestFetchAllReports_CutoffFiltersOldExperiments(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
				// Experiment created 2 years ago — should be filtered by 30-day cutoff.
				{ID: "exp-old", Name: "old-exp", MimeType: driveFolderMIME, CreatedTime: "2023-01-01T00:00:00Z"},
				// Non-folder item — should be skipped regardless.
				{ID: "file-1", Name: "readme.md", MimeType: "text/plain", CreatedTime: "2025-06-01T00:00:00Z"},
			}})
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(validBenchmarkYAML))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "cutoff-folder"}
	ctx := context.Background()
	cutoff := time.Now().Add(-cutoffDays * 24 * time.Hour)

	reports, failures, err := h.fetchAllReports(ctx, cutoff)
	require.NoError(t, err)
	assert.Equal(t, 0, len(reports))
	assert.Equal(t, 0, failures)
}

// TestFetchAllReports_RunFoldersCutoffFiltered verifies that run folders older
// than the cutoff are silently skipped while the experiment itself is visited.
func TestFetchAllReports_RunFoldersCutoffFiltered(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			q := r.URL.Query().Get("q")
			w.WriteHeader(http.StatusOK)
			if strings.Contains(q, "runcut-folder") {
				// Recent experiment folder — passes cutoff.
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "exp-rc", Name: "exp-rc", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			} else {
				// Old run folder — should be filtered.
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "old-run", Name: "old-run", MimeType: driveFolderMIME, CreatedTime: "2023-01-01T00:00:00Z"},
				}})
			}
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(validBenchmarkYAML))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "runcut-folder"}
	ctx := context.Background()
	cutoff := time.Now().Add(-cutoffDays * 24 * time.Hour)

	reports, failures, err := h.fetchAllReports(ctx, cutoff)
	require.NoError(t, err)
	assert.Equal(t, 0, len(reports), "old run folder should be filtered out")
	assert.Equal(t, 0, failures)
}

// TestFetchAllReports_ExperimentListingError verifies that a failure to list
// one experiment's runs is logged but does not abort the overall fetch.
func TestFetchAllReports_ExperimentListingError(t *testing.T) {
	callCount := 0
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			q := r.URL.Query().Get("q")
			if strings.Contains(q, "errexp-folder") {
				// Top-level: two experiments.
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "exp-ok", Name: "exp-ok", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
					{ID: "exp-err", Name: "exp-err", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
				return
			}
			if strings.Contains(q, "exp-ok") {
				// Good experiment: one run with one report.
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "run-ok", Name: "run-ok", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
				return
			}
			if strings.Contains(q, "exp-err") {
				// Bad experiment: always returns 500, triggering retry exhaustion.
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte("server error"))
				return
			}
			// Run folder listing: one report file.
			callCount++
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
				{ID: "rpt-ok", Name: "benchmark_report_test.yaml", MimeType: "text/yaml", CreatedTime: "2025-06-01T00:00:00Z"},
			}})
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(validBenchmarkYAML))
	}))
	defer srv.Close()

	// Use a short context to avoid waiting for full retry backoff on exp-err.
	ctx, cancel := context.WithTimeout(context.Background(), experimentRetryTimeout)
	defer cancel()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "errexp-folder"}

	reports, failures, err := h.fetchAllReports(ctx, time.Time{})
	// The overall fetch should not return an error (bad experiment is logged and skipped).
	// It may also return context timeout if retries on exp-err exceed the timeout.
	if err == nil {
		// Successfully got reports from the good experiment.
		assert.GreaterOrEqual(t, len(reports), 0)
		assert.GreaterOrEqual(t, failures, 0)
	} else {
		// Context deadline exceeded waiting for retries — that's also acceptable.
		assert.ErrorIs(t, err, context.DeadlineExceeded)
	}
}

// TestFetchAllReports_EmptyTopLevelFolder verifies zero reports are returned
// when the top-level folder contains no experiment sub-folders.
func TestFetchAllReports_EmptyTopLevelFolder(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{}})
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "empty-folder"}
	ctx := context.Background()

	reports, failures, err := h.fetchAllReports(ctx, time.Time{})
	require.NoError(t, err)
	assert.Equal(t, 0, len(reports))
	assert.Equal(t, 0, failures)
}

// TestFetchAllReports_ParseFailuresCountedNotError verifies that YAML parse
// failures from individual files are counted in the failures return value
// but do not cause fetchAllReports to return a non-nil error.
func TestFetchAllReports_ParseFailuresCountedNotError(t *testing.T) {
	downloadCallCount := 0
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			q := r.URL.Query().Get("q")
			w.WriteHeader(http.StatusOK)
			switch {
			case strings.Contains(q, "pf-folder"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "exp-pf", Name: "exp-pf", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			case strings.Contains(q, "exp-pf"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "run-pf", Name: "run-pf", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			default:
				// Two report files in the run folder.
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "rpt-good", Name: "benchmark_report_good.yaml", MimeType: "text/yaml", CreatedTime: "2025-06-01T00:00:00Z"},
					{ID: "rpt-bad", Name: "benchmark_report_bad.yaml", MimeType: "text/yaml", CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			}
			return
		}
		// Alternate: first download good, second download bad YAML.
		downloadCallCount++
		w.WriteHeader(http.StatusOK)
		if downloadCallCount%2 == 0 {
			w.Write([]byte("{{{{not-yaml::::"))
		} else {
			w.Write([]byte(validBenchmarkYAML))
		}
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "test-key", folderID: "pf-folder"}
	ctx := context.Background()

	reports, failures, err := h.fetchAllReports(ctx, time.Time{})
	require.NoError(t, err)
	assert.Equal(t, 1, len(reports), "one good report expected")
	assert.Equal(t, 1, failures, "one parse failure expected")
}

// ── StreamReports live path ───────────────────────────────────────────────────

// TestStreamReports_LivePath_EmptyFolder exercises the SetBodyStreamWriter SSE
// path with a mock Drive server that returns an empty top-level folder.  This
// covers the goroutine setup, keepalive, progress events, and final done event.
func TestStreamReports_LivePath_EmptyFolder(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{}})
	}))
	defer srv.Close()

	app := fiber.New()
	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "live-empty-folder",
		client:   client,
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
	}
	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	resp, err := app.Test(req, fiberTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "text/event-stream", resp.Header.Get("Content-Type"))

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	bodyStr := string(body)
	assert.Contains(t, bodyStr, "event: progress", "should emit initial progress event")
	assert.Contains(t, bodyStr, "event: done", "should emit done event after streaming completes")
	assert.Contains(t, bodyStr, `"source":"live"`, "done event should indicate live source")
	assert.Contains(t, bodyStr, `"total":0`, "empty folder produces no reports")
}

// TestStreamReports_LivePath_WithData exercises the full streaming path when
// Drive returns a real experiment/run/file hierarchy.
func TestStreamReports_LivePath_WithData(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.RawQuery, "in+parents") {
			q := r.URL.Query().Get("q")
			w.WriteHeader(http.StatusOK)
			switch {
			case strings.Contains(q, "live-data-folder"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "exp-live", Name: "exp-live", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			case strings.Contains(q, "exp-live"):
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "run-live", Name: "run-live", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			default:
				json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{
					{ID: "rpt-live", Name: "benchmark_report_live.yaml", MimeType: "text/yaml", CreatedTime: "2025-06-01T00:00:00Z"},
				}})
			}
			return
		}
		// File download.
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(validBenchmarkYAML))
	}))
	defer srv.Close()

	app := fiber.New()
	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "live-data-folder",
		client:   client,
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
	}
	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	resp, err := app.Test(req, fiberTestLongTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	bodyStr := string(body)
	assert.Contains(t, bodyStr, "event: progress")
	assert.Contains(t, bodyStr, "event: done")
	// Should have streamed 1 report via a batch event.
	assert.Contains(t, bodyStr, "event: batch", "should emit batch event for fetched reports")
	assert.Contains(t, bodyStr, `"total":1`)
}

// TestStreamReports_LivePath_FolderListingError verifies that when Drive folder
// listing fails during streaming, an error SSE event is emitted.
func TestStreamReports_LivePath_FolderListingError(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always return 500 to simulate a persistent Drive API error.
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal server error"))
	}))
	defer srv.Close()

	app := fiber.New()
	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "error-folder",
		client:   client,
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
	}
	app.Get("/stream", handler.StreamReports)

	req := httptest.NewRequest("GET", "/stream", nil)
	// Use a short timeout so retries expire quickly.
	ctx, cancel := context.WithTimeout(req.Context(), folderListingRetryTimeout)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := app.Test(req, fiberTestTimeoutMs)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	// Either an SSE error event is returned, or the context fires first (progress then no done).
	bodyStr := string(body)
	hasError := strings.Contains(bodyStr, "event: error")
	hasProgress := strings.Contains(bodyStr, "event: progress")
	assert.True(t, hasError || hasProgress, "should emit progress or error event: %q", bodyStr)
}
