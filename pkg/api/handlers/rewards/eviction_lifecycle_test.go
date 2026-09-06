package rewards

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestStopEviction_NoopWhenNeverStarted verifies StopEviction is safe to call
// on a handler that never started its evictor. Previously StopEviction was 0%
// covered — the branches in handler.go:548 (the fn==nil arm) were untested.
func TestStopEviction_NoopWhenNeverStarted(t *testing.T) {
	h := NewRewardsHandler(RewardsConfig{GitHubToken: "t", Orgs: "repo:o/r"})
	// evictFn is nil until startEviction runs. Calling StopEviction now must
	// not panic and must leave the handler usable for a subsequent start.
	require.NotPanics(t, func() { h.StopEviction() })
	assert.Nil(t, h.evictCtx)
	assert.Nil(t, h.evictFn)
}

// TestStartEviction_IsIdempotent covers the "already running" early-return
// arm of startEviction (handler.go:511) — that branch was 0% covered because
// no existing test invoked startEviction twice in a row.
func TestStartEviction_IsIdempotent(t *testing.T) {
	h := NewRewardsHandler(RewardsConfig{GitHubToken: "t", Orgs: "repo:o/r"})
	// Intentionally no t.Cleanup(h.StopEviction) — StopEviction nil'ing
	// h.evictCtx races with the eviction goroutine's h.evictCtx.Done() read
	// (safego recovers but logs a noisy stack). The evictor is a 5-minute
	// ticker and is cleaned up when the test process exits.

	h.startEviction()
	require.NotNil(t, h.evictCtx, "first startEviction should install a ctx")
	firstCtx := h.evictCtx

	// Second call must be a no-op — same ctx, no new goroutine, no panic.
	require.NotPanics(t, func() { h.startEviction() })
	assert.Same(t, firstCtx, h.evictCtx, "second startEviction must not replace ctx")
}
