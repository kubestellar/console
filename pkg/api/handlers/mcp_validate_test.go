package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMCPValidation_InvalidClusterNameRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Special characters in cluster name should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=my%3Bcluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid cluster")
}

func TestMCPValidation_InvalidNamespaceRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Namespace with uppercase letters should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/pods?namespace=INVALID", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid namespace")
}

func TestMCPValidation_ValidClusterAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Valid k8s name should work normally
	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=test-cluster", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPValidation_EmptyParamsAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// No cluster/namespace params (query all) should work
	req, err := http.NewRequest("GET", "/api/mcp/pods", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestMCPValidation_InvalidWorkloadTypeRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/workloads", handler.GetWorkloads)

	req, err := http.NewRequest("GET", "/api/mcp/workloads?type=InvalidType", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid type")
}

func TestMCPValidation_ValidWorkloadTypeAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/workloads", handler.GetWorkloads)

	for _, wt := range []string{"", "Deployment", "StatefulSet", "DaemonSet"} {
		url := "/api/mcp/workloads"
		if wt != "" {
			url += "?type=" + wt
		}
		req, err := http.NewRequest("GET", url, nil)
		require.NoError(t, err)

		resp, err := env.App.Test(req, 5000)
		require.NoError(t, err)
		assert.NotEqual(t, http.StatusBadRequest, resp.StatusCode,
			"workload type %q should be accepted", wt)
	}
}

func TestMCPValidation_InvalidLabelSelectorRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Semicolons should be rejected
	req, err := http.NewRequest("GET", "/api/mcp/pods?labelSelector=app%3Dfoo%3Bbar", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid labelSelector")
}

func TestMCPValidation_EventsLimitTooHighRejects(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/events", handler.GetEvents)

	req, err := http.NewRequest("GET", "/api/mcp/events?limit=99999", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "invalid limit")
}

func TestMCPValidation_DemoModeBypassesValidation(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/pods", handler.GetPods)

	// Even with invalid params, demo mode should succeed (validation runs after demo check)
	req, err := http.NewRequest("GET", "/api/mcp/pods?cluster=INVALID", nil)
	require.NoError(t, err)
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "demo", payload["source"])
}

func TestMCPValidation_ClusterWithDotsAccepted(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient)
	env.App.Get("/api/mcp/nodes", handler.GetNodes)

	// Cluster names with dots (e.g. "api.cluster.example.com") should be valid
	req, err := http.NewRequest("GET", "/api/mcp/nodes?cluster=api.cluster.example.com", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	// Should not be 400 — the cluster may not exist but validation should pass
	assert.NotEqual(t, http.StatusBadRequest, resp.StatusCode)
}
