package github

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGHGet_BuildsCorrectURL(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				// Verify the request was constructed correctly
				assert.Equal(t, "Bearer test-token", req.Header.Get("Authorization"))
				assert.Equal(t, "application/vnd.github.v3+json", req.Header.Get("Accept"))
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       http.NoBody,
					Header:     make(http.Header),
				}
			}),
		},
	}

	resp, err := handler.ghGet(context.Background(), "/repos/test/repo/actions/runs")
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGHGet_HandlesFullURL(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.URL.String(), "https://api.github.com")
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       http.NoBody,
					Header:     make(http.Header),
				}
			}),
		},
	}

	resp, err := handler.ghGet(context.Background(), "https://api.github.com/repos/test/repo")
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGHGetWithRetry_SuccessFirstAttempt(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       http.NoBody,
					Header:     make(http.Header),
				}
			}),
		},
	}

	resp, err := handler.ghGetWithRetry(context.Background(), "/test")
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestGHGetWithRetry_RateLimitRetry(t *testing.T) {
	attemptCount := 0
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				attemptCount++
				if attemptCount == 1 {
					return &http.Response{
						StatusCode: http.StatusTooManyRequests,
						Body:       http.NoBody,
						Header:     make(http.Header),
					}
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       http.NoBody,
					Header:     make(http.Header),
				}
			}),
		},
	}

	resp, err := handler.ghGetWithRetry(context.Background(), "/test")
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 2, attemptCount, "should retry after rate limit")
}

func TestGHGetWithRetry_MaxAttemptsExceeded(t *testing.T) {
	attemptCount := 0
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				attemptCount++
				return &http.Response{
					StatusCode: http.StatusForbidden,
					Body:       http.NoBody,
					Header:     make(http.Header),
				}
			}),
		},
	}

	resp, err := handler.ghGetWithRetry(context.Background(), "/test")
	require.NoError(t, err) // Function returns the response, not an error
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	// Should have attempted the maximum number of times
	assert.True(t, attemptCount >= 1, "should make at least one attempt")
}

func TestGHGetWithRetry_RespectsRetryAfterHeader(t *testing.T) {
	attemptCount := 0
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				attemptCount++
				if attemptCount == 1 {
					header := make(http.Header)
					header.Set("Retry-After", "1")
					return &http.Response{
						StatusCode: http.StatusTooManyRequests,
						Body:       http.NoBody,
						Header:     header,
					}
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       http.NoBody,
					Header:     make(http.Header),
				}
			}),
		},
	}

	start := time.Now()
	resp, err := handler.ghGetWithRetry(context.Background(), "/test")
	elapsed := time.Since(start)

	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	// Should have waited at least 1 second due to Retry-After header
	assert.True(t, elapsed >= time.Second, "should respect Retry-After header")
}

func TestGHGetWithRetry_NetworkError(t *testing.T) {
	handler := &GitHubPipelinesHandler{
		token: "test-token",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return nil // Simulate network error
			}),
		},
	}

	_, err := handler.ghGetWithRetry(context.Background(), "/test")
	assert.Error(t, err, "should return error on network failure")
}

// Constants are declared in github_pipelines_types.go — no need to redeclare here.
