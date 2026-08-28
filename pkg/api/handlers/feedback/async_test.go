package feedback

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// asyncTestWaitTimeout bounds how long these tests wait on channels for
// async GitHub operations to complete, so a dropped/lost signal fails fast
// instead of hanging until the package-level `go test` timeout (#22870).
const asyncTestWaitTimeout = 5 * time.Second

func TestRunAsyncGitHubOp_SemaphoreLimit(t *testing.T) {
	completedCount := 0
	done := make(chan struct{})
	finished := make(chan struct{}, maxConcurrentGitHubOps)

	// Fill the semaphore to capacity
	for i := 0; i < maxConcurrentGitHubOps; i++ {
		runAsyncGitHubOp("test-fill", func(ctx context.Context) {
			<-done // Block until we signal
			finished <- struct{}{}
		})
	}

	// This operation should be dropped due to semaphore being full
	runAsyncGitHubOp("test-dropped", func(ctx context.Context) {
		completedCount++
	})

	// Release all blocking operations
	close(done)

	// Wait for all blocking operations to complete with timeout
	timeout := time.After(asyncTestWaitTimeout)
	for i := 0; i < maxConcurrentGitHubOps; i++ {
		select {
		case <-finished:
			// Operation completed
		case <-timeout:
			t.Fatalf("timeout waiting for blocking operations to complete: %d/%d finished", i, maxConcurrentGitHubOps)
		}
	}

	// The dropped operation should not have run
	// Note: This is a best-effort test - timing issues may cause flakiness
	assert.Equal(t, 0, completedCount, "dropped operation should not execute")
}

func TestRunAsyncGitHubOp_ContextTimeout(t *testing.T) {
	// This test verifies that the context provided to the operation
	// has a timeout configured. We can't easily test the actual timeout
	// without making the test slow, but we can verify the context is created.
	ctxReceived := false
	done := make(chan struct{})

	runAsyncGitHubOp("test-timeout", func(ctx context.Context) {
		defer close(done)
		if ctx != nil {
			ctxReceived = true
		}
	})

	<-done
	assert.True(t, ctxReceived, "operation should receive a context")
}

func TestRunAsyncGitHubOp_OperationExecutes(t *testing.T) {
	executed := false
	done := make(chan struct{})

	runAsyncGitHubOp("test-execute", func(ctx context.Context) {
		defer close(done)
		executed = true
	})

	<-done
	assert.True(t, executed, "operation should execute")
}

func TestRunAsyncGitHubOp_MultipleOperations(t *testing.T) {
	const numOps = 5
	completed := make(chan struct{}, numOps)

	for i := 0; i < numOps; i++ {
		runAsyncGitHubOp("test-multi", func(ctx context.Context) {
			completed <- struct{}{}
		})
	}

	// Wait for all operations to complete with timeout
	count := 0
	timeout := time.After(asyncTestWaitTimeout)
	for i := 0; i < numOps; i++ {
		select {
		case <-completed:
			count++
		case <-timeout:
			t.Fatalf("timeout waiting for operations: got %d/%d (semaphore may be saturated from prior tests)", count, numOps)
		}
	}

	assert.Equal(t, numOps, count, "all operations should complete")
}
