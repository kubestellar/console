package handlers

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

// sseTestTimeoutMs is the timeout (in milliseconds) passed to env.App.Test
// for SSE endpoint requests. The streaming deadline inside the handler is
// much larger (sseOverallDeadline) but tests only need enough time for the
// fake client to return.
const sseTestTimeoutMs = 15_000

// seedWarningEvent returns a corev1.Event with Type=Warning that the fake
// client will return when ListEvents is called. The reason is encoded into
// the name so tests can differentiate per-cluster events.
func seedWarningEvent(name, namespace string) *corev1.Event {
	return &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
		Type:    corev1.EventTypeWarning,
		Reason:  name,
		Message: name + " message",
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: name + "-pod",
		},
	}
}

// injectTypedCluster registers a cluster in the fake MultiClusterClient with a
// fresh fake.Clientset seeded with the given typed objects. Unlike
// injectDynamicClusterWithObjects this does not register a dynamic client,
// which is all the SSE warning-events handler needs.
func injectTypedCluster(env *testEnv, cluster string, objs ...runtime.Object) *k8sfake.Clientset {
	fc := k8sfake.NewSimpleClientset(objs...)
	env.K8sClient.InjectClient(cluster, fc)
	addClusterToRawConfig(env.K8sClient, cluster)
	return fc
}

func readSSEBody(t *testing.T, resp *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return string(body)
}

// TestGetWarningEventsStream_AppliesClusterFilter verifies issue #6039:
// when ?cluster=<name> is supplied, the stream only contains events from
// that single cluster and not from the other registered clusters.
func TestGetWarningEventsStream_AppliesClusterFilter(t *testing.T) {
	env := setupTestEnv(t)

	// Replace the default test-cluster with two clusters, each seeded with
	// a distinct warning event so we can tell them apart in the stream.
	injectTypedCluster(env, "cluster-a", seedWarningEvent("from-a", "default"))
	injectTypedCluster(env, "cluster-b", seedWarningEvent("from-b", "default"))

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/events/warnings/stream", handler.GetWarningEventsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/events/warnings/stream?cluster=cluster-a", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "\"cluster\":\"cluster-a\"", "cluster-a should be present in the stream")
	assert.NotContains(t, body, "\"cluster\":\"cluster-b\"", "cluster-b must NOT appear when filter=cluster-a")
	assert.Contains(t, body, "from-a", "cluster-a's warning event should be in the stream")
	assert.NotContains(t, body, "from-b", "cluster-b's warning event must NOT be in the stream")
}

// TestGetWarningEventsStream_UnknownClusterReturns404 verifies that an
// unknown ?cluster= value surfaces as a 404 instead of a silent empty stream.
func TestGetWarningEventsStream_UnknownClusterReturns404(t *testing.T) {
	env := setupTestEnv(t)
	injectTypedCluster(env, "cluster-a")

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/events/warnings/stream", handler.GetWarningEventsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/events/warnings/stream?cluster=does-not-exist", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// TestGetWarningEventsStream_AppliesLimit verifies issue #6040:
// the `limit` query parameter is honored by parseWarningEventsLimit and
// clamped to [1, maxWarningEventsLimit], with fallback to
// defaultWarningEventsLimit on missing/invalid input.
func TestGetWarningEventsStream_AppliesLimit(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want int
	}{
		{"empty falls back to default", "", defaultWarningEventsLimit},
		{"invalid falls back to default", "not-a-number", defaultWarningEventsLimit},
		{"zero falls back to default", "0", defaultWarningEventsLimit},
		{"negative falls back to default", "-7", defaultWarningEventsLimit},
		{"valid value is returned as-is", "42", 42},
		{"maxWarningEventsLimit is returned as-is", "500", maxWarningEventsLimit},
		{"overflow is clamped to max", "9999", maxWarningEventsLimit},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := parseWarningEventsLimit(tc.raw)
			assert.Equal(t, tc.want, got)
		})
	}
}

// TestStreamClusters_EmitsClusterErrorOnFailure verifies issue #6041:
// when a per-cluster fetch fails the handler now surfaces the failure as a
// `cluster_error` SSE event instead of silently dropping it.
func TestStreamClusters_EmitsClusterErrorOnFailure(t *testing.T) {
	env := setupTestEnv(t)

	// Inject two clusters: one that succeeds (with no events) and one whose
	// fake client is wired to fail the list call.
	injectTypedCluster(env, "cluster-ok", seedWarningEvent("ok-event", "default"))
	failingClient := injectTypedCluster(env, "cluster-bad")
	failingClient.PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forced list error")
	})

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/events/warnings/stream", handler.GetWarningEventsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/events/warnings/stream", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)

	// The failing cluster must emit the new cluster_error event, carrying
	// its name and the error message.
	assert.Contains(t, body, "event: "+sseEventClusterError, "stream must contain cluster_error event")
	assert.Contains(t, body, "\"cluster\":\"cluster-bad\"", "cluster_error payload must reference cluster-bad")
	assert.Contains(t, body, "forced list error", "cluster_error payload must include the underlying error message")

	// The healthy cluster must still produce a cluster_data event.
	assert.Contains(t, body, "event: "+sseEventClusterData, "healthy cluster should still emit cluster_data")
	assert.Contains(t, body, "\"cluster\":\"cluster-ok\"", "cluster-ok should appear as cluster_data")

	// The final done event should still fire.
	assert.Contains(t, body, "event: "+sseEventDone, "stream must end with done event")

	// Existing event-name strings must be unchanged (regression guard).
	assert.True(t, strings.Contains(body, "cluster_data"))
	assert.True(t, strings.Contains(body, "done"))
}

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

// seedJob returns a completed batchv1.Job that the fake client will return
// when BatchV1().Jobs().List is called.
func seedJob(name, namespace string) *batchv1.Job {
	succeeded := int32(1)
	return &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec:       batchv1.JobSpec{Completions: &succeeded},
		Status:     batchv1.JobStatus{Succeeded: 1},
	}
}

// TestGetJobsStream_AppliesClusterFilter verifies that ?cluster=<name> limits
// the jobs stream to only the specified cluster.
func TestGetJobsStream_AppliesClusterFilter(t *testing.T) {
	env := setupTestEnv(t)

	injectTypedCluster(env, "cluster-a", seedJob("job-a", "default"))
	injectTypedCluster(env, "cluster-b", seedJob("job-b", "default"))

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/jobs/stream", handler.GetJobsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/jobs/stream?cluster=cluster-a", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "\"cluster\":\"cluster-a\"", "cluster-a should appear in stream")
	assert.NotContains(t, body, "\"cluster\":\"cluster-b\"", "cluster-b must be absent when filter=cluster-a")
	assert.Contains(t, body, "job-a", "cluster-a's job should appear in stream")
	assert.NotContains(t, body, "job-b", "cluster-b's job must be absent")
}

// TestGetJobsStream_UnknownClusterReturns404 verifies that supplying an
// unknown cluster name returns 404 rather than a silent empty stream.
func TestGetJobsStream_UnknownClusterReturns404(t *testing.T) {
	env := setupTestEnv(t)
	injectTypedCluster(env, "cluster-a")

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/jobs/stream", handler.GetJobsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/jobs/stream?cluster=does-not-exist", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// TestGetJobsStream_EmitsClusterErrorOnFailure verifies that a per-cluster
// fetch failure surfaces as a cluster_error SSE event rather than a silent gap.
func TestGetJobsStream_EmitsClusterErrorOnFailure(t *testing.T) {
	env := setupTestEnv(t)

	injectTypedCluster(env, "cluster-ok", seedJob("ok-job", "default"))
	failingClient := injectTypedCluster(env, "cluster-bad")
	failingClient.PrependReactor("list", "jobs", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("forced jobs list error")
	})

	handler := NewMCPHandlers(nil, env.K8sClient, nil)
	env.App.Get("/api/mcp/jobs/stream", handler.GetJobsStream)

	req, err := http.NewRequest(http.MethodGet, "/api/mcp/jobs/stream", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, sseTestTimeoutMs)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	body := readSSEBody(t, resp)
	assert.Contains(t, body, "event: "+sseEventClusterError, "failing cluster must emit cluster_error event")
	assert.Contains(t, body, "\"cluster\":\"cluster-bad\"", "cluster_error payload must name the failing cluster")
	assert.Contains(t, body, "forced jobs list error", "cluster_error payload must include the error message")
	assert.Contains(t, body, "event: "+sseEventClusterData, "healthy cluster must still emit cluster_data")
	assert.Contains(t, body, "\"cluster\":\"cluster-ok\"", "cluster-ok must appear in cluster_data")
	assert.Contains(t, body, "event: "+sseEventDone, "stream must end with done event")
}
