package kagent

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// TestHandleKagentiSummary_DynClientError covers the h.Client.GetDynamicClient
// error branch: 500 with a well-formed error envelope (zeroed counters + error
// string), not a panic. Previously untested.
func TestHandleKagentiSummary_DynClientError(t *testing.T) {
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{err: errors.New("connection refused")},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagenti/summary?cluster=test", nil)
	r.Host = "localhost"
	h.HandleKagentiSummary(w, r)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, float64(0), resp["agentCount"])
	assert.Equal(t, float64(0), resp["readyAgents"])
	assert.Equal(t, float64(0), resp["buildCount"])
	assert.Equal(t, float64(0), resp["activeBuilds"])
	assert.Equal(t, float64(0), resp["toolCount"])
	assert.Equal(t, float64(0), resp["cardCount"])
	assert.Equal(t, "internal server error", resp["error"])
	assert.NotNil(t, resp["frameworks"])
}

// TestHandleKagentiSummary_AggregatesFromCRDs populates all four kagenti CRDs
// so the goroutines' per-item aggregation branches (readyAgents/activeBuilds/
// frameworks tallying) all execute. This covers lines 1163-1188 (agents loop,
// Running/Ready + framework counting) and 1195-1210 (builds loop, Building/
// Pending counting), which the existing _Success test skips by seeding an
// empty client.
func TestHandleKagentiSummary_AggregatesFromCRDs(t *testing.T) {
	agentReadyRunning := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "Agent",
		"metadata":   map[string]any{"name": "a-run", "namespace": "default"},
		"spec":       map[string]any{"framework": "adk"},
		"status":     map[string]any{"phase": "Running"},
	}}
	agentReadyReady := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "Agent",
		"metadata":   map[string]any{"name": "a-rdy", "namespace": "default"},
		"spec":       map[string]any{"framework": "adk"},
		"status":     map[string]any{"phase": "Ready"},
	}}
	agentPending := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "Agent",
		"metadata":   map[string]any{"name": "a-pend", "namespace": "default"},
		"spec":       map[string]any{"framework": "crewai"},
		"status":     map[string]any{"phase": "Pending"},
	}}
	buildBuilding := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "AgentBuild",
		"metadata":   map[string]any{"name": "b1", "namespace": "default"},
		"status":     map[string]any{"phase": "Building"},
	}}
	buildPending := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "AgentBuild",
		"metadata":   map[string]any{"name": "b2", "namespace": "default"},
		"status":     map[string]any{"phase": "Pending"},
	}}
	buildDone := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "AgentBuild",
		"metadata":   map[string]any{"name": "b3", "namespace": "default"},
		"status":     map[string]any{"phase": "Succeeded"},
	}}
	toolObj := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "mcp.kagenti.com/v1alpha1",
		"kind":       "MCPServer",
		"metadata":   map[string]any{"name": "tool-1", "namespace": "default"},
	}}
	cardObj := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "agent.kagenti.dev/v1alpha1",
		"kind":       "AgentCard",
		"metadata":   map[string]any{"name": "card-1", "namespace": "default"},
	}}

	dynClient := newFakeDynamicClient(
		agentReadyRunning, agentReadyReady, agentPending,
		buildBuilding, buildPending, buildDone,
		toolObj,
		cardObj,
	)
	h := &Handlers{
		Ctx:    &mockHandlerContext{tokenValid: true},
		Client: &mockDynamicClientGetter{client: dynClient},
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/kagenti/summary?cluster=test", nil)
	r.Host = "localhost"
	h.HandleKagentiSummary(w, r)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))

	assert.EqualValues(t, 3, resp["agentCount"])
	assert.EqualValues(t, 2, resp["readyAgents"], "Running+Ready must be tallied, Pending must not")
	assert.EqualValues(t, 3, resp["buildCount"])
	assert.EqualValues(t, 2, resp["activeBuilds"], "Building+Pending must be tallied, Succeeded must not")
	assert.EqualValues(t, 1, resp["toolCount"])
	assert.EqualValues(t, 1, resp["cardCount"])

	fw, ok := resp["frameworks"].(map[string]any)
	require.True(t, ok, "frameworks must be a map")
	assert.EqualValues(t, 2, fw["adk"])
	assert.EqualValues(t, 1, fw["crewai"])
}
