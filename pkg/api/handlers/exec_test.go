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

// testExecCancelWait is how long tests wait for CancelUserExecSessions to
// propagate through the registered cancel funcs before asserting the context
// is Done. The registry just calls cancel() synchronously, so in practice a
// few milliseconds is enough; we use a generous budget to keep CI flake-free.
const testExecCancelWait = 250 * time.Millisecond

// TestCancelUserExecSessions_CancelsRegisteredContexts verifies the core
// lifecycle invariant for #6024: a session context registered for a user is
// Done() after CancelUserExecSessions runs for that user, and the registry
// no longer holds a reference to it.
func TestCancelUserExecSessions_CancelsRegisteredContexts(t *testing.T) {
	userID := uuid.New()
	ctxA, cancelA := context.WithCancel(context.Background())
	t.Cleanup(cancelA)
	ctxB, cancelB := context.WithCancel(context.Background())
	t.Cleanup(cancelB)

	idA := registerExecSession(userID, cancelA)
	idB := registerExecSession(userID, cancelB)
	require.NotEqual(t, idA, idB, "session ids must be unique within a user")

	CancelUserExecSessions(userID)

	// Both contexts should see cancellation essentially immediately.
	select {
	case <-ctxA.Done():
	case <-time.After(testExecCancelWait):
		t.Fatalf("session A context was not cancelled within %s", testExecCancelWait)
	}
	select {
	case <-ctxB.Done():
	case <-time.After(testExecCancelWait):
		t.Fatalf("session B context was not cancelled within %s", testExecCancelWait)
	}

	// The registry entry should be gone so it can't leak across users/logouts.
	execSessionsMu.Lock()
	_, stillThere := execSessions[userID]
	execSessionsMu.Unlock()
	assert.False(t, stillThere, "registry entry for user should be cleared after cancellation")
}

// TestCancelUserExecSessions_OtherUserUnaffected confirms that cancelling one
// user's sessions does not touch another user's sessions. This is important
// because logout of user A must not drop user B's shells.
func TestCancelUserExecSessions_OtherUserUnaffected(t *testing.T) {
	userA := uuid.New()
	userB := uuid.New()

	ctxA, cancelA := context.WithCancel(context.Background())
	t.Cleanup(cancelA)
	ctxB, cancelB := context.WithCancel(context.Background())
	t.Cleanup(cancelB)

	registerExecSession(userA, cancelA)
	idB := registerExecSession(userB, cancelB)
	t.Cleanup(func() { unregisterExecSession(userB, idB) })

	CancelUserExecSessions(userA)

	// userA's context should be cancelled.
	select {
	case <-ctxA.Done():
	case <-time.After(testExecCancelWait):
		t.Fatalf("userA context was not cancelled")
	}

	// userB's context must still be alive — a different user logging out
	// must not tear down unrelated exec sessions.
	select {
	case <-ctxB.Done():
		t.Fatal("userB context was cancelled despite only userA logging out")
	case <-time.After(testExecCancelWait / 2):
		// expected: context still alive
	}
}

// TestUnregisterExecSession_RemovesEntry verifies the deferred cleanup path
// for normal session end: unregisterExecSession should drop the specific
// session id without touching sibling sessions, and drop the per-user map
// entry when the user's last session ends.
func TestUnregisterExecSession_RemovesEntry(t *testing.T) {
	userID := uuid.New()

	var cancelCalledA int32
	cancelA := func() { atomic.StoreInt32(&cancelCalledA, 1) }
	var cancelCalledB int32
	cancelB := func() { atomic.StoreInt32(&cancelCalledB, 1) }

	idA := registerExecSession(userID, cancelA)
	idB := registerExecSession(userID, cancelB)

	unregisterExecSession(userID, idA)

	// Removing one entry must not invoke any cancel funcs — cancellation is
	// a separate concern from registry cleanup.
	assert.Equal(t, int32(0), atomic.LoadInt32(&cancelCalledA))
	assert.Equal(t, int32(0), atomic.LoadInt32(&cancelCalledB))

	// Entry for B must still be present.
	execSessionsMu.Lock()
	sessions, ok := execSessions[userID]
	remaining := len(sessions)
	execSessionsMu.Unlock()
	require.True(t, ok)
	assert.Equal(t, 1, remaining, "session B should still be registered")

	// Removing the last entry should drop the whole per-user map slot.
	unregisterExecSession(userID, idB)
	execSessionsMu.Lock()
	_, stillThere := execSessions[userID]
	execSessionsMu.Unlock()
	assert.False(t, stillThere, "per-user map entry should be removed when empty")
}

// TestCancelUserExecSessions_NoSessions verifies that calling the cancel
// function for a user with no registered sessions is a no-op and does not
// panic — logout must always be safe to call whether or not the user had an
// open shell.
func TestCancelUserExecSessions_NoSessions(t *testing.T) {
	userID := uuid.New()
	// Should not panic, should not block.
	CancelUserExecSessions(userID)
}
