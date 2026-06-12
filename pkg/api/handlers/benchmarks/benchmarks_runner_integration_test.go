package benchmarks

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

// mockDriveServer creates a test server that simulates Google Drive API responses.
// routeMap maps URL paths to handler functions.
func mockDriveServer(t *testing.T, routeMap map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for pattern, handler := range routeMap {
			if r.URL.Path == pattern {
				handler(w, r)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("not found: " + r.URL.Path))
	}))
}

func TestListDriveFolder_Pagination(t *testing.T) {
	callCount := atomic.Int32{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := callCount.Add(1)
		pageToken := r.URL.Query().Get("pageToken")

		var resp driveFileList
		if pageToken == "" && count == 1 {
			resp = driveFileList{
				Files: []driveFile{
					{ID: "f1", Name: "experiment-1", MimeType: driveFolderMIME, CreatedTime: "2025-05-01T10:00:00Z"},
				},
				NextPageToken: "page2",
			}
		} else {
			resp = driveFileList{
				Files: []driveFile{
					{ID: "f2", Name: "experiment-2", MimeType: driveFolderMIME, CreatedTime: "2025-06-01T10:00:00Z"},
				},
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	// Override driveAPIBase by patching the URL construction — we use the test server
	// by overriding the client's transport to route all requests to our server.
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	files, err := h.listDriveFolder(ctx, "root-folder")

	require.NoError(t, err)
	require.Len(t, files, 2)
	require.Equal(t, "experiment-1", files[0].Name)
	require.Equal(t, "experiment-2", files[1].Name)
}

func TestListDriveFolder_ErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal server error"))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	_, err := h.listDriveFolder(ctx, "bad-folder")

	require.Error(t, err)
	require.Contains(t, err.Error(), "500")
}

func TestListDriveFolder_ContextCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(driveFileList{})
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := h.listDriveFolder(ctx, "folder")
	require.Error(t, err)
}

func TestDownloadAndParseReport_Success(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  latency:
    time_to_first_token:
      units: ms
      mean: 123.4
    request_latency:
      units: ms
      mean: 500.0
  throughput:
    output_tokens_per_sec: 42.0
    requests_per_sec: 10.0
    total_tokens_per_sec: 50.0
  requests:
    total: 100
    failures: 2
  time:
    duration: 60.0
scenario:
  host:
    accelerator:
      - count: 4
        model: H100
        parallelism:
          dp: 1
          ep: 1
          pp: 1
          tp: 4
    type:
      - DGX
  load:
    args:
      concurrency: 16
      duration: 60
    tool: genai-perf
`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(yamlContent))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: srv.Client()}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	file := driveFile{ID: "file1", Name: "benchmark_report_001.yaml", CreatedTime: "2025-05-10T15:30:00Z"}

	report, err := h.downloadAndParseReport(ctx, file, "exp-1", "run-1")
	require.NoError(t, err)
	require.Equal(t, "0.2", report.Version)
	require.Equal(t, "exp-1/run-1", report.Run.EID)
	require.Contains(t, report.Run.UID, "exp-1/run-1")
	require.Equal(t, 100, report.Results.RequestPerformance.Aggregate.Requests.Total)
	require.Equal(t, 2, report.Results.RequestPerformance.Aggregate.Requests.Failures)
}

func TestDownloadAndParseReport_InvalidYAML(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not: valid: yaml: [[["))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: srv.Client()}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	file := driveFile{ID: "file2", Name: "benchmark_report_bad.yaml"}

	_, err := h.downloadAndParseReport(ctx, file, "exp-1", "run-1")
	require.Error(t, err)
}

func TestDownloadAndParseReport_DownloadError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte("access denied"))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: srv.Client()}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	file := driveFile{ID: "file3", Name: "benchmark_report_003.yaml"}

	_, err := h.downloadAndParseReport(ctx, file, "exp-1", "run-1")
	require.Error(t, err)
	require.Contains(t, err.Error(), "403")
}

func TestFetchRunFolder_DirectFiles(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  latency:
    request_latency:
      units: ms
      mean: 200.0
  throughput:
    output_tokens_per_sec: 30.0
    requests_per_sec: 5.0
    total_tokens_per_sec: 35.0
  requests:
    total: 50
    failures: 0
  time:
    duration: 30.0
scenario:
  host:
    accelerator: []
    type: []
  load:
    args:
      concurrency: 8
      duration: 30
    tool: wrk
`
	requestCount := atomic.Int32{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := requestCount.Add(1)
		q := r.URL.Query().Get("q")

		// First request: listDriveFolder for the run folder
		if q != "" {
			resp := driveFileList{
				Files: []driveFile{
					{ID: "bf1", Name: "benchmark_report_001.yaml", MimeType: "text/yaml"},
					{ID: "bf2", Name: "benchmark_report_002.yaml", MimeType: "text/yaml"},
					{ID: "readme", Name: "README.md", MimeType: "text/plain"},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}

		// Subsequent requests: download files
		_ = count
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(yamlContent))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	reports, failures, err := h.fetchRunFolder(ctx, "run-folder-1", "experiment-1", "run-1")

	require.NoError(t, err)
	require.Len(t, reports, 2)
	require.Equal(t, 0, failures)
	require.Equal(t, "experiment-1/run-1", reports[0].Run.EID)
}

func TestFetchRunFolder_NestedResultsLayout(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  latency: {}
  throughput:
    output_tokens_per_sec: 10.0
    requests_per_sec: 2.0
    total_tokens_per_sec: 12.0
  requests:
    total: 20
    failures: 1
  time:
    duration: 10.0
scenario:
  host:
    accelerator: []
    type: []
  load:
    args:
      concurrency: 4
      duration: 10
    tool: hey
`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")

		if q != "" {
			// Use strings.Contains to match the folder ID in the query
			switch {
			case contains(q, "run-folder-nested"):
				resp := driveFileList{
					Files: []driveFile{
						{ID: "results-folder", Name: "results", MimeType: driveFolderMIME},
						{ID: "logs-folder", Name: "logs", MimeType: driveFolderMIME},
					},
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(resp)
			case contains(q, "results-folder"):
				resp := driveFileList{
					Files: []driveFile{
						{ID: "result-1", Name: "result-001", MimeType: driveFolderMIME},
					},
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(resp)
			case contains(q, "result-1"):
				resp := driveFileList{
					Files: []driveFile{
						{ID: "nested-bf", Name: "benchmark_report_nested.yaml", MimeType: "text/yaml"},
					},
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(resp)
			default:
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(driveFileList{})
			}
			return
		}

		// Download request
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(yamlContent))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	reports, failures, err := h.fetchRunFolder(ctx, "run-folder-nested", "exp-nested", "run-nested")

	require.NoError(t, err)
	require.Len(t, reports, 1)
	require.Equal(t, 0, failures)
	require.Equal(t, "exp-nested/run-nested", reports[0].Run.EID)
}

func TestFetchRunFolder_ListError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("server error"))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	_, _, err := h.fetchRunFolder(ctx, "bad-folder", "exp", "run")
	require.Error(t, err)
}

func TestFetchRunFolderStreaming_CallsOnReport(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  latency: {}
  throughput:
    output_tokens_per_sec: 5.0
    requests_per_sec: 1.0
    total_tokens_per_sec: 6.0
  requests:
    total: 10
    failures: 0
  time:
    duration: 5.0
scenario:
  host:
    accelerator: []
    type: []
  load:
    args:
      concurrency: 2
      duration: 5
    tool: ab
`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if q != "" {
			resp := driveFileList{
				Files: []driveFile{
					{ID: "s1", Name: "benchmark_report_stream.yaml", MimeType: "text/yaml"},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(yamlContent))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	var streamed []BenchmarkReport
	reports, failures, err := h.fetchRunFolderStreaming(ctx, "stream-folder", "exp-s", "run-s", func(r BenchmarkReport) {
		streamed = append(streamed, r)
	})

	require.NoError(t, err)
	require.Len(t, reports, 1)
	require.Len(t, streamed, 1)
	require.Equal(t, 0, failures)
	require.Equal(t, "exp-s/run-s", streamed[0].Run.EID)
}

func TestCollectBenchmarkFiles_FiltersByPrefix(t *testing.T) {
	yamlContent := `version: "0.1"
metrics:
  latency: {}
  throughput: {}
  requests:
    total: 1
    failures: 0
  time:
    duration: 1.0
scenario:
  host:
    accelerator: []
    type: []
  load:
    args: {}
    tool: test
`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		if q != "" {
			resp := driveFileList{
				Files: []driveFile{
					{ID: "valid", Name: "benchmark_report_001.yaml", MimeType: "text/yaml"},
					{ID: "invalid-name", Name: "other_file.yaml", MimeType: "text/yaml"},
					{ID: "no-suffix", Name: "benchmark_report_001.txt", MimeType: "text/plain"},
					{ID: "subfolder", Name: "nested", MimeType: driveFolderMIME},
				},
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(yamlContent))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: srv.Client(),
	}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	reports, failures, err := h.collectBenchmarkFiles(ctx, "collect-folder", "exp-c", "run-c")

	require.NoError(t, err)
	require.Len(t, reports, 1, "should only parse files matching benchmark_report*.yaml")
	require.Equal(t, 0, failures)
}

func TestDownloadDriveFile_Success(t *testing.T) {
	content := "benchmark yaml content here"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(content))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: srv.Client()}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	data, err := h.downloadDriveFile(ctx, "file-id-123")

	require.NoError(t, err)
	require.Equal(t, content, string(data))
}

func TestDownloadDriveFile_Non200Error(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("file not found"))
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: srv.Client()}
	h.client.Transport = &rewriteTransport{base: srv.URL}

	ctx := context.Background()
	_, err := h.downloadDriveFile(ctx, "missing-file")

	require.Error(t, err)
	require.Contains(t, err.Error(), "404")
}

// rewriteTransport rewrites all request URLs to point to the test server.
type rewriteTransport struct {
	base string
}

func (t *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.URL.Scheme = "http"
	req.URL.Host = t.base[len("http://"):]
	return http.DefaultTransport.RoundTrip(req)
}

// contains is a test helper for matching folder IDs in Drive API query strings.
func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
