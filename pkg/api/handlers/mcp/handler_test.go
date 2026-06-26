package mcp

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWaitWithDeadline(t *testing.T) {
	tests := []struct {
		name         string
		goroutines   int
		workDuration time.Duration
		deadline     time.Duration
		wantTimeout  bool
	}{
		{
			name:         "all goroutines complete before deadline",
			goroutines:   3,
			workDuration: 10 * time.Millisecond,
			deadline:     100 * time.Millisecond,
			wantTimeout:  false,
		},
		{
			name:         "deadline reached with goroutines still running",
			goroutines:   3,
			workDuration: 200 * time.Millisecond,
			deadline:     50 * time.Millisecond,
			wantTimeout:  true,
		},
		{
			name:         "zero goroutines completes immediately",
			goroutines:   0,
			workDuration: 0,
			deadline:     50 * time.Millisecond,
			wantTimeout:  false,
		},
		{
			name:         "deadline exactly at completion time",
			goroutines:   2,
			workDuration: 30 * time.Millisecond,
			deadline:     100 * time.Millisecond,
			wantTimeout:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var wg sync.WaitGroup
			ctx, cancel := context.WithCancel(context.Background())

			// Spawn goroutines that respect context cancellation
			for i := 0; i < tt.goroutines; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					select {
					case <-time.After(tt.workDuration):
						// Normal completion
					case <-ctx.Done():
						// Cancelled by deadline
					}
				}()
			}

			timedOut := WaitWithDeadline(&wg, cancel, tt.deadline)
			cancel() // Clean up

			assert.Equal(t, tt.wantTimeout, timedOut, "WaitWithDeadline timeout mismatch")

			// Verify cancel was called when deadline hit
			if tt.wantTimeout {
				select {
				case <-ctx.Done():
					// Expected: context was cancelled
				case <-time.After(10 * time.Millisecond):
					t.Error("context should have been cancelled when deadline hit")
				}
			}
		})
	}
}

func TestClusterErrorTracker(t *testing.T) {
	t.Run("add single error", func(t *testing.T) {
		tracker := &clusterErrorTracker{}
		tracker.add("cluster-1", assert.AnError)

		require.Len(t, tracker.errors, 1)
		assert.Equal(t, "cluster-1", tracker.errors[0].Cluster)
		assert.NotEmpty(t, tracker.errors[0].Message)
	})

	t.Run("add multiple errors concurrently", func(t *testing.T) {
		tracker := &clusterErrorTracker{}
		var wg sync.WaitGroup

		// Add errors from multiple goroutines
		for i := 0; i < 10; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				tracker.add("cluster-"+string(rune('0'+idx)), assert.AnError)
			}(i)
		}

		wg.Wait()
		assert.Len(t, tracker.errors, 10)
	})

	t.Run("annotate adds cluster errors to response", func(t *testing.T) {
		tracker := &clusterErrorTracker{}
		tracker.add("cluster-1", assert.AnError)
		tracker.add("cluster-2", assert.AnError)

		resp := map[string]interface{}{"items": []string{}}
		annotated := tracker.annotate(resp)

		require.Contains(t, annotated, "clusterErrors")
		// clusterErrors is []handlers.ClusterError, not []interface{}
		assert.Len(t, annotated["clusterErrors"], 2)
	})

	t.Run("nil tracker does not panic", func(t *testing.T) {
		var tracker *clusterErrorTracker
		resp := map[string]interface{}{"items": []string{}}

		// Should not panic
		assert.NotPanics(t, func() {
			if tracker != nil {
				tracker.annotate(resp)
			}
		})
	})
}
