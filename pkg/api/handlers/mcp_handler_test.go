package handlers

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestWaitWithDeadline(t *testing.T) {
	tests := []struct {
		name           string
		goroutineSleep time.Duration
		deadline       time.Duration
		wantDeadlineHit bool
	}{
		{
			name:           "completes before deadline",
			goroutineSleep: 10 * time.Millisecond,
			deadline:       100 * time.Millisecond,
			wantDeadlineHit: false,
		},
		{
			name:           "hits deadline",
			goroutineSleep: 200 * time.Millisecond,
			deadline:       50 * time.Millisecond,
			wantDeadlineHit: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var wg sync.WaitGroup
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			wg.Add(1)
			go func() {
				defer wg.Done()
				select {
				case <-time.After(tt.goroutineSleep):
				case <-ctx.Done():
				}
			}()

			deadlineHit := WaitWithDeadline(&wg, cancel, tt.deadline)
			assert.Equal(t, tt.wantDeadlineHit, deadlineHit)
		})
	}
}

func TestWaitWithDeadline_CancelsOnDeadline(t *testing.T) {
	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cancelReceived := false
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case <-time.After(1 * time.Second):
		case <-ctx.Done():
			cancelReceived = true
		}
	}()

	deadlineHit := WaitWithDeadline(&wg, cancel, 20*time.Millisecond)
	assert.True(t, deadlineHit)
	assert.True(t, cancelReceived)
}
