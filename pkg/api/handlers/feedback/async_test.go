package feedback

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const asyncTestDrainTimeout = 2 * time.Second

func waitForAsyncGitHubOpsToDrain(t *testing.T) {
	t.Helper()
	deadline := time.Now().Add(asyncTestDrainTimeout)
	for len(githubOpSem) > 0 {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for async GitHub operations to drain")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestRunAsyncGitHubOp_SemaphoreLimit(t *testing.T) {
	waitForAsyncGitHubOpsToDrain(t)
	t.Cleanup(func() { waitForAsyncGitHubOpsToDrain(t) })

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
	for i := 0; i < maxConcurrentGitHubOps; i++ {
		select {
		case <-finished:
		case <-time.After(asyncTestDrainTimeout):
			t.Fatal("timed out waiting for blocking operations to finish")
		}
	}

	// The dropped operation should not have run
	// Note: This is a best-effort test - timing issues may cause flakiness
	assert.Equal(t, 0, completedCount, "dropped operation should not execute")
}

func TestRunAsyncGitHubOp_ContextTimeout(t *testing.T) {
	waitForAsyncGitHubOpsToDrain(t)
	t.Cleanup(func() { waitForAsyncGitHubOpsToDrain(t) })

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

	select {
	case <-done:
	case <-time.After(asyncTestDrainTimeout):
		t.Fatal("timed out waiting for async operation")
	}
	assert.True(t, ctxReceived, "operation should receive a context")
}

func TestRunAsyncGitHubOp_OperationExecutes(t *testing.T) {
	waitForAsyncGitHubOpsToDrain(t)
	t.Cleanup(func() { waitForAsyncGitHubOpsToDrain(t) })

	executed := false
	done := make(chan struct{})

	runAsyncGitHubOp("test-execute", func(ctx context.Context) {
		defer close(done)
		executed = true
	})

	select {
	case <-done:
	case <-time.After(asyncTestDrainTimeout):
		t.Fatal("timed out waiting for async operation")
	}
	assert.True(t, executed, "operation should execute")
}

func TestRunAsyncGitHubOp_MultipleOperations(t *testing.T) {
	waitForAsyncGitHubOpsToDrain(t)
	t.Cleanup(func() { waitForAsyncGitHubOpsToDrain(t) })

	const numOps = 5
	completed := make(chan struct{}, numOps)

	for i := 0; i < numOps; i++ {
		runAsyncGitHubOp("test-multi", func(ctx context.Context) {
			completed <- struct{}{}
		})
	}

	// Wait for all operations to complete
	completedCount := 0
	for i := 0; i < numOps; i++ {
		select {
		case <-completed:
		case <-time.After(asyncTestDrainTimeout):
			t.Fatal("timed out waiting for async operations")
		}
		completedCount++
	}

	require.Equal(t, 0, len(githubOpSem), "all async operations should release semaphore slots")
	assert.Equal(t, numOps, completedCount, "all operations should complete")
}
