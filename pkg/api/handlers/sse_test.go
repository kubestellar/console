package handlers

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testSSECancelWait is how long tests wait for CancelUserSSEStreams to
// propagate through the registered cancel funcs before asserting the context
// is Done. The registry just calls cancel() synchronously, so in practice a
// few milliseconds is enough; we use a generous budget to keep CI flake-free.
const testSSECancelWait = 250 * time.Millisecond

// TestCancelUserSSEStreams_CancelsRegisteredContexts verifies the core
// lifecycle invariant for #6029: a stream context registered for a user is
// Done() after CancelUserSSEStreams runs for that user, and the registry no
// longer holds a reference to it.
func TestCancelUserSSEStreams_CancelsRegisteredContexts(t *testing.T) {
	userID := uuid.New()
	ctxA, cancelA := context.WithCancel(context.Background())
	t.Cleanup(cancelA)
	ctxB, cancelB := context.WithCancel(context.Background())
	t.Cleanup(cancelB)

	idA := registerSSESession(userID, cancelA)
	idB := registerSSESession(userID, cancelB)
	require.NotEqual(t, idA, idB, "session ids must be unique within a user")

	CancelUserSSEStreams(userID)

	// Both contexts should see cancellation essentially immediately.
	select {
	case <-ctxA.Done():
	case <-time.After(testSSECancelWait):
		t.Fatalf("stream A context was not cancelled within %s", testSSECancelWait)
	}
	select {
	case <-ctxB.Done():
	case <-time.After(testSSECancelWait):
		t.Fatalf("stream B context was not cancelled within %s", testSSECancelWait)
	}

	// The registry entry should be gone so it can't leak across users/logouts.
	sseSessionsMu.Lock()
	_, stillThere := sseSessions[userID]
	sseSessionsMu.Unlock()
	assert.False(t, stillThere, "registry entry for user should be cleared after cancellation")
}

// TestCancelUserSSEStreams_OtherUserUnaffected confirms that cancelling one
// user's streams does not touch another user's streams. This is important
// because logout of user A must not drop user B's live SSE subscriptions.
func TestCancelUserSSEStreams_OtherUserUnaffected(t *testing.T) {
	userA := uuid.New()
	userB := uuid.New()

	ctxA, cancelA := context.WithCancel(context.Background())
	t.Cleanup(cancelA)
	ctxB, cancelB := context.WithCancel(context.Background())
	t.Cleanup(cancelB)

	registerSSESession(userA, cancelA)
	idB := registerSSESession(userB, cancelB)
	t.Cleanup(func() { unregisterSSESession(userB, idB) })

	CancelUserSSEStreams(userA)

	// userA's context should be cancelled.
	select {
	case <-ctxA.Done():
	case <-time.After(testSSECancelWait):
		t.Fatalf("userA context was not cancelled")
	}

	// userB's context must still be alive — a different user logging out
	// must not tear down unrelated SSE streams.
	select {
	case <-ctxB.Done():
		t.Fatal("userB context was cancelled despite only userA logging out")
	case <-time.After(testSSECancelWait / 2):
		// expected: context still alive
	}
}

// TestUnregisterSSESession_RemovesEntry verifies the deferred cleanup path
// for normal stream end: unregisterSSESession should drop the specific
// session id without touching sibling sessions, and drop the per-user map
// entry when the user's last stream ends.
func TestUnregisterSSESession_RemovesEntry(t *testing.T) {
	userID := uuid.New()

	var cancelCalledA int32
	cancelA := func() { atomic.StoreInt32(&cancelCalledA, 1) }
	var cancelCalledB int32
	cancelB := func() { atomic.StoreInt32(&cancelCalledB, 1) }

	idA := registerSSESession(userID, cancelA)
	idB := registerSSESession(userID, cancelB)

	unregisterSSESession(userID, idA)

	// Removing one entry must not invoke any cancel funcs — cancellation is
	// a separate concern from registry cleanup.
	assert.Equal(t, int32(0), atomic.LoadInt32(&cancelCalledA))
	assert.Equal(t, int32(0), atomic.LoadInt32(&cancelCalledB))

	// Entry for B must still be present.
	sseSessionsMu.Lock()
	sessions, ok := sseSessions[userID]
	remaining := len(sessions)
	sseSessionsMu.Unlock()
	require.True(t, ok)
	assert.Equal(t, 1, remaining, "session B should still be registered")

	// Removing the last entry should drop the whole per-user map slot.
	unregisterSSESession(userID, idB)
	sseSessionsMu.Lock()
	_, stillThere := sseSessions[userID]
	sseSessionsMu.Unlock()
	assert.False(t, stillThere, "per-user map entry should be removed when empty")
}

// TestCancelUserSSEStreams_NoSessions verifies that calling the cancel
// function for a user with no registered streams is a no-op and does not
// panic — logout must always be safe to call whether or not the user had an
// open SSE stream.
func TestCancelUserSSEStreams_NoSessions(t *testing.T) {
	userID := uuid.New()
	// Should not panic, should not block.
	CancelUserSSEStreams(userID)
}
