package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"
)

// githubOpSem limits the number of concurrent fire-and-forget GitHub
// operations across all feedback handlers (#11827).
var githubOpSem = make(chan struct{}, maxConcurrentGitHubOps)

// runAsyncGitHubOp runs fn in a background goroutine with:
//   - a bounded semaphore to prevent goroutine explosion
//   - a timeout-scoped context
//   - panic recovery with structured logging
//
// The operation name is used in log messages for diagnosis.
func runAsyncGitHubOp(operation string, fn func(ctx context.Context)) {
	select {
	case githubOpSem <- struct{}{}:
	default:
		slog.Warn("GitHub async op dropped: semaphore full",
			slog.String("operation", operation))
		return
	}
	go func() {
		defer func() { <-githubOpSem }()
		defer func() {
			if r := recover(); r != nil {
				slog.Error("panic in async GitHub operation",
					slog.String("operation", operation),
					slog.String("panic", fmt.Sprintf("%v", r)),
					slog.String("stack", string(debug.Stack())))
			}
		}()
		ctx, cancel := context.WithTimeout(context.Background(), backgroundGitHubOpTimeout)
		defer cancel()
		fn(ctx)
	}()
}
