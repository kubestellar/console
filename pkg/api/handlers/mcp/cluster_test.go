package mcp

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTryStartClusterHealthWarmup(t *testing.T) {
	// Reset state before testing
	listClustersWarmupMu.Lock()
	listClustersWarmupInFlight = false
	listClustersWarmupMu.Unlock()

	t.Run("first caller becomes owner", func(t *testing.T) {
		// Reset state
		listClustersWarmupMu.Lock()
		listClustersWarmupInFlight = false
		listClustersWarmupMu.Unlock()

		got := tryStartClusterHealthWarmup()
		assert.True(t, got, "first caller should become owner")

		// Verify flag is set
		listClustersWarmupMu.Lock()
		assert.True(t, listClustersWarmupInFlight)
		listClustersWarmupMu.Unlock()

		// Cleanup
		finishClusterHealthWarmup()
	})

	t.Run("concurrent callers are rejected", func(t *testing.T) {
		// Reset state
		listClustersWarmupMu.Lock()
		listClustersWarmupInFlight = false
		listClustersWarmupMu.Unlock()

		// First caller succeeds
		got1 := tryStartClusterHealthWarmup()
		assert.True(t, got1)

		// Second caller is rejected
		got2 := tryStartClusterHealthWarmup()
		assert.False(t, got2, "concurrent caller should be rejected")

		// Third caller is also rejected
		got3 := tryStartClusterHealthWarmup()
		assert.False(t, got3, "concurrent caller should be rejected")

		// Cleanup
		finishClusterHealthWarmup()
	})

	t.Run("finish allows next caller", func(t *testing.T) {
		// Reset state
		listClustersWarmupMu.Lock()
		listClustersWarmupInFlight = false
		listClustersWarmupMu.Unlock()

		// First cycle
		got1 := tryStartClusterHealthWarmup()
		assert.True(t, got1)

		finishClusterHealthWarmup()

		// Verify flag is cleared
		listClustersWarmupMu.Lock()
		assert.False(t, listClustersWarmupInFlight)
		listClustersWarmupMu.Unlock()

		// Second cycle should succeed
		got2 := tryStartClusterHealthWarmup()
		assert.True(t, got2, "after finish, next caller should become owner")

		// Cleanup
		finishClusterHealthWarmup()
	})
}

func TestFinishClusterHealthWarmup(t *testing.T) {
	t.Run("clears in-flight flag", func(t *testing.T) {
		// Set flag
		listClustersWarmupMu.Lock()
		listClustersWarmupInFlight = true
		listClustersWarmupMu.Unlock()

		finishClusterHealthWarmup()

		// Verify cleared
		listClustersWarmupMu.Lock()
		assert.False(t, listClustersWarmupInFlight)
		listClustersWarmupMu.Unlock()
	})

	t.Run("is safe to call when flag already cleared", func(t *testing.T) {
		// Reset state
		listClustersWarmupMu.Lock()
		listClustersWarmupInFlight = false
		listClustersWarmupMu.Unlock()

		// Should not panic
		assert.NotPanics(t, func() {
			finishClusterHealthWarmup()
		})

		// Verify still cleared
		listClustersWarmupMu.Lock()
		assert.False(t, listClustersWarmupInFlight)
		listClustersWarmupMu.Unlock()
	})
}
