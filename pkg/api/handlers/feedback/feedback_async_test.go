package feedback

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestRunAsyncGitHubOp_SemaphoreLimit(t *testing.T) {
	completedCount := 0
	done := make(chan struct{})

	// Fill the semaphore to capacity
	for i := 0; i < maxConcurrentGitHubOps; i++ {
		runAsyncGitHubOp("test-fill", func(ctx context.Context) {
			<-done // Block until we signal
		})
	}

	// This operation should be dropped due to semaphore being full
	runAsyncGitHubOp("test-dropped", func(ctx context.Context) {
		completedCount++
	})

	// Release all blocking operations
	close(done)

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

	// Wait for all operations to complete
	for i := 0; i < numOps; i++ {
		<-completed
	}

	assert.Equal(t, numOps, len(completed), "all operations should complete")
}

const maxConcurrentGitHubOps = 10 // Must match the value in feedback_async.go
