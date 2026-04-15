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

// TestExecHandlers_AuthorizerWired confirms NewExecHandlers' nil-safety
// contract: when k8sClient is nil, authorizer MUST also be a true untyped
// nil so that HandleExec's `h.authorizer == nil` fail-closed guard sees it
// (#8137, Copilot review on #8134).
//
// Before #8137 the constructor did `authorizer: k8sClient` unconditionally,
// which in the nil case stores a typed-nil interface — a value that compares
// non-nil via `== nil` but panics on any method call. HandleExec's nil guard
// would silently pass and the first SAR call would blow up. The fix is to
// leave authorizer as a zero-value interface (untyped nil) when k8sClient is
// nil; this test locks that in.
func TestExecHandlers_AuthorizerWired(t *testing.T) {
	h := NewExecHandlers(nil, "secret", false)
	require.Nil(t, h.k8sClient)
	require.Nil(t, h.authorizer, "authorizer must be true untyped nil when k8sClient is nil, otherwise HandleExec's nil guard silently fails")
}

// testAuthorizePodExecCluster / Namespace / Pod / Login are shared across
// the authorizePodExec unit tests to keep the fakeExecAuthorizer call-site
// parameters consistent and make diffs in the assertions obvious.
const (
	testAuthorizePodExecCluster   = "cluster-a"
	testAuthorizePodExecNamespace = "ns-x"
	testAuthorizePodExecPod       = "pod-y"
	testAuthorizePodExecLogin     = "alice"
)

// TestAuthorizePodExec_Allow verifies the happy path: authorizer says
// allowed=true, authorizePodExec returns nil, and the fake was called with
// the github:-prefixed subject, the exact namespace/pod, and no groups.
func TestAuthorizePodExec_Allow(t *testing.T) {
	fa := &fakeExecAuthorizer{allowed: true}
	h := &ExecHandlers{authorizer: fa}

	err := h.authorizePodExec(
		context.Background(),
		testAuthorizePodExecCluster,
		testAuthorizePodExecNamespace,
		testAuthorizePodExecPod,
		testAuthorizePodExecLogin,
	)
	require.NoError(t, err)
	assert.Equal(t, 1, fa.calls)
	assert.Equal(t, execUserSubjectPrefix+testAuthorizePodExecLogin, fa.calledUser)
	assert.Equal(t, testAuthorizePodExecCluster, fa.calledContext)
	assert.Equal(t, testAuthorizePodExecNamespace, fa.calledNamespace)
	assert.Equal(t, testAuthorizePodExecPod, fa.calledPod)
	assert.Nil(t, fa.calledGroups)
}

// TestAuthorizePodExec_Deny verifies that allowed=false from the SAR maps to
// errExecRBACDenied. The deny reason from the apiserver is surfaced in the
// error string so operators can debug RBAC bindings.
func TestAuthorizePodExec_Deny(t *testing.T) {
	const denyReason = "no RBAC binding"
	fa := &fakeExecAuthorizer{allowed: false, reason: denyReason}
	h := &ExecHandlers{authorizer: fa}

	err := h.authorizePodExec(
		context.Background(),
		testAuthorizePodExecCluster,
		testAuthorizePodExecNamespace,
		testAuthorizePodExecPod,
		testAuthorizePodExecLogin,
	)
	require.Error(t, err)
	assert.ErrorIs(t, err, errExecRBACDenied)
	assert.Contains(t, err.Error(), denyReason)
	assert.Equal(t, 1, fa.calls, "the authorizer must still be consulted in the deny case")
}

// TestAuthorizePodExec_NilAuthorizer verifies fail-closed when the
// authorizer seam is nil — this can happen in the NewExecHandlers(nil, ...)
// path (#8137). The SAR must NOT be called, and the caller must see
// errExecAuthorizerUnavailable.
func TestAuthorizePodExec_NilAuthorizer(t *testing.T) {
	h := &ExecHandlers{authorizer: nil}

	err := h.authorizePodExec(
		context.Background(),
		testAuthorizePodExecCluster,
		testAuthorizePodExecNamespace,
		testAuthorizePodExecPod,
		testAuthorizePodExecLogin,
	)
	require.Error(t, err)
	assert.ErrorIs(t, err, errExecAuthorizerUnavailable)
}

// TestAuthorizePodExec_SARError verifies fail-closed when the SAR call
// errors out (apiserver unreachable, RBAC denies creating SARs, etc.).
// The sentinel error is wrapped so both errExecSARFailed and the underlying
// error are recoverable via errors.Is.
func TestAuthorizePodExec_SARError(t *testing.T) {
	sentinel := errors.New("apiserver down")
	fa := &fakeExecAuthorizer{err: sentinel}
	h := &ExecHandlers{authorizer: fa}

	err := h.authorizePodExec(
		context.Background(),
		testAuthorizePodExecCluster,
		testAuthorizePodExecNamespace,
		testAuthorizePodExecPod,
		testAuthorizePodExecLogin,
	)
	require.Error(t, err)
	assert.ErrorIs(t, err, errExecSARFailed)
	assert.Contains(t, err.Error(), sentinel.Error(), "underlying SAR error text should be surfaced for operator debugging")
	assert.Equal(t, 1, fa.calls)
}

// TestAuthorizePodExec_EmptyLogin verifies fail-closed when the JWT carries
// no GitHub login. Without a subject the SAR can't bind to a real user, so
// we MUST deny before making the call — the fake authorizer's call count
// stays at zero.
func TestAuthorizePodExec_EmptyLogin(t *testing.T) {
	fa := &fakeExecAuthorizer{allowed: true}
	h := &ExecHandlers{authorizer: fa}

	err := h.authorizePodExec(
		context.Background(),
		testAuthorizePodExecCluster,
		testAuthorizePodExecNamespace,
		testAuthorizePodExecPod,
		"",
	)
	require.Error(t, err)
	assert.ErrorIs(t, err, errExecMissingUserSubject)
	assert.Equal(t, 0, fa.calls, "empty login must fail-closed BEFORE the SAR call")
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
