package httputil

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func alwaysRetryableClassifier() func(resp *http.Response, err error) RetryDecision {
	return func(resp *http.Response, err error) RetryDecision {
		if err != nil {
			return RetryDecision{Retry: false, Err: err}
		}
		if resp.StatusCode == http.StatusOK {
			return RetryDecision{Retry: false}
		}
		return RetryDecision{Retry: true, Err: errors.New("retryable status")}
	}
}

func TestDoWithRetry_SucceedsFirstAttempt(t *testing.T) {
	calls := 0
	resp, err := DoWithRetry(context.Background(), RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond},
		func() (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: http.StatusOK}, nil
		},
		alwaysRetryableClassifier(),
	)
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, 1, calls)
}

func TestDoWithRetry_RetriesThenSucceeds(t *testing.T) {
	calls := 0
	resp, err := DoWithRetry(context.Background(), RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond},
		func() (*http.Response, error) {
			calls++
			if calls < 3 {
				return &http.Response{StatusCode: http.StatusTooManyRequests}, nil
			}
			return &http.Response{StatusCode: http.StatusOK}, nil
		},
		alwaysRetryableClassifier(),
	)
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, 3, calls)
}

func TestDoWithRetry_ExhaustsAttempts(t *testing.T) {
	calls := 0
	resp, err := DoWithRetry(context.Background(), RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond},
		func() (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: http.StatusTooManyRequests}, nil
		},
		alwaysRetryableClassifier(),
	)
	require.Error(t, err)
	require.Nil(t, resp)
	require.Equal(t, 3, calls)
}

func TestDoWithRetry_RespectsContextCancellationDuringBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, err := DoWithRetry(ctx, RetryConfig{MaxAttempts: 5, BaseDelay: time.Second},
		func() (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: http.StatusTooManyRequests}, nil
		},
		alwaysRetryableClassifier(),
	)
	require.Error(t, err)
	require.Equal(t, 1, calls)
}

func TestDoWithRetry_RespectsRetryAfterHeader(t *testing.T) {
	calls := 0
	start := time.Now()
	_, err := DoWithRetry(context.Background(), RetryConfig{MaxAttempts: 2, BaseDelay: time.Hour, RespectRetryAfter: true},
		func() (*http.Response, error) {
			calls++
			if calls == 1 {
				header := make(http.Header)
				header.Set("Retry-After", "1")
				resp := &http.Response{StatusCode: http.StatusTooManyRequests, Header: header}
				return resp, nil
			}
			return &http.Response{StatusCode: http.StatusOK}, nil
		},
		alwaysRetryableClassifier(),
	)
	require.NoError(t, err)
	elapsed := time.Since(start)
	require.GreaterOrEqual(t, elapsed, time.Second, "should wait at least the Retry-After duration")
	require.Less(t, elapsed, 5*time.Second, "Retry-After=1 should override the 1h base delay")
}

func TestDoWithRetry_NetworkErrorNotRetriedByDefault(t *testing.T) {
	calls := 0
	_, err := DoWithRetry(context.Background(), RetryConfig{MaxAttempts: 3, BaseDelay: time.Millisecond},
		func() (*http.Response, error) {
			calls++
			return nil, errors.New("boom")
		},
		alwaysRetryableClassifier(),
	)
	require.Error(t, err)
	require.Equal(t, 1, calls)
}
