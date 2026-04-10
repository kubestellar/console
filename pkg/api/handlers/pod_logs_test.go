package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Fiber test timeout (ms). Pod log calls should complete essentially instantly
// against the in-memory fake clientset, but we use the same generous timeout
// the rest of this package uses so CI doesn't flake on loaded machines.
const podLogsTestTimeoutMS = 5000

// TestMCPGetPodLogs_DemoModeReturnsDemoData asserts that the GetPodLogs
// handler short-circuits to demo data when the request carries the
// `X-Demo-Mode` header. This is the path used by the Logs dashboard when a
// visitor opens the site without a real cluster (issue #6045).
func TestMCPGetPodLogs_DemoModeReturnsDemoData(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods/logs", handler.GetPodLogs)

	req, err := http.NewRequest("GET", "/api/mcp/pods/logs", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, podLogsTestTimeoutMS)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(body, &payload))
	assert.Equal(t, "demo", payload["source"])
	// Demo payload must include the "logs" key so the frontend's typed
	// client can unmarshal it without a null check.
	_, ok := payload["logs"]
	assert.True(t, ok, "demo response should include logs field")
}

// TestMCPGetPodLogs_MissingParamsReturns400 asserts that the handler
// refuses requests missing any of cluster/namespace/pod.
func TestMCPGetPodLogs_MissingParamsReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods/logs", handler.GetPodLogs)

	req, err := http.NewRequest("GET", "/api/mcp/pods/logs?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, podLogsTestTimeoutMS)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload["error"], "required")
}

// TestMCPGetPodLogs_NoClusterAccessReturns503 asserts that the handler
// returns 503 when there is no k8s client at all (degraded mode).
func TestMCPGetPodLogs_NoClusterAccessReturns503(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, nil)
	env.App.Get("/api/mcp/pods/logs", handler.GetPodLogs)

	req, err := http.NewRequest(
		"GET",
		"/api/mcp/pods/logs?cluster=test-cluster&namespace=default&pod=nginx",
		nil,
	)
	require.NoError(t, err)

	resp, err := env.App.Test(req, podLogsTestTimeoutMS)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "No cluster access available", payload["error"])
}

// TestMCPGetPodLogs_FakeClientReturnsLogs exercises the real success path:
// the handler dispatches through `k8sClient.GetPodLogs`, which uses the
// fake clientset's GetLogs REST client. The fake returns "fake logs" by
// default — we only assert that the response shape matches
// `{logs, source: "k8s"}` so the frontend can parse it.
func TestMCPGetPodLogs_FakeClientReturnsLogs(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods/logs", handler.GetPodLogs)

	req, err := http.NewRequest(
		"GET",
		"/api/mcp/pods/logs?cluster=test-cluster&namespace=default&pod=nginx&tail=50",
		nil,
	)
	require.NoError(t, err)

	resp, err := env.App.Test(req, podLogsTestTimeoutMS)
	require.NoError(t, err)
	require.NotNil(t, resp)
	// The fake clientset is cooperative — we expect a 200 with k8s source.
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "k8s", payload["source"])
	_, ok := payload["logs"]
	assert.True(t, ok, "k8s response should include logs field")
}

// TestMCPGetPodLogs_TailExceedsMaxReturns400 asserts that values above the
// server-side `mcpMaxTailLines` cap are rejected before the k8s client is
// ever called.
func TestMCPGetPodLogs_TailExceedsMaxReturns400(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods/logs", handler.GetPodLogs)

	// mcpMaxTailLines is 10_000 — request 10x that.
	oversizedTail := (mcpMaxTailLines * 10) + 1

	req, err := http.NewRequest(
		"GET",
		"/api/mcp/pods/logs?cluster=test-cluster&namespace=default&pod=nginx&tail="+itoa(oversizedTail),
		nil,
	)
	require.NoError(t, err)

	resp, err := env.App.Test(req, podLogsTestTimeoutMS)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// itoa is a local shim so the test file stays import-light (strconv is
// already transitively imported by the rest of the test package, but we
// only need a tiny helper here).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
