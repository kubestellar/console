package handlers

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

	handler := NewMCPHandlers(nil, env.K8sClient)
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

	handler := NewMCPHandlers(nil, env.K8sClient)
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

	handler := NewMCPHandlers(nil, env.K8sClient)
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
