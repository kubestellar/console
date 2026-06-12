package stellar

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestWorkerConstants(t *testing.T) {
	t.Run("stale approval review tick is reasonable", func(t *testing.T) {
		assert.Equal(t, 1*time.Hour, staleApprovalReviewTick)
		assert.Greater(t, staleApprovalReviewTick, 10*time.Minute)
		assert.LessOrEqual(t, staleApprovalReviewTick, 24*time.Hour)
	})

	t.Run("stale approval age cutoff is reasonable", func(t *testing.T) {
		assert.Equal(t, 1*time.Hour, staleApprovalAgeCutoff)
		assert.Greater(t, staleApprovalAgeCutoff, 10*time.Minute)
		assert.LessOrEqual(t, staleApprovalAgeCutoff, 24*time.Hour)
	})

	t.Run("stale review batch limit is reasonable", func(t *testing.T) {
		assert.Equal(t, 100, staleReviewBatchLimit)
		assert.Greater(t, staleReviewBatchLimit, 0)
		assert.LessOrEqual(t, staleReviewBatchLimit, 1000)
	})

	t.Run("digest check tick is reasonable", func(t *testing.T) {
		assert.Equal(t, 1*time.Hour, digestCheckTick)
		assert.Greater(t, digestCheckTick, 10*time.Minute)
		assert.LessOrEqual(t, digestCheckTick, 24*time.Hour)
	})

	t.Run("digest default hour is valid", func(t *testing.T) {
		assert.Equal(t, 7, digestDefaultHour)
		assert.GreaterOrEqual(t, digestDefaultHour, 0)
		assert.Less(t, digestDefaultHour, 24)
	})

	t.Run("digest lookback hours is reasonable", func(t *testing.T) {
		assert.Equal(t, 24, digestLookbackHrs)
		assert.Greater(t, digestLookbackHrs, 0)
		assert.LessOrEqual(t, digestLookbackHrs, 168) // 1 week
	})
}

func TestDigestMemoryConstants(t *testing.T) {
	t.Run("digest memory category is set", func(t *testing.T) {
		assert.Equal(t, "stellar.digest.fired", digestMemCategory)
		assert.NotEmpty(t, digestMemCategory)
	})

	t.Run("digest notification dedupe function format", func(t *testing.T) {
		assert.Equal(t, "digest:%s:%s", digestNotifDedupFn)
		assert.NotEmpty(t, digestNotifDedupFn)
	})
}

func TestStartStellarV2Workers(t *testing.T) {
	t.Run("does not panic when starting workers", func(t *testing.T) {
		handler := &Handler{}

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		// Should not panic
		assert.NotPanics(t, func() {
			handler.StartStellarV2Workers(ctx)
			// Cancel immediately to stop workers
			cancel()
			// Give workers time to exit
			time.Sleep(50 * time.Millisecond)
		})
	})
}

func TestRunStaleApprovalSweep(t *testing.T) {
	t.Run("handles nil store gracefully", func(t *testing.T) {
		handler := &Handler{
			store: nil,
		}

		ctx := context.Background()

		// Should not panic when store is nil
		assert.NotPanics(t, func() {
			handler.runStaleApprovalSweep(ctx)
		})
	})
}

func TestDeploymentNameFromPodNameWorkers(t *testing.T) {
	tests := []struct {
		name           string
		podName        string
		expectedResult string
	}{
		{
			name:           "pod with replica hash",
			podName:        "nginx-deployment-66b6c48dd5-abcde",
			expectedResult: "nginx-deployment",
		},
		{
			name:           "pod without replica hash",
			podName:        "standalone-pod",
			expectedResult: "standalone-pod",
		},
		{
			name:           "empty pod name",
			podName:        "",
			expectedResult: "",
		},
		{
			name:           "pod with multiple hyphens",
			podName:        "my-app-deployment-7d4f9c8b6-xyz",
			expectedResult: "my-app-deployment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := deploymentNameFromPodName(tt.podName)
			assert.Equal(t, tt.expectedResult, result)
		})
	}
}

func TestIsResourceHealthy(t *testing.T) {
	t.Run("returns false when k8s client is nil", func(t *testing.T) {
		handler := &Handler{
			k8sClient: nil,
		}

		ctx := context.Background()
		healthy := handler.isResourceHealthy(ctx, "cluster-1", "default", "nginx")

		assert.False(t, healthy)
	})
}

func TestStaleApprovalReviewLoop(t *testing.T) {
	t.Run("exits when context is cancelled", func(t *testing.T) {
		handler := &Handler{}

		ctx, cancel := context.WithCancel(context.Background())

		// Start loop in background
		done := make(chan struct{})
		go func() {
			handler.staleApprovalReviewLoop(ctx)
			close(done)
		}()

		// Cancel context immediately
		cancel()

		// Wait for loop to exit
		select {
		case <-done:
			// Expected: loop exited
		case <-time.After(100 * time.Millisecond):
			t.Error("loop should have exited when context was cancelled")
		}
	})
}

func TestDailyDigestLoop(t *testing.T) {
	t.Run("exits when context is cancelled", func(t *testing.T) {
		handler := &Handler{
			store: nil,
		}

		ctx, cancel := context.WithCancel(context.Background())

		// Start loop in background
		done := make(chan struct{})
		go func() {
			handler.dailyDigestLoop(ctx)
			close(done)
		}()

		// Cancel context immediately
		cancel()

		// Wait for loop to exit
		select {
		case <-done:
			// Expected: loop exited
		case <-time.After(100 * time.Millisecond):
			t.Error("loop should have exited when context was cancelled")
		}
	})
}

func TestHandlerFullStore(t *testing.T) {
	t.Run("returns false when store is nil", func(t *testing.T) {
		handler := &Handler{
			store: nil,
		}

		_, ok := handler.fullStore()
		assert.False(t, ok)
	})
}
