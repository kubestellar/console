package mcp

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/k8s"
)

func newGPUTestApp(k8sClient *k8s.MultiClusterClient) *fiber.App {
	app := fiber.New()
	h := &MCPHandlers{k8sClient: k8sClient}

	app.Get("/api/mcp/gpu/nodes", h.GetGPUNodes)
	app.Get("/api/mcp/gpu/node-health", h.GetGPUNodeHealth)
	app.Get("/api/mcp/gpu/health-cronjob-status", h.GetGPUHealthCronJobStatus)
	app.Get("/api/mcp/gpu/health-cronjob-results", h.GetGPUHealthCronJobResults)
	app.Get("/api/mcp/gpu/nvidia-operators", h.GetNVIDIAOperatorStatus)

	return app
}

// --- GetGPUNodes tests ---

func TestGetGPUNodes_DemoMode(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/nodes", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["nodes"]
	assert.True(t, ok, "demo response should have 'nodes' key")
}

func TestGetGPUNodes_NoK8sClient(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/nodes", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "cluster")
}

func TestGetGPUNodes_InvalidClusterName(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/nodes?cluster=INVALID%21NAME", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// --- GetGPUNodeHealth tests ---

func TestGetGPUNodeHealth_DemoMode(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/node-health", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["nodes"]
	assert.True(t, ok, "demo response should have 'nodes' key")
}

func TestGetGPUNodeHealth_NoK8sClient(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/node-health", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetGPUNodeHealth_InvalidClusterName(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/node-health?cluster=BAD%21NAME", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// --- GetGPUHealthCronJobStatus tests ---

func TestGetGPUHealthCronJobStatus_DemoMode(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-status?cluster=test-cluster", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["status"]
	assert.True(t, ok, "demo response should have 'status' key")
}

func TestGetGPUHealthCronJobStatus_MissingCluster(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-status", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "cluster")
}

func TestGetGPUHealthCronJobStatus_InvalidCluster(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-status?cluster=BAD%21", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestGetGPUHealthCronJobStatus_NoK8sClient(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-status?cluster=test-cluster", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// --- GetGPUHealthCronJobResults tests ---

func TestGetGPUHealthCronJobResults_DemoMode(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-results?cluster=test-cluster", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["results"]
	assert.True(t, ok, "demo response should have 'results' key")
}

func TestGetGPUHealthCronJobResults_MissingCluster(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-results", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "cluster")
}

func TestGetGPUHealthCronJobResults_InvalidCluster(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-results?cluster=BAD%21", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

func TestGetGPUHealthCronJobResults_NoK8sClient(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/health-cronjob-results?cluster=test-cluster", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

// --- GetNVIDIAOperatorStatus tests ---

func TestGetNVIDIAOperatorStatus_DemoMode(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/nvidia-operators", nil)
	req.Header.Set("X-Demo-Mode", "true")
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	_, ok := body["operators"]
	assert.True(t, ok, "demo response should have 'operators' key")
}

func TestGetNVIDIAOperatorStatus_NoK8sClient(t *testing.T) {
	app := newGPUTestApp(nil)

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/nvidia-operators", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetNVIDIAOperatorStatus_InvalidClusterName(t *testing.T) {
	app := newGPUTestApp(&k8s.MultiClusterClient{})

	req := httptest.NewRequest(http.MethodGet, "/api/mcp/gpu/nvidia-operators?cluster=BAD%21NAME", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
}

// Verify that the handlers package demo functions are accessible from mcp package
func TestDemoFunctionsExist(t *testing.T) {
	assert.NotNil(t, handlers.GetDemoGPUNodes())
	assert.NotNil(t, handlers.GetDemoGPUNodeHealth())
	assert.NotNil(t, handlers.GetDemoNVIDIAOperatorStatus())
}
