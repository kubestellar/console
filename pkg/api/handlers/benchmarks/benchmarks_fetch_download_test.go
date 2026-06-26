package benchmarks

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const benchmarkFetchDownloadTestYAML = `version: "0.1"
metrics:
  throughput:
    requests_per_sec: 7.5
    output_tokens_per_sec: 120.0
    total_tokens_per_sec: 160.0
  requests:
    total: 5
    failures: 1
  time:
    duration: 60
scenario:
  host:
    accelerator:
      - count: 8
        model: H100
        parallelism:
          dp: 1
          tp: 8
          pp: 1
          ep: 1
    type:
      - prefill
  load:
    name: genai-perf
    metadata:
      stage: 2
    args:
      server:
        type: vllm
      data:
        shared_prefix:
          system_prompt_len: 16
          question_len: 32
          output_len: 64
      load:
        stages:
          - rate: 7.5
            duration: 60
  model:
    name: llama-70b
  platform:
    engine:
      - name: vllm-0.4.0
`

func benchmarkParentFolderID(t *testing.T, r *http.Request) string {
	t.Helper()

	q := r.URL.Query().Get("q")
	parts := strings.Split(q, "'")
	require.GreaterOrEqual(t, len(parts), 3, "expected Google Drive q parameter to include quoted parent id")
	return parts[1]
}

func TestListDriveFolderFetchesAllPages(t *testing.T) {
	t.Parallel()

	requestedPageTokens := make([]string, 0, 2)

	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, driveUserAgent, r.Header.Get("User-Agent"))
		assert.Equal(t, "folder-1", benchmarkParentFolderID(t, r))
		assert.Equal(t, "1000", r.URL.Query().Get("pageSize"))
		assert.Equal(t, "true", r.URL.Query().Get("supportsAllDrives"))
		assert.Equal(t, "true", r.URL.Query().Get("includeItemsFromAllDrives"))
		assert.Equal(t, "test-key", r.URL.Query().Get("key"))

		pageToken := r.URL.Query().Get("pageToken")
		requestedPageTokens = append(requestedPageTokens, pageToken)

		w.Header().Set("Content-Type", "application/json")
		if pageToken == "" {
			fmt.Fprint(w, `{"files":[{"id":"page-1","name":"first.yaml","mimeType":"text/yaml","createdTime":"2025-06-01T10:00:00Z"}],"nextPageToken":"page-2"}`)
			return
		}

		fmt.Fprint(w, `{"files":[{"id":"page-2","name":"second.yaml","mimeType":"text/yaml","createdTime":"2025-06-02T10:00:00Z"}]}`)
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey: "test-key",
		client: client,
	}

	files, err := h.listDriveFolder(context.Background(), "folder-1")
	require.NoError(t, err)
	require.Len(t, files, 2)
	assert.Equal(t, []string{"", "page-2"}, requestedPageTokens)
	assert.Equal(t, "page-1", files[0].ID)
	assert.Equal(t, "page-2", files[1].ID)
}

func TestDownloadAndParseReportFetchesAndAdaptsDriveReport(t *testing.T) {
	t.Parallel()

	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, driveUserAgent, r.Header.Get("User-Agent"))
		assert.Equal(t, "/uc", r.URL.Path)
		assert.Equal(t, "file-123", r.URL.Query().Get("id"))
		assert.Equal(t, "download", r.URL.Query().Get("export"))
		fmt.Fprint(w, benchmarkFetchDownloadTestYAML)
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client}
	file := driveFile{
		ID:          "file-123",
		Name:        "benchmark_report_stage_2.yaml",
		CreatedTime: "2025-06-01T10:00:00Z",
	}

	report, err := h.downloadAndParseReport(context.Background(), file, "exp-1", "run-1")
	require.NoError(t, err)

	assert.Equal(t, "0.2", report.Version)
	assert.Equal(t, "exp-1/run-1/stage-2", report.Run.UID)
	assert.Equal(t, "exp-1/run-1", report.Run.EID)
	assert.Equal(t, "benchmark-ci", report.Run.User)
	assert.Equal(t, "PT60S", report.Run.Time.Duration)
	assert.Equal(t, "2025-06-01T09:59:00Z", report.Run.Time.Start)
	assert.Equal(t, "2025-06-01T10:00:00Z", report.Run.Time.End)
	require.Len(t, report.Scenario.Stack, 1)
	assert.Equal(t, "prefill", report.Scenario.Stack[0].Standardized.Role)
	assert.Equal(t, "vllm", report.Scenario.Stack[0].Standardized.Tool)
	assert.Equal(t, "llama-70b", report.Scenario.Stack[0].Standardized.Model.Name)
	require.NotNil(t, report.Results.RequestPerformance.Aggregate.Throughput.RequestRate)
	assert.Equal(t, 7.5, report.Results.RequestPerformance.Aggregate.Throughput.RequestRate.Mean)
	require.NotNil(t, report.Results.RequestPerformance.Aggregate.Throughput.InputTokenRate)
	assert.Equal(t, 40.0, report.Results.RequestPerformance.Aggregate.Throughput.InputTokenRate.Mean)
	assert.Equal(t, 5, report.Results.RequestPerformance.Aggregate.Requests.Total)
	assert.Equal(t, 1, report.Results.RequestPerformance.Aggregate.Requests.Failures)
}

func TestDownloadDriveFileReturnsHTTPErrorBody(t *testing.T) {
	t.Parallel()

	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "missing benchmark artifact", http.StatusNotFound)
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client}

	data, err := h.downloadDriveFile(context.Background(), "missing-file")
	require.Error(t, err)
	assert.Nil(t, data)
	assert.Contains(t, err.Error(), "Drive download returned 404")
	assert.Contains(t, err.Error(), "missing benchmark artifact")
}

func TestDownloadDriveFileRejectsOversizedResponse(t *testing.T) {
	t.Parallel()

	const chunkSize = 1024 * 1024

	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		chunk := strings.Repeat("x", chunkSize)
		for written := 0; written <= maxBenchmarkReportBytes; written += chunkSize {
			_, err := fmt.Fprint(w, chunk)
			require.NoError(t, err)
		}
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{client: client}

	data, err := h.downloadDriveFile(context.Background(), "too-large")
	require.Error(t, err)
	assert.Nil(t, data)
	assert.Contains(t, err.Error(), "exceeded max size")
}

func TestFetchAllReportsAggregatesDirectAndNestedRunReports(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	recentCreated := now.Format(time.RFC3339)
	oldCreated := now.Add(-30 * 24 * time.Hour).Format(time.RFC3339)

	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/uc" {
			switch r.URL.Query().Get("id") {
			case "report-direct", "report-nested-good":
				fmt.Fprint(w, benchmarkFetchDownloadTestYAML)
			case "report-nested-bad":
				fmt.Fprint(w, "not: [valid: yaml")
			default:
				http.Error(w, "unexpected file id", http.StatusNotFound)
			}
			return
		}

		parentID := benchmarkParentFolderID(t, r)
		w.Header().Set("Content-Type", "application/json")

		switch parentID {
		case "root-folder":
			fmt.Fprintf(w, `{"files":[
				{"id":"exp-recent","name":"exp-recent","mimeType":"%s","createdTime":"%s"},
				{"id":"exp-old","name":"exp-old","mimeType":"%s","createdTime":"%s"},
				{"id":"notes","name":"notes.txt","mimeType":"text/plain","createdTime":"%s"}
			]}`, driveFolderMIME, recentCreated, driveFolderMIME, oldCreated, recentCreated)
		case "exp-recent":
			fmt.Fprintf(w, `{"files":[
				{"id":"run-direct","name":"run-direct","mimeType":"%s","createdTime":"%s"},
				{"id":"run-nested","name":"run-nested","mimeType":"%s","createdTime":"%s"}
			]}`, driveFolderMIME, recentCreated, driveFolderMIME, recentCreated)
		case "run-direct":
			fmt.Fprintf(w, `{"files":[
				{"id":"report-direct","name":"benchmark_report_direct.yaml","mimeType":"text/yaml","createdTime":"%s"}
			]}`, recentCreated)
		case "run-nested":
			fmt.Fprintf(w, `{"files":[
				{"id":"nested-results","name":"results","mimeType":"%s","createdTime":"%s"}
			]}`, driveFolderMIME, recentCreated)
		case "nested-results":
			fmt.Fprintf(w, `{"files":[
				{"id":"nested-folder","name":"nested-folder","mimeType":"%s","createdTime":"%s"}
			]}`, driveFolderMIME, recentCreated)
		case "nested-folder":
			fmt.Fprintf(w, `{"files":[
				{"id":"report-nested-good","name":"benchmark_report_nested_good.yaml","mimeType":"text/yaml","createdTime":"%s"},
				{"id":"report-nested-bad","name":"benchmark_report_nested_bad.yaml","mimeType":"text/yaml","createdTime":"%s"}
			]}`, recentCreated, recentCreated)
		default:
			http.Error(w, "unexpected folder id", http.StatusNotFound)
		}
	}))
	defer srv.Close()

	h := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "root-folder",
		client:   client,
	}

	reports, failures, err := h.fetchAllReports(context.Background(), now.Add(-7*24*time.Hour))
	require.NoError(t, err)
	require.Len(t, reports, 2)
	assert.Equal(t, 1, failures)

	ids := []string{reports[0].Run.EID, reports[1].Run.EID}
	assert.Contains(t, ids, "exp-recent/run-direct")
	assert.Contains(t, ids, "exp-recent/run-nested")
	for _, report := range reports {
		assert.NotContains(t, report.Run.EID, "exp-old")
	}
}
