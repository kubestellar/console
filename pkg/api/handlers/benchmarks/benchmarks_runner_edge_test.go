package benchmarks

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testThrottleTimeout    = 10 * time.Millisecond
	testRetryTimeout       = 50 * time.Millisecond
	benchmarkFetchLookback = 7 * 24 * time.Hour
	benchmarkOldRunAge     = 30 * 24 * time.Hour
)

type failingReadCloser struct {
	err error
}

func (f failingReadCloser) Read(_ []byte) (int, error) {
	return 0, f.err
}

func (f failingReadCloser) Close() error {
	return nil
}

func TestDriveGetEdgeCases(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		handler     *BenchmarkHandlers
		ctx         func() (context.Context, context.CancelFunc)
		url         string
		assertError func(*testing.T, error)
	}{
		{
			name:    "returns deadline error when throttle wait is cancelled",
			handler: &BenchmarkHandlers{lastReq: time.Now()},
			ctx: func() (context.Context, context.CancelFunc) {
				return context.WithTimeout(context.Background(), testThrottleTimeout)
			},
			url: "http://example.com",
			assertError: func(t *testing.T, err error) {
				t.Helper()
				require.Error(t, err)
				assert.ErrorIs(t, err, context.DeadlineExceeded)
			},
		},
		{
			name:    "returns request construction error for invalid url",
			handler: &BenchmarkHandlers{client: &http.Client{}},
			ctx: func() (context.Context, context.CancelFunc) {
				return context.WithCancel(context.Background())
			},
			url: ":bad-url",
			assertError: func(t *testing.T, err error) {
				t.Helper()
				require.Error(t, err)
				assert.Contains(t, err.Error(), "missing protocol scheme")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx, cancel := tt.ctx()
			defer cancel()

			resp, err := tt.handler.driveGet(ctx, tt.url)
			assert.Nil(t, resp)
			tt.assertError(t, err)
		})
	}
}

func TestDriveGetWithRetryUnreadableRetryBody(t *testing.T) {
	t.Parallel()

	handler := &BenchmarkHandlers{
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusForbidden,
					Body:       failingReadCloser{err: errors.New("read failed")},
					Header:     make(http.Header),
					Request:    req,
				}, nil
			}),
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), testRetryTimeout)
	defer cancel()

	resp, err := handler.driveGetWithRetry(ctx, "http://example.com/drive")
	require.Error(t, err)
	assert.Nil(t, resp)
	assert.ErrorIs(t, err, context.DeadlineExceeded)
}

func TestFetchAllReportsContinuesPastExperimentAndRunErrors(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	recentCreated := now.Format(time.RFC3339)
	oldCreated := now.Add(-benchmarkOldRunAge).Format(time.RFC3339)
	var brokenExperimentRequests atomic.Int32
	var brokenRunRequests atomic.Int32

	srv, client := newMockDriveServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/uc" {
			fmt.Fprint(w, benchmarkFetchDownloadTestYAML)
			return
		}

		parentID := benchmarkParentFolderID(t, r)
		switch parentID {
		case "root-folder":
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"files":[
				{"id":"exp-broken","name":"exp-broken","mimeType":"%s","createdTime":"%s"},
				{"id":"exp-live","name":"exp-live","mimeType":"%s","createdTime":"%s"},
				{"id":"notes","name":"notes.txt","mimeType":"text/plain","createdTime":"%s"}
			]}`, driveFolderMIME, recentCreated, driveFolderMIME, recentCreated, recentCreated)
		case "exp-broken":
			brokenExperimentRequests.Add(1)
			http.Error(w, "experiment listing failed", http.StatusInternalServerError)
		case "exp-live":
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"files":[
				{"id":"notes","name":"notes.txt","mimeType":"text/plain","createdTime":"%s"},
				{"id":"run-old","name":"run-old","mimeType":"%s","createdTime":"%s"},
				{"id":"run-broken","name":"run-broken","mimeType":"%s","createdTime":"%s"},
				{"id":"run-ok","name":"run-ok","mimeType":"%s","createdTime":"%s"}
			]}`, recentCreated, driveFolderMIME, oldCreated, driveFolderMIME, recentCreated, driveFolderMIME, recentCreated)
		case "run-broken":
			brokenRunRequests.Add(1)
			http.Error(w, "run listing failed", http.StatusInternalServerError)
		case "run-ok":
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprintf(w, `{"files":[
				{"id":"report-ok","name":"benchmark_report_ok.yaml","mimeType":"text/yaml","createdTime":"%s"}
			]}`, recentCreated)
		default:
			http.Error(w, "unexpected folder id", http.StatusNotFound)
		}
	}))
	defer srv.Close()

	handler := &BenchmarkHandlers{
		apiKey:   "test-key",
		folderID: "root-folder",
		client:   client,
	}

	reports, failures, err := handler.fetchAllReports(context.Background(), now.Add(-benchmarkFetchLookback))
	require.NoError(t, err)
	require.Len(t, reports, 1)
	assert.Equal(t, 0, failures)
	assert.Equal(t, "exp-live/run-ok", reports[0].Run.EID)
	assert.EqualValues(t, 1, brokenExperimentRequests.Load())
	assert.EqualValues(t, 1, brokenRunRequests.Load())
}

func TestFetchRunFolderNestedEdgeCases(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name             string
		handler          http.Handler
		expectedReports  int
		expectedFailures int
	}{
		{
			name: "ignores results folder listing errors",
			handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				parentID := benchmarkParentFolderID(t, r)
				switch parentID {
				case "run-folder":
					fmt.Fprintf(w, `{"files":[{"id":"results-folder","name":"results","mimeType":"%s","createdTime":"2025-06-01T10:00:00Z"}]}`, driveFolderMIME)
				case "results-folder":
					http.Error(w, "results unavailable", http.StatusInternalServerError)
				default:
					http.Error(w, "unexpected folder id", http.StatusNotFound)
				}
			}),
			expectedReports:  0,
			expectedFailures: 0,
		},
		{
			name: "skips non-folder entries in nested results listing",
			handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				parentID := benchmarkParentFolderID(t, r)
				switch parentID {
				case "run-folder":
					fmt.Fprintf(w, `{"files":[{"id":"results-folder","name":"results","mimeType":"%s","createdTime":"2025-06-01T10:00:00Z"}]}`, driveFolderMIME)
				case "results-folder":
					fmt.Fprint(w, `{"files":[{"id":"result-file","name":"result.txt","mimeType":"text/plain","createdTime":"2025-06-01T10:00:00Z"}]}`)
				default:
					http.Error(w, "unexpected folder id", http.StatusNotFound)
				}
			}),
			expectedReports:  0,
			expectedFailures: 0,
		},
		{
			name: "continues when nested result folder collection fails",
			handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				parentID := benchmarkParentFolderID(t, r)
				switch parentID {
				case "run-folder":
					fmt.Fprintf(w, `{"files":[{"id":"results-folder","name":"results","mimeType":"%s","createdTime":"2025-06-01T10:00:00Z"}]}`, driveFolderMIME)
				case "results-folder":
					fmt.Fprintf(w, `{"files":[{"id":"result-folder","name":"result-folder","mimeType":"%s","createdTime":"2025-06-01T10:00:00Z"}]}`, driveFolderMIME)
				case "result-folder":
					http.Error(w, "nested folder failed", http.StatusInternalServerError)
				default:
					http.Error(w, "unexpected folder id", http.StatusNotFound)
				}
			}),
			expectedReports:  0,
			expectedFailures: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, client := newMockDriveServer(tt.handler)
			defer srv.Close()

			handler := &BenchmarkHandlers{
				apiKey: "test-key",
				client: client,
			}

			reports, failures, err := handler.fetchRunFolder(context.Background(), "run-folder", "exp-1", "run-1")
			require.NoError(t, err)
			assert.Len(t, reports, tt.expectedReports)
			assert.Equal(t, tt.expectedFailures, failures)
		})
	}
}

func TestListDriveFolderErrorPaths(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		handler       http.HandlerFunc
		expectedError string
	}{
		{
			name: "returns non-200 response body",
			handler: func(w http.ResponseWriter, r *http.Request) {
				http.Error(w, "drive exploded", http.StatusInternalServerError)
			},
			expectedError: "Drive API returned 500",
		},
		{
			name: "returns decode error for malformed json",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
				fmt.Fprint(w, `{"files":`)
			},
			expectedError: "decoding response",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv, client := newMockDriveServer(http.HandlerFunc(tt.handler))
			defer srv.Close()

			handler := &BenchmarkHandlers{
				apiKey: "test-key",
				client: client,
			}

			files, err := handler.listDriveFolder(context.Background(), "folder-1")
			require.Error(t, err)
			assert.Nil(t, files)
			assert.Contains(t, err.Error(), tt.expectedError)
		})
	}
}

func TestDownloadDriveFileReadErrors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		response    *http.Response
		assertError func(*testing.T, error)
	}{
		{
			name: "surfaces placeholder when reading error response fails",
			response: &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       failingReadCloser{err: errors.New("boom")},
				Header:     make(http.Header),
			},
			assertError: func(t *testing.T, err error) {
				t.Helper()
				require.Error(t, err)
				assert.Contains(t, err.Error(), "(failed to read response body)")
			},
		},
		{
			name: "returns body read error for successful response",
			response: &http.Response{
				StatusCode: http.StatusOK,
				Body:       failingReadCloser{err: io.ErrUnexpectedEOF},
				Header:     make(http.Header),
			},
			assertError: func(t *testing.T, err error) {
				t.Helper()
				require.Error(t, err)
				assert.ErrorIs(t, err, io.ErrUnexpectedEOF)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := &BenchmarkHandlers{
				client: &http.Client{
					Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
						tt.response.Request = req
						return tt.response, nil
					}),
				},
			}

			data, err := handler.downloadDriveFile(context.Background(), "file-1")
			assert.Nil(t, data)
			tt.assertError(t, err)
		})
	}
}

func TestDriveGetPropagatesCustomTransportError(t *testing.T) {
	t.Parallel()

	transportErr := errors.New("dial failed")
	handler := &BenchmarkHandlers{
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				assert.Equal(t, driveUserAgent, req.Header.Get("User-Agent"))
				return nil, transportErr
			}),
		},
	}

	resp, err := handler.driveGet(context.Background(), "http://example.com/drive")
	require.Error(t, err)
	assert.Nil(t, resp)
	assert.Contains(t, err.Error(), transportErr.Error())
}
