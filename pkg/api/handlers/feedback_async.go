package handlers

import (
	"context"
	"log/slog"

	"github.com/kubestellar/console/pkg/safego"
)

// githubOpSem limits the number of concurrent fire-and-forget GitHub
// operations across all feedback handlers (#11827).
var githubOpSem = make(chan struct{}, maxConcurrentGitHubOps)

// runAsyncGitHubOp runs fn in a background goroutine with:
//   - a bounded semaphore to prevent goroutine explosion
//   - a timeout-scoped context
//   - safego panic recovery with structured logging
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
	safego.GoWith("github-async-op", func() {
		defer func() { <-githubOpSem }()
		ctx, cancel := context.WithTimeout(context.Background(), backgroundGitHubOpTimeout)
		defer cancel()
		fn(ctx)
	})
}
