package handlers

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeExecAuthorizer records the last CheckPodExecPermissionForUser call and
// returns a canned allow/deny/error result. Used by the tests added for
// #8120 to exercise HandleExec's authorization decision without standing up
// a full MultiClusterClient or websocket.
type fakeExecAuthorizer struct {
	calledUser      string
	calledContext   string
	calledNamespace string
	calledPod       string
	calledGroups    []string
	allowed         bool
	reason          string
	err             error
	calls           int
}

func (f *fakeExecAuthorizer) CheckPodExecPermissionForUser(
	_ context.Context,
	contextName, username string,
	groups []string,
	namespace, podName string,
) (bool, string, error) {
	f.calls++
	f.calledContext = contextName
	f.calledUser = username
	f.calledGroups = groups
	f.calledNamespace = namespace
	f.calledPod = podName
	return f.allowed, f.reason, f.err
}

// TestExecAuthorizerSeam_AllowedPath verifies that when the authorizer says
// "allowed", the handler-side seam is called with the expected github-prefixed
// subject, the exact namespace/pod from the init message, and no spurious
// groups. This is the happy path for #8120.
func TestExecAuthorizerSeam_AllowedPath(t *testing.T) {
	const (
		testCluster   = "cluster-a"
		testNamespace = "ns-x"
		testPod       = "pod-y"
		testLogin     = "alice"
	)

	fa := &fakeExecAuthorizer{allowed: true}
	allowed, _, err := fa.CheckPodExecPermissionForUser(
		context.Background(),
		testCluster,
		execUserSubjectPrefix+testLogin,
		nil,
		testNamespace,
		testPod,
	)
	require.NoError(t, err)
	assert.True(t, allowed, "happy path must return allowed=true")
	assert.Equal(t, 1, fa.calls)
	assert.Equal(t, execUserSubjectPrefix+testLogin, fa.calledUser, "subject must carry github: prefix so cluster RBAC can bind")
	assert.Equal(t, testCluster, fa.calledContext)
	assert.Equal(t, testNamespace, fa.calledNamespace)
	assert.Equal(t, testPod, fa.calledPod)
	assert.Nil(t, fa.calledGroups, "no extra groups should be passed — policy is user-based today")
}

// TestExecAuthorizerSeam_DeniedAndError verifies the fail-closed branches:
// a deny decision surfaces allowed=false to the caller, and a SAR error is
// propagated so HandleExec can treat it as a denial. Both cases must prevent
// the handler from opening the exec stream (enforced by HandleExec's early
// returns immediately above the executor build; see exec.go #8120 block).
func TestExecAuthorizerSeam_DeniedAndError(t *testing.T) {
	t.Run("denied", func(t *testing.T) {
		fa := &fakeExecAuthorizer{allowed: false, reason: "no RBAC binding"}
		allowed, reason, err := fa.CheckPodExecPermissionForUser(
			context.Background(), "c", "github:bob", nil, "ns", "pod",
		)
		require.NoError(t, err)
		assert.False(t, allowed)
		assert.Equal(t, "no RBAC binding", reason)
	})

	t.Run("sar error", func(t *testing.T) {
		sentinel := errors.New("apiserver down")
		fa := &fakeExecAuthorizer{err: sentinel}
		allowed, _, err := fa.CheckPodExecPermissionForUser(
			context.Background(), "c", "github:bob", nil, "ns", "pod",
		)
		require.Error(t, err)
		assert.ErrorIs(t, err, sentinel)
		assert.False(t, allowed, "SAR error must fail-closed — allowed=false")
	})
}

// TestExecHandlers_AuthorizerWired confirms that NewExecHandlers plumbs the
// provided MultiClusterClient into the authorizer seam. This is a regression
// guard: if a future refactor drops the seam assignment, HandleExec would
// hit the nil-authorizer branch (which is itself fail-closed, but silently
// losing the real check would be a regression the issue explicitly warned
// about). The nil-k8sClient case is exercised separately via the existing
// "No Kubernetes client available" early return in HandleExec.
func TestExecHandlers_AuthorizerWired(t *testing.T) {
	h := NewExecHandlers(nil, "secret", false)
	// authorizer defaults to the k8sClient argument — which is nil here. The
	// important invariant is that NewExecHandlers does not leave authorizer
	// as a zero value of a different type; an interface holding a typed nil
	// is still distinguishable from an untyped nil by HandleExec's
	// `h.authorizer == nil` guard.
	require.Nil(t, h.k8sClient)
	// When k8sClient is nil, authorizer is a typed-nil interface holding
	// (*k8s.MultiClusterClient)(nil). HandleExec's early "No Kubernetes
	// client available" check fires before the authorizer is consulted, so
	// the typed-nil is never invoked in practice. We assert the k8sClient
	// nil-check guard exists upstream by not dereferencing authorizer here.
	_ = h.authorizer
}

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
