package httputil

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// RetryDecision tells DoWithRetry whether to retry the attempt that was just
// classified, and what to do if it does not retry (or if attempts run out).
type RetryDecision struct {
	// Retry requests another attempt. The classifier is responsible for
	// draining/closing resp.Body before returning Retry: true, since only it
	// knows whether the body is needed to build Err.
	Retry bool
	// Err is the error to return when Retry is false and resp is nil, or
	// when attempts are exhausted while Retry was true on the final attempt.
	Err error
}

// RetryConfig configures DoWithRetry's attempt count and backoff.
type RetryConfig struct {
	// MaxAttempts is the total number of attempts, including the first.
	MaxAttempts int
	// BaseDelay is the backoff before the 2nd attempt; it doubles with each
	// subsequent attempt (exponential backoff).
	BaseDelay time.Duration
	// MaxDelay caps the computed (or Retry-After) backoff. Zero means
	// uncapped.
	MaxDelay time.Duration
	// RespectRetryAfter, when true, uses a retried response's Retry-After
	// header (seconds) as the backoff instead of the computed exponential
	// value, still subject to MaxDelay.
	RespectRetryAfter bool
	// OnRetry, if set, is called before each retry's backoff sleep, for
	// logging. attempt is the 1-based index of the attempt that was just
	// classified as retryable.
	OnRetry func(attempt int, backoff time.Duration)
}

// DoWithRetry calls do up to cfg.MaxAttempts times. After each call,
// classify inspects the (resp, err) pair and decides whether to retry.
// classify must drain/close resp.Body itself before returning Retry: true,
// since body handling (reading it into an error message, or discarding it)
// is caller-specific. DoWithRetry owns attempt counting, backoff
// computation (including optional Retry-After support), and context
// cancellation during backoff sleeps.
func DoWithRetry(ctx context.Context, cfg RetryConfig, do func() (*http.Response, error), classify func(resp *http.Response, err error) RetryDecision) (*http.Response, error) {
	var lastErr error
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		resp, err := do()
		decision := classify(resp, err)
		if !decision.Retry {
			if decision.Err != nil {
				return nil, decision.Err
			}
			return resp, nil
		}
		lastErr = decision.Err

		if attempt == cfg.MaxAttempts {
			break
		}

		backoff := cfg.BaseDelay * time.Duration(int64(1)<<uint(attempt-1))
		if cfg.RespectRetryAfter && resp != nil {
			if ra := resp.Header.Get("Retry-After"); ra != "" {
				if secs, parseErr := strconv.Atoi(strings.TrimSpace(ra)); parseErr == nil && secs > 0 {
					backoff = time.Duration(secs) * time.Second
				}
			}
		}
		if cfg.MaxDelay > 0 && backoff > cfg.MaxDelay {
			backoff = cfg.MaxDelay
		}

		if cfg.OnRetry != nil {
			cfg.OnRetry(attempt, backoff)
		}

		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}
