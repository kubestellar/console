package benchmarks

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestHandler creates a BenchmarkHandlers with a custom HTTP client pointing
// to the given test server.
func newTestHandler(ts *httptest.Server, apiKey, folderID string) *BenchmarkHandlers {
	return &BenchmarkHandlers{
		apiKey:   apiKey,
		folderID: folderID,
		cache: &benchmarkCache{
			ttl: defaultCacheTTL,
		},
		client: ts.Client(),
	}
}

// --- throttle tests ---

func TestThrottle_NoDelayNeeded(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	// Set lastReq to long ago so no delay is needed
	h.lastReq = time.Now().Add(-time.Hour)

	ctx := context.Background()
	err := h.throttle(ctx)
	assert.NoError(t, err)
}

func TestThrottle_WithDelay(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now() // just now → delay needed

	ctx := context.Background()
	start := time.Now()
	err := h.throttle(ctx)
	assert.NoError(t, err)
	assert.GreaterOrEqual(t, time.Since(start), driveRequestDelay/2)
}

func TestThrottle_CancelledContext(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now() // force a delay

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // immediately cancel

	err := h.throttle(ctx)
	assert.Error(t, err)
	assert.Equal(t, context.Canceled, err)
}

func TestThrottle_AlreadyCancelledContext(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// No delay needed path but ctx is already cancelled
	err := h.throttle(ctx)
	assert.Equal(t, context.Canceled, err)
}

// --- driveGet tests ---

func TestDriveGet_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, driveUserAgent, r.Header.Get("User-Agent"))
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"files":[]}`)
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	resp, err := h.driveGet(context.Background(), ts.URL+"/test")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDriveGet_CancelledContext(t *testing.T) {
	ts := httptest.NewServer(http.NotFoundHandler())
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := h.driveGet(ctx, ts.URL+"/test")
	assert.Error(t, err)
}

// --- driveGetWithRetry tests ---

func TestDriveGetWithRetry_SuccessOnFirstAttempt(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"files":[]}`)
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	resp, err := h.driveGetWithRetry(context.Background(), ts.URL+"/files")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDriveGetWithRetry_RetriesOn403(t *testing.T) {
	var mu sync.Mutex
	attempts := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		attempts++
		current := attempts
		mu.Unlock()
		if current <= 2 {
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, "rate limited")
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"files":[]}`)
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	resp, err := h.driveGetWithRetry(context.Background(), ts.URL+"/files")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	mu.Lock()
	assert.Equal(t, 3, attempts)
	mu.Unlock()
}

func TestDriveGetWithRetry_RetriesOn429(t *testing.T) {
	var mu sync.Mutex
	attempts := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		attempts++
		current := attempts
		mu.Unlock()
		if current <= 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			fmt.Fprint(w, "too many requests")
			return
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `ok`)
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	resp, err := h.driveGetWithRetry(context.Background(), ts.URL+"/files")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestDriveGetWithRetry_ExhaustsRetries(t *testing.T) {
	attempts := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "always forbidden")
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	// Use a context with enough time for retries but not forever
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := h.driveGetWithRetry(ctx, ts.URL+"/files")
	assert.Nil(t, resp)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "Drive API returned 403")
}

func TestDriveGetWithRetry_CancelDuringBackoff(t *testing.T) {
	attempts := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "forbidden")
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	_, err := h.driveGetWithRetry(ctx, ts.URL+"/files")
	assert.Error(t, err)
}

// --- listDriveFolder tests ---

func TestListDriveFolder_Success(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := driveFileList{
			Files: []driveFile{
				{ID: "f1", Name: "file1.yaml", MimeType: "text/plain"},
				{ID: "f2", Name: "folder1", MimeType: driveFolderMIME},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()
	h := newTestHandler(ts, "key", "folder")
	h.lastReq = time.Now().Add(-time.Hour)
	// Override driveAPIBase to our test server
	origDriveGet := h.client

	// We need to make listDriveFolder use the test server
	// The function builds a URL from driveAPIBase, so we need a different approach:
	// let's test via downloadDriveFile instead, or create a wrapper.
	// Actually listDriveFolder uses h.driveGetWithRetry which uses h.client.
	// The issue is it builds a URL from the const driveAPIBase.
	// We'll need to test it by intercepting the HTTP transport.

	_ = origDriveGet
	// Use a transport-based approach
	h.client = &http.Client{
		Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
			assert.Contains(t, req.URL.String(), "test-folder-id")
			resp := driveFileList{
				Files: []driveFile{
					{ID: "f1", Name: "file1.yaml", MimeType: "text/plain"},
					{ID: "f2", Name: "sub-folder", MimeType: driveFolderMIME},
				},
			}
			data, _ := json.Marshal(resp)
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       nopCloser(data),
				Header:     http.Header{"Content-Type": []string{"application/json"}},
			}, nil
		}),
	}

	files, err := h.listDriveFolder(context.Background(), "test-folder-id")
	require.NoError(t, err)
	assert.Len(t, files, 2)
	assert.Equal(t, "f1", files[0].ID)
	assert.Equal(t, "f2", files[1].ID)
}

func TestListDriveFolder_Pagination(t *testing.T) {
	page := 0
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				page++
				var resp driveFileList
				if page == 1 {
					resp = driveFileList{
						Files:         []driveFile{{ID: "p1", Name: "page1", MimeType: "text/plain"}},
						NextPageToken: "token2",
					}
				} else {
					resp = driveFileList{
						Files: []driveFile{{ID: "p2", Name: "page2", MimeType: "text/plain"}},
					}
				}
				data, _ := json.Marshal(resp)
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser(data),
					Header:     http.Header{"Content-Type": []string{"application/json"}},
				}, nil
			}),
		},
	}

	files, err := h.listDriveFolder(context.Background(), "paginated-folder")
	require.NoError(t, err)
	assert.Len(t, files, 2)
	assert.Equal(t, "p1", files[0].ID)
	assert.Equal(t, "p2", files[1].ID)
}

func TestListDriveFolder_NonOKStatus(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       nopCloser([]byte("server error")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	_, err := h.listDriveFolder(context.Background(), "error-folder")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

// --- downloadDriveFile tests ---

func TestDownloadDriveFile_Success(t *testing.T) {
	content := "benchmark_report_data: true"
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				assert.Contains(t, req.URL.String(), "file-123")
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser([]byte(content)),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	data, err := h.downloadDriveFile(context.Background(), "file-123")
	require.NoError(t, err)
	assert.Equal(t, content, string(data))
}

func TestDownloadDriveFile_Non200(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusNotFound,
					Body:       nopCloser([]byte("not found")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	_, err := h.downloadDriveFile(context.Background(), "missing-file")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "404")
}

func TestDownloadDriveFile_ExceedsMaxSize(t *testing.T) {
	// Generate data that exceeds the limit
	oversizedData := strings.Repeat("x", int(maxBenchmarkReportBytes)+10)
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser([]byte(oversizedData)),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	_, err := h.downloadDriveFile(context.Background(), "huge-file")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "exceeded max size")
}

// --- downloadAndParseReport tests ---

func TestDownloadAndParseReport_ValidYAML(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  throughput:
    output_tokens_per_sec: 50.0
    requests_per_sec: 5.0
    total_tokens_per_sec: 75.0
  time:
    duration: 60.0
  requests:
    total: 100
    failures: 2
scenario:
  host:
    type: ["decode"]
    accelerator:
      - count: 4
        model: A100
        parallelism:
          dp: 1
          tp: 4
          pp: 1
          ep: 1
  load:
    metadata:
      stage: 1
    name: genai-perf
  platform:
    engine:
      - name: vllm-0.8.0
`
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser([]byte(yamlContent)),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	file := driveFile{ID: "yaml-1", Name: "benchmark_report_stage1.yaml", CreatedTime: time.Now().Format(time.RFC3339)}
	report, err := h.downloadAndParseReport(context.Background(), file, "exp-1", "run-1")
	require.NoError(t, err)
	assert.Equal(t, "0.2", report.Version)
	assert.Equal(t, "exp-1/run-1/stage-1", report.Run.UID)
	assert.Equal(t, 100, report.Results.RequestPerformance.Aggregate.Requests.Total)
}

func TestDownloadAndParseReport_InvalidYAML(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser([]byte("not: [valid: yaml: {{")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	file := driveFile{ID: "bad-1", Name: "benchmark_report.yaml"}
	_, err := h.downloadAndParseReport(context.Background(), file, "exp", "run")
	assert.Error(t, err)
}

func TestDownloadAndParseReport_DownloadError(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				// Return 404 (not retried) to fail fast
				return &http.Response{
					StatusCode: http.StatusNotFound,
					Body:       nopCloser([]byte("not found")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	file := driveFile{ID: "err-1", Name: "benchmark_report.yaml"}
	_, err := h.downloadAndParseReport(context.Background(), file, "exp", "run")
	assert.Error(t, err)
}

// --- collectBenchmarkFiles tests ---

func TestCollectBenchmarkFiles_MixedContent(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  throughput:
    output_tokens_per_sec: 10
    requests_per_sec: 1
    total_tokens_per_sec: 15
  time:
    duration: 30
  requests:
    total: 50
    failures: 0
scenario:
  host:
    type: ["decode"]
    accelerator:
      - count: 1
        model: T4
        parallelism: {dp: 1, tp: 1, pp: 1, ep: 1}
  load:
    metadata:
      stage: 1
    name: test
  platform:
    engine:
      - name: vllm-0.5.0
`
	callNum := 0
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				callNum++
				if callNum == 1 {
					// Listing the folder
					resp := driveFileList{
						Files: []driveFile{
							{ID: "sub", Name: "subfolder", MimeType: driveFolderMIME},
							{ID: "yaml1", Name: "benchmark_report_s1.yaml", MimeType: "text/plain"},
							{ID: "readme", Name: "README.md", MimeType: "text/plain"},
						},
					}
					data, _ := json.Marshal(resp)
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       nopCloser(data),
						Header:     http.Header{"Content-Type": []string{"application/json"}},
					}, nil
				}
				// Download the yaml file
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser([]byte(yamlContent)),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	reports, failures, err := h.collectBenchmarkFiles(context.Background(), "test-folder", "exp", "run")
	require.NoError(t, err)
	assert.Len(t, reports, 1)
	assert.Equal(t, 0, failures)
}

func TestCollectBenchmarkFiles_ListError(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				// Return 500 (not retried) to avoid slow backoff
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       nopCloser([]byte("connection refused")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	_, _, err := h.collectBenchmarkFiles(context.Background(), "err-folder", "exp", "run")
	assert.Error(t, err)
}

// --- fetchRunFolder tests ---

func TestFetchRunFolder_DirectYAMLFiles(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  throughput: {output_tokens_per_sec: 10, requests_per_sec: 1, total_tokens_per_sec: 15}
  time: {duration: 30}
  requests: {total: 50, failures: 0}
scenario:
  host:
    type: ["decode"]
    accelerator: [{count: 1, model: T4, parallelism: {dp: 1, tp: 1, pp: 1, ep: 1}}]
  load: {metadata: {stage: 1}, name: test}
  platform: {engine: [{name: vllm}]}
`
	callNum := 0
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				callNum++
				if callNum == 1 {
					resp := driveFileList{
						Files: []driveFile{
							{ID: "y1", Name: "benchmark_report_s1.yaml", MimeType: "text/plain"},
						},
					}
					data, _ := json.Marshal(resp)
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       nopCloser(data),
						Header:     http.Header{"Content-Type": []string{"application/json"}},
					}, nil
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       nopCloser([]byte(yamlContent)),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	reports, failures, err := h.fetchRunFolder(context.Background(), "run-folder-1", "exp", "run")
	require.NoError(t, err)
	assert.Len(t, reports, 1)
	assert.Equal(t, 0, failures)
}

func TestFetchRunFolder_NestedResultsLayout(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  throughput: {output_tokens_per_sec: 10, requests_per_sec: 1, total_tokens_per_sec: 15}
  time: {duration: 30}
  requests: {total: 25, failures: 1}
scenario:
  host:
    type: ["decode"]
    accelerator: [{count: 1, model: T4, parallelism: {dp: 1, tp: 1, pp: 1, ep: 1}}]
  load: {metadata: {stage: 2}, name: test}
  platform: {engine: [{name: vllm}]}
`
	callNum := 0
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				callNum++
				switch callNum {
				case 1:
					// List run folder → only subfolders, no direct YAML
					resp := driveFileList{
						Files: []driveFile{
							{ID: "results-dir", Name: "results", MimeType: driveFolderMIME},
						},
					}
					data, _ := json.Marshal(resp)
					return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
				case 2:
					// List "results" folder → result subfolders
					resp := driveFileList{
						Files: []driveFile{
							{ID: "result-1", Name: "individual-result-1", MimeType: driveFolderMIME},
						},
					}
					data, _ := json.Marshal(resp)
					return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
				case 3:
					// List individual result folder
					resp := driveFileList{
						Files: []driveFile{
							{ID: "yaml-nested", Name: "benchmark_report_stage2.yaml", MimeType: "text/plain"},
						},
					}
					data, _ := json.Marshal(resp)
					return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
				default:
					// Download YAML
					return &http.Response{StatusCode: http.StatusOK, Body: nopCloser([]byte(yamlContent)), Header: http.Header{"Content-Type": []string{"text/plain"}}}, nil
				}
			}),
		},
	}

	reports, failures, err := h.fetchRunFolder(context.Background(), "nested-run", "exp", "run")
	require.NoError(t, err)
	assert.Len(t, reports, 1)
	assert.Equal(t, 0, failures)
	assert.Equal(t, "exp/run/stage-2", reports[0].Run.UID)
}

// --- fetchRunFolderStreaming tests ---

func TestFetchRunFolderStreaming_CallsCallback(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  throughput: {output_tokens_per_sec: 10, requests_per_sec: 1, total_tokens_per_sec: 15}
  time: {duration: 30}
  requests: {total: 50, failures: 0}
scenario:
  host:
    type: ["decode"]
    accelerator: [{count: 1, model: T4, parallelism: {dp: 1, tp: 1, pp: 1, ep: 1}}]
  load: {metadata: {stage: 1}, name: test}
  platform: {engine: [{name: vllm}]}
`
	callNum := 0
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				callNum++
				if callNum == 1 {
					resp := driveFileList{
						Files: []driveFile{
							{ID: "y1", Name: "benchmark_report_s1.yaml", MimeType: "text/plain"},
						},
					}
					data, _ := json.Marshal(resp)
					return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
				}
				return &http.Response{StatusCode: http.StatusOK, Body: nopCloser([]byte(yamlContent)), Header: http.Header{"Content-Type": []string{"text/plain"}}}, nil
			}),
		},
	}

	var streamed []BenchmarkReport
	reports, failures, err := h.fetchRunFolderStreaming(context.Background(), "stream-folder", "exp", "run", func(r BenchmarkReport) {
		streamed = append(streamed, r)
	})
	require.NoError(t, err)
	assert.Len(t, reports, 1)
	assert.Len(t, streamed, 1)
	assert.Equal(t, 0, failures)
	assert.Equal(t, reports[0].Run.UID, streamed[0].Run.UID)
}

func TestFetchRunFolderStreaming_ErrorPropagation(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				// Return 500 (not retried) to avoid slow backoff in tests
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       nopCloser([]byte("server error")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	_, _, err := h.fetchRunFolderStreaming(context.Background(), "err-folder", "exp", "run", func(r BenchmarkReport) {
		t.Fatal("callback should not be called on error")
	})
	assert.Error(t, err)
}

// --- fetchAllReports tests ---

func TestFetchAllReports_EmptyFolder(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root-folder",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				resp := driveFileList{Files: []driveFile{}}
				data, _ := json.Marshal(resp)
				return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
			}),
		},
	}

	reports, failures, err := h.fetchAllReports(context.Background(), time.Time{})
	require.NoError(t, err)
	assert.Empty(t, reports)
	assert.Equal(t, 0, failures)
}

func TestFetchAllReports_FiltersNonFolders(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root-folder",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				// Top-level contains only a regular file, no experiment folders
				resp := driveFileList{
					Files: []driveFile{
						{ID: "readme", Name: "README.md", MimeType: "text/plain"},
					},
				}
				data, _ := json.Marshal(resp)
				return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
			}),
		},
	}

	reports, failures, err := h.fetchAllReports(context.Background(), time.Time{})
	require.NoError(t, err)
	assert.Empty(t, reports)
	assert.Equal(t, 0, failures)
}

func TestFetchAllReports_CutoffFilter(t *testing.T) {
	now := time.Now()
	cutoff := now.Add(-24 * time.Hour)

	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root-folder",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				// Top-level: one recent folder, one old folder
				resp := driveFileList{
					Files: []driveFile{
						{ID: "old", Name: "old-exp", MimeType: driveFolderMIME, CreatedTime: cutoff.Add(-48 * time.Hour).Format(time.RFC3339)},
						{ID: "new", Name: "new-exp", MimeType: driveFolderMIME, CreatedTime: now.Format(time.RFC3339)},
					},
				}
				data, _ := json.Marshal(resp)
				return &http.Response{StatusCode: http.StatusOK, Body: nopCloser(data), Header: http.Header{"Content-Type": []string{"application/json"}}}, nil
			}),
		},
	}

	// The "old" folder should be filtered out by cutoff
	reports, _, err := h.fetchAllReports(context.Background(), cutoff)
	require.NoError(t, err)
	// "new" experiment folder gets listed but has no run folders, so 0 reports
	assert.Empty(t, reports)
}

func TestFetchAllReports_TopLevelError(t *testing.T) {
	h := &BenchmarkHandlers{
		apiKey:   "key",
		folderID: "root-folder",
		cache:    &benchmarkCache{ttl: defaultCacheTTL},
		lastReq:  time.Now().Add(-time.Hour),
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				// Return 500 (not retried by driveGetWithRetry) to fail fast
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       nopCloser([]byte("server error")),
					Header:     http.Header{"Content-Type": []string{"text/plain"}},
				}, nil
			}),
		},
	}

	_, _, err := h.fetchAllReports(context.Background(), time.Time{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "listing top-level folder")
}

// --- helpers ---

// roundTripFunc adapts a function to the http.RoundTripper interface.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// nopCloser wraps bytes in an io.ReadCloser.
func nopCloser(data []byte) *nopReadCloser {
	return &nopReadCloser{reader: strings.NewReader(string(data))}
}

type nopReadCloser struct {
	reader *strings.Reader
}

func (n *nopReadCloser) Read(p []byte) (int, error) {
	return n.reader.Read(p)
}

func (n *nopReadCloser) Close() error {
	return nil
}
