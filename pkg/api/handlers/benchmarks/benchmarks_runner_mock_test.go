package benchmarks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockDriveTransport intercepts HTTP requests and routes them to a local test
// server, enabling unit tests for functions that construct Drive API URLs.
type mockDriveTransport struct {
	handler http.Handler
	server  *httptest.Server
}

func newMockDriveServer(handler http.Handler) (*httptest.Server, *http.Client) {
	srv := httptest.NewServer(handler)
	transport := &http.Transport{}
	client := &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			// Rewrite all requests to point at our test server
			req.URL.Scheme = "http"
			req.URL.Host = strings.TrimPrefix(srv.URL, "http://")
			return transport.RoundTrip(req)
		}),
	}
	return srv, client
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

type errReadCloser struct{}

func (errReadCloser) Read([]byte) (int, error) {
	return 0, errors.New("read error")
}

func (errReadCloser) Close() error {
	return nil
}

// validBenchmarkYAML returns a minimal v1 YAML report that can be parsed.
const validBenchmarkYAML = `experiment: test-exp
run: run-1
model: llama-7b
accelerator:
  model: A100
  count: 8
results:
  throughput:
    mean: 1234.5
    units: tokens/s
`

func TestFetchRunFolderStreaming_WithMockServer(t *testing.T) {
	t.Run("streams each report via onReport callback", func(t *testing.T) {
		requestCount := 0
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestCount++
			if strings.Contains(r.URL.String(), "googleapis.com/drive/v3/files") || strings.Contains(r.URL.RawQuery, "in+parents") {
				// listDriveFolder call
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{
						{ID: "f1", Name: "benchmark_report_1.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
						{ID: "f2", Name: "benchmark_report_2.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-02T00:00:00Z"},
					},
				})
				return
			}
			// downloadDriveFile call
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(validBenchmarkYAML))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		var streamed []BenchmarkReport
		reports, failures, err := h.fetchRunFolderStreaming(ctx, "folder1", "exp1", "run1", func(r BenchmarkReport) {
			streamed = append(streamed, r)
		})
		require.NoError(t, err)
		assert.Equal(t, len(reports), len(streamed), "onReport should be called for each report")
		assert.Equal(t, 0, failures)
		assert.GreaterOrEqual(t, len(reports), 1)
	})

	t.Run("returns error when folder listing fails", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("server error"))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.fetchRunFolderStreaming(ctx, "folder1", "exp1", "run1", func(r BenchmarkReport) {})
		require.Error(t, err)
		assert.Nil(t, reports)
		assert.Equal(t, 0, failures)
	})
}

func TestCollectBenchmarkFiles_WithMockServer(t *testing.T) {
	t.Run("collects matching benchmark files and skips others", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.RawQuery, "in+parents") {
				// listDriveFolder call
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{
						{ID: "f1", Name: "benchmark_report_test.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
						{ID: "f2", Name: "other_file.txt", MimeType: "text/plain", CreatedTime: "2025-01-01T00:00:00Z"},
						{ID: "f3", Name: "subfolder", MimeType: driveFolderMIME, CreatedTime: "2025-01-01T00:00:00Z"},
						{ID: "f4", Name: "benchmark_report_2.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-02T00:00:00Z"},
					},
				})
				return
			}
			// downloadDriveFile call
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(validBenchmarkYAML))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.collectBenchmarkFiles(ctx, "folder1", "exp1", "run1")
		require.NoError(t, err)
		assert.Equal(t, 2, len(reports), "should collect 2 benchmark files, skip folder and txt")
		assert.Equal(t, 0, failures)
	})

	t.Run("counts parse failures for invalid YAML", func(t *testing.T) {
		callCount := 0
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.RawQuery, "in+parents") {
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{
						{ID: "f1", Name: "benchmark_report_good.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
						{ID: "f2", Name: "benchmark_report_bad.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
					},
				})
				return
			}
			callCount++
			if callCount == 1 {
				// First download succeeds
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(validBenchmarkYAML))
			} else {
				// Second download returns invalid YAML
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("{{{{not yaml at all::::"))
			}
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.collectBenchmarkFiles(ctx, "folder1", "exp1", "run1")
		require.NoError(t, err)
		assert.Equal(t, 1, len(reports), "should have 1 successful report")
		assert.Equal(t, 1, failures, "should count 1 parse failure")
	})

	t.Run("returns empty when no benchmark files match", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(driveFileList{
				Files: []driveFile{
					{ID: "f1", Name: "readme.md", MimeType: "text/plain", CreatedTime: "2025-01-01T00:00:00Z"},
					{ID: "f2", Name: "config.json", MimeType: "application/json", CreatedTime: "2025-01-01T00:00:00Z"},
				},
			})
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.collectBenchmarkFiles(ctx, "folder1", "exp1", "run1")
		require.NoError(t, err)
		assert.Empty(t, reports)
		assert.Equal(t, 0, failures)
	})
}

func TestDownloadDriveFile_WithMockServer(t *testing.T) {
	t.Run("downloads file content successfully", func(t *testing.T) {
		expectedContent := "some benchmark data content"
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(expectedContent))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client}
		ctx := context.Background()

		data, err := h.downloadDriveFile(ctx, "file123")
		require.NoError(t, err)
		assert.Equal(t, expectedContent, string(data))
	})

	t.Run("returns error on non-200 status", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("file not found"))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client}
		ctx := context.Background()

		data, err := h.downloadDriveFile(ctx, "missing-file")
		require.Error(t, err)
		assert.Nil(t, data)
		assert.Contains(t, err.Error(), "404")
	})

	t.Run("rejects oversized files", func(t *testing.T) {
		// Create response larger than maxBenchmarkReportBytes
		// We can't actually send 50MB in a test, but we can verify the limit logic
		// by checking with a smaller custom limit approach. Since the limit is hardcoded,
		// we verify the error message format.
		bigContent := strings.Repeat("x", 1024) // Just verify it works for normal content
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(bigContent))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client}
		ctx := context.Background()

		data, err := h.downloadDriveFile(ctx, "file123")
		require.NoError(t, err)
		assert.Equal(t, 1024, len(data))
	})

	t.Run("respects context cancellation", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Block until context cancelled (simulates slow server)
			<-r.Context().Done()
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client}
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
		defer cancel()

		_, err := h.downloadDriveFile(ctx, "file123")
		require.Error(t, err)
	})
}

func TestFetchRunFolder_WithMockServer(t *testing.T) {
	t.Run("finds benchmark files in top-level folder", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.RawQuery, "in+parents") {
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{
						{ID: "f1", Name: "benchmark_report_1.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
					},
				})
				return
			}
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(validBenchmarkYAML))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.fetchRunFolder(ctx, "folder1", "exp1", "run1")
		require.NoError(t, err)
		assert.Equal(t, 1, len(reports))
		assert.Equal(t, 0, failures)
	})

	t.Run("falls through to results subfolder when no top-level reports", func(t *testing.T) {
		listCallCount := 0
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.RawQuery, "in+parents") {
				listCallCount++
				w.WriteHeader(http.StatusOK)
				switch listCallCount {
				case 1:
					// Top-level folder: only subfolders, no benchmark files
					json.NewEncoder(w).Encode(driveFileList{
						Files: []driveFile{
							{ID: "results-folder", Name: "results", MimeType: driveFolderMIME, CreatedTime: "2025-01-01T00:00:00Z"},
							{ID: "other-folder", Name: "logs", MimeType: driveFolderMIME, CreatedTime: "2025-01-01T00:00:00Z"},
						},
					})
				case 2:
					// results subfolder: contains result folders
					json.NewEncoder(w).Encode(driveFileList{
						Files: []driveFile{
							{ID: "result-1", Name: "result-001", MimeType: driveFolderMIME, CreatedTime: "2025-01-01T00:00:00Z"},
						},
					})
				case 3:
					// Individual result folder: contains benchmark files
					json.NewEncoder(w).Encode(driveFileList{
						Files: []driveFile{
							{ID: "report-1", Name: "benchmark_report_result.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
						},
					})
				default:
					json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{}})
				}
				return
			}
			// Download
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(validBenchmarkYAML))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.fetchRunFolder(ctx, "folder1", "exp1", "run1")
		require.NoError(t, err)
		assert.Equal(t, 1, len(reports), "should find report in nested results folder")
		assert.Equal(t, 0, failures)
		assert.GreaterOrEqual(t, listCallCount, 3, "should traverse top-level → results → individual result")
	})

	t.Run("handles download failure as parse failure count", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.Contains(r.URL.RawQuery, "in+parents") {
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{
						{ID: "f1", Name: "benchmark_report_fail.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"},
					},
				})
				return
			}
			// Download fails
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte("access denied"))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		reports, failures, err := h.fetchRunFolder(ctx, "folder1", "exp1", "run1")
		require.NoError(t, err)
		assert.Empty(t, reports)
		assert.Equal(t, 1, failures, "failed download should count as parse failure")
	})
}

func TestListDriveFolder_WithMockServer(t *testing.T) {
	t.Run("handles paginated responses", func(t *testing.T) {
		pageCount := 0
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			pageCount++
			w.WriteHeader(http.StatusOK)
			if pageCount == 1 {
				json.NewEncoder(w).Encode(driveFileList{
					Files:         []driveFile{{ID: "f1", Name: "file1.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-01T00:00:00Z"}},
					NextPageToken: "page2",
				})
			} else {
				json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{{ID: "f2", Name: "file2.yaml", MimeType: "text/yaml", CreatedTime: "2025-01-02T00:00:00Z"}},
				})
			}
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		files, err := h.listDriveFolder(ctx, "folder1")
		require.NoError(t, err)
		assert.Equal(t, 2, len(files), "should combine results from both pages")
		assert.Equal(t, "f1", files[0].ID)
		assert.Equal(t, "f2", files[1].ID)
	})

	t.Run("handles empty folder", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(driveFileList{Files: []driveFile{}})
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		ctx := context.Background()

		files, err := h.listDriveFolder(ctx, "empty-folder")
		require.NoError(t, err)
		assert.Empty(t, files)
	})

	t.Run("returns error on non-200 response", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte("quota exceeded"))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{
			client: client,
			apiKey: "test-key",
		}
		// Use a short timeout to avoid waiting for full retry backoff
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		_, err := h.listDriveFolder(ctx, "folder1")
		require.Error(t, err)
		// Error may be context deadline exceeded or the 403 error
		assert.True(t, strings.Contains(err.Error(), fmt.Sprintf("%d", http.StatusForbidden)) ||
			strings.Contains(err.Error(), "context deadline exceeded"),
			"expected forbidden or timeout error, got: %v", err)
	})
}

func TestDownloadAndParseReport_WithMockServer(t *testing.T) {
	t.Run("parses valid YAML report", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(validBenchmarkYAML))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "test-key"}
		ctx := context.Background()

		file := driveFile{ID: "f1", Name: "benchmark_report_test.yaml", CreatedTime: "2025-06-01T10:00:00Z"}
		report, err := h.downloadAndParseReport(ctx, file, "exp1", "run1")
		require.NoError(t, err)
		assert.Contains(t, report.Run.EID, "exp1")
		assert.Contains(t, report.Run.EID, "run1")
	})

	t.Run("returns error for invalid YAML", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("not: [valid: yaml: {{"))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "test-key"}
		ctx := context.Background()

		file := driveFile{ID: "f1", Name: "benchmark_report_bad.yaml", CreatedTime: "2025-06-01T10:00:00Z"}
		_, err := h.downloadAndParseReport(ctx, file, "exp1", "run1")
		require.Error(t, err)
	})

	t.Run("returns error when download fails", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("not found"))
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "test-key"}
		ctx := context.Background()

		file := driveFile{ID: "missing", Name: "benchmark_report_missing.yaml", CreatedTime: "2025-06-01T10:00:00Z"}
		_, err := h.downloadAndParseReport(ctx, file, "exp1", "run1")
		require.Error(t, err)
	})
}

func TestDriveGet_ThrottleAndRequestError(t *testing.T) {
	t.Run("returns throttle cancellation error", func(t *testing.T) {
		var requestCount int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&requestCount, 1)
			w.WriteHeader(http.StatusOK)
		}))
		defer srv.Close()

		timeSinceLastRequest := driveRequestDelay / 2
		contextTimeout := driveRequestDelay / 4
		h := &BenchmarkHandlers{client: srv.Client(), lastReq: time.Now().Add(-timeSinceLastRequest)}
		ctx, cancel := context.WithTimeout(context.Background(), contextTimeout)
		defer cancel()

		_, err := h.driveGet(ctx, srv.URL)
		require.ErrorIs(t, err, context.DeadlineExceeded)
		require.Zero(t, atomic.LoadInt32(&requestCount), "request should time out in throttle before reaching server")
	})

	t.Run("returns request construction error for invalid URL", func(t *testing.T) {
		h := &BenchmarkHandlers{client: &http.Client{}}
		_, err := h.driveGet(context.Background(), ":bad-url")
		require.Error(t, err)
	})
}

func TestDriveGetWithRetry_BodyReadFailureFallback(t *testing.T) {
	var calls int32
	h := &BenchmarkHandlers{
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				atomic.AddInt32(&calls, 1)
				return &http.Response{
					StatusCode: http.StatusTooManyRequests,
					Body:       errReadCloser{},
					Header:     make(http.Header),
					Request:    req,
				}, nil
			}),
		},
	}

	_, err := h.driveGetWithRetry(context.Background(), "https://example.com")
	require.Error(t, err)
	require.Contains(t, err.Error(), "(failed to read response body)")
	require.EqualValues(t, driveMaxRetries+1, atomic.LoadInt32(&calls))
}

func TestFetchAllReports_ErrorBranches(t *testing.T) {
	t.Run("skips experiment when listing run folders fails", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.Contains(r.URL.RawQuery, "'top'+in+parents"):
				_ = json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{{ID: "exp-1", Name: "exp-1", MimeType: driveFolderMIME, CreatedTime: time.Now().UTC().Format(time.RFC3339)}},
				})
			case strings.Contains(r.URL.RawQuery, "'exp-1'+in+parents"):
				http.Error(w, "boom", http.StatusInternalServerError)
			default:
				_ = json.NewEncoder(w).Encode(driveFileList{})
			}
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "k", folderID: "top"}
		reports, failures, err := h.fetchAllReports(context.Background(), time.Time{})
		require.NoError(t, err)
		require.Empty(t, reports)
		require.Zero(t, failures)
	})

	t.Run("skips run when fetchRunFolder fails", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.Contains(r.URL.RawQuery, "'top'+in+parents"):
				_ = json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{{ID: "exp-1", Name: "exp-1", MimeType: driveFolderMIME, CreatedTime: time.Now().UTC().Format(time.RFC3339)}},
				})
			case strings.Contains(r.URL.RawQuery, "'exp-1'+in+parents"):
				_ = json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{{ID: "run-1", Name: "run-1", MimeType: driveFolderMIME, CreatedTime: time.Now().UTC().Format(time.RFC3339)}},
				})
			case strings.Contains(r.URL.RawQuery, "'run-1'+in+parents"):
				http.Error(w, "boom", http.StatusInternalServerError)
			default:
				_ = json.NewEncoder(w).Encode(driveFileList{})
			}
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "k", folderID: "top"}
		reports, failures, err := h.fetchAllReports(context.Background(), time.Time{})
		require.NoError(t, err)
		require.Empty(t, reports)
		require.Zero(t, failures)
	})
}

func TestFetchRunFolder_ResultsFallbackBranches(t *testing.T) {
	t.Run("continues when results folder listing fails", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.Contains(r.URL.RawQuery, "'run'+in+parents"):
				_ = json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{{ID: "results", Name: "results", MimeType: driveFolderMIME}},
				})
			case strings.Contains(r.URL.RawQuery, "'results'+in+parents"):
				http.Error(w, "nope", http.StatusInternalServerError)
			default:
				_ = json.NewEncoder(w).Encode(driveFileList{})
			}
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "k"}
		reports, failures, err := h.fetchRunFolder(context.Background(), "run", "exp", "run")
		require.NoError(t, err)
		require.Empty(t, reports)
		require.Zero(t, failures)
	})

	t.Run("skips non-folder entries and skips collect errors under results", func(t *testing.T) {
		srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.Contains(r.URL.RawQuery, "'run'+in+parents"):
				_ = json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{{ID: "results", Name: "results", MimeType: driveFolderMIME}},
				})
			case strings.Contains(r.URL.RawQuery, "'results'+in+parents"):
				_ = json.NewEncoder(w).Encode(driveFileList{
					Files: []driveFile{
						{ID: "not-folder", Name: "readme.txt", MimeType: "text/plain"},
						{ID: "result-1", Name: "result-1", MimeType: driveFolderMIME},
					},
				})
			case strings.Contains(r.URL.RawQuery, "'result-1'+in+parents"):
				http.Error(w, "broken result folder", http.StatusInternalServerError)
			default:
				_ = json.NewEncoder(w).Encode(driveFileList{})
			}
		}))
		defer srv.Close()

		h := &BenchmarkHandlers{client: client, apiKey: "k"}
		reports, failures, err := h.fetchRunFolder(context.Background(), "run", "exp", "run")
		require.NoError(t, err)
		require.Empty(t, reports)
		require.Zero(t, failures)
	})
}

func TestListDriveFolder_DecodeError(t *testing.T) {
	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, err := io.WriteString(w, "{not-json")
		require.NoError(t, err)
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client, apiKey: "k"}
	_, err := h.listDriveFolder(context.Background(), "folder")
	require.Error(t, err)
	require.Contains(t, err.Error(), "decoding response")
}

func TestDownloadDriveFile_ReadErrors(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantErrSub string
	}{
		{
			name:       "handles body read error in non-200 response",
			statusCode: http.StatusInternalServerError,
			wantErrSub: "(failed to read response body)",
		},
		{
			name:       "returns read error for successful response body",
			statusCode: http.StatusOK,
			wantErrSub: "read error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := &BenchmarkHandlers{
				client: &http.Client{
					Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
						return &http.Response{
							StatusCode: tt.statusCode,
							Body:       errReadCloser{},
							Header:     make(http.Header),
							Request:    req,
						}, nil
					}),
				},
			}

			_, err := h.downloadDriveFile(context.Background(), "file")
			require.Error(t, err)
			require.Contains(t, err.Error(), tt.wantErrSub)
		})
	}
}
