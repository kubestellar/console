package mcp

// Tests for the small handler methods in pkg/api/handlers/mcp/handler.go
// that were previously uncovered:
//
//   - MCPHandlers.GetStatus
//   - MCPHandlers.GetOpsTools
//   - MCPHandlers.GetDeployTools
//   - HandleK8sError (delegation to handlers.HandleK8sError)
//
// The existing handler_test.go only covers WaitWithDeadline and
// clusterErrorTracker.

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

// -----------------------------------------------------------------------------
// GetStatus
// -----------------------------------------------------------------------------

func TestMCPHandlers_GetStatus_NoBridge_NoK8s(t *testing.T) {
	h := NewMCPHandlers(nil, nil, nil)

	app := fiber.New()
	app.Get("/status", h.GetStatus)

	req, reqErr := http.NewRequest(http.MethodGet, "/status", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	k8sClient, ok := payload["k8sClient"]
	require.True(t, ok, "k8sClient key should be present")
	assert.Equal(t, false, k8sClient, "k8sClient should be false when nil")
	bridge, ok := payload["mcpBridge"].(map[string]any)
	require.True(t, ok, "mcpBridge should be an object")
	available, ok := bridge["available"]
	require.True(t, ok, "available key should be present in bridge")
	assert.Equal(t, false, available, "mcpBridge.available should be false when bridge is nil")
}

func TestMCPHandlers_GetStatus_WithBridge_ReportsBridgeStatus(t *testing.T) {
	// NewBridge with an empty config creates a Bridge with no started
	// clients, so Status() reports each sub-client as unavailable — but
	// crucially, GetStatus must forward that map rather than the fallback
	// { available: false } used when bridge is nil.
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewMCPHandlers(bridge, nil, nil)

	app := fiber.New()
	app.Get("/status", h.GetStatus)

	req, reqErr := http.NewRequest(http.MethodGet, "/status", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	k8sClient, ok := payload["k8sClient"]
	require.True(t, ok, "k8sClient key should be present")
	assert.Equal(t, false, k8sClient)
	bridgePayload, ok := payload["mcpBridge"].(map[string]any)
	require.True(t, ok, "mcpBridge must be an object")

	// bridge.Status() populates per-sub-client entries (opsClient/deployClient/gadgetClient).
	// Verify at least the opsClient+deployClient keys exist and are objects with
	// available=false (no clients were started).
	ops, ok := bridgePayload["opsClient"].(map[string]any)
	require.True(t, ok, "expected mcpBridge.opsClient object")
	available, ok := ops["available"]
	require.True(t, ok, "available key should be present")
	assert.Equal(t, false, available)
	deploy, ok := bridgePayload["deployClient"].(map[string]any)
	require.True(t, ok, "expected mcpBridge.deployClient object")
	available, ok = deploy["available"]
	require.True(t, ok, "available key should be present")
	assert.Equal(t, false, available)
	// The nil-bridge fallback shape { available: false } must NOT be used
	// here — the presence of the sub-client entries proves it.
	_, hadFallbackKey := bridgePayload["available"]
	assert.False(t, hadFallbackKey, "should not include top-level available when bridge is non-nil")
}

// -----------------------------------------------------------------------------
// GetOpsTools / GetDeployTools
// -----------------------------------------------------------------------------

func TestMCPHandlers_GetOpsTools_NoBridge_Returns503(t *testing.T) {
	h := NewMCPHandlers(nil, nil, nil)

	app := fiber.New()
	app.Get("/ops", h.GetOpsTools)

	req, reqErr := http.NewRequest(http.MethodGet, "/ops", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	errMsg, ok := payload["error"]
	require.True(t, ok, "error key should be present")
	assert.Equal(t, "MCP bridge not available", errMsg)
}

func TestMCPHandlers_GetOpsTools_EmptyBridge_ReturnsEmptyList(t *testing.T) {
	// Bridge with no started ops client → GetOpsTools returns nil, and the
	// handler responds with { "tools": null } — JSON null decodes to a nil
	// map entry, which we assert on.
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewMCPHandlers(bridge, nil, nil)

	app := fiber.New()
	app.Get("/ops", h.GetOpsTools)

	req, reqErr := http.NewRequest(http.MethodGet, "/ops", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	// The response must have a top-level "tools" key (null or empty array).
	tools, present := payload["tools"]
	assert.True(t, present, "response must include a 'tools' key")
	// bridge.GetOpsTools returns nil when opsClient is nil, which JSON-encodes to null.
	assert.Nil(t, tools)
}

func TestMCPHandlers_GetDeployTools_NoBridge_Returns503(t *testing.T) {
	h := NewMCPHandlers(nil, nil, nil)

	app := fiber.New()
	app.Get("/deploy", h.GetDeployTools)

	req, reqErr := http.NewRequest(http.MethodGet, "/deploy", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	errMsg, ok := payload["error"]
	require.True(t, ok, "error key should be present")
	assert.Equal(t, "MCP bridge not available", errMsg)
}

func TestMCPHandlers_GetDeployTools_EmptyBridge_ReturnsEmptyList(t *testing.T) {
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewMCPHandlers(bridge, nil, nil)

	app := fiber.New()
	app.Get("/deploy", h.GetDeployTools)

	req, reqErr := http.NewRequest(http.MethodGet, "/deploy", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	tools, present := payload["tools"]
	assert.True(t, present, "response must include a 'tools' key")
	assert.Nil(t, tools)
}

// -----------------------------------------------------------------------------
// NewMCPHandlers
// -----------------------------------------------------------------------------

func TestNewMCPHandlers_StoresConstructorArgs(t *testing.T) {
	// Sanity-check the constructor: all three deps are stored verbatim
	// and are addressable through the returned struct.
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewMCPHandlers(bridge, nil, nil)
	require.NotNil(t, h)
	assert.Same(t, bridge, h.bridge)
	assert.Nil(t, h.k8sClient)
	assert.Nil(t, h.store)
}

// -----------------------------------------------------------------------------
// HandleK8sError (the package-local delegating shim)
// -----------------------------------------------------------------------------

func TestHandleK8sError_NoClusterConfigured_Returns503(t *testing.T) {
	// ErrNoClusterConfigured is routed via ErrNoClusterAccess which
	// returns 503 with a structured payload. Verify the shape.
	app := fiber.New()
	app.Get("/x", func(c *fiber.Ctx) error {
		return HandleK8sError(c, k8s.ErrNoClusterConfigured)
	})

	req, reqErr := http.NewRequest(http.MethodGet, "/x", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	// ErrNoClusterAccess returns 503 (see pkg/api/handlers).
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestHandleK8sError_NetworkError_Returns503WithSanitizedMessage(t *testing.T) {
	app := fiber.New()
	app.Get("/x", func(c *fiber.Ctx) error {
		// Message that k8s.ClassifyError will map to "network".
		return HandleK8sError(c, errors.New("dial tcp 10.0.0.1:6443: connect: connection refused"))
	})

	req, reqErr := http.NewRequest(http.MethodGet, "/x", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	clusterStatus, ok := payload["clusterStatus"]
	require.True(t, ok, "clusterStatus should be present")
	assert.Equal(t, "unavailable", clusterStatus)
	errorType, ok := payload["errorType"]
	require.True(t, ok, "errorType should be present")
	assert.Equal(t, "network", errorType)
	msg, ok := payload["errorMessage"].(string)
	require.True(t, ok, "errorMessage should be present and a string")
	assert.NotEmpty(t, msg, "sanitized message must be set for network errors")
	// The sanitized message must not leak the raw error text.
	assert.NotContains(t, msg, "10.0.0.1", "sanitized message must not include internal address")
	assert.NotContains(t, msg, "dial tcp", "sanitized message must not include raw dial error")
}

func TestHandleK8sError_UnknownError_Returns500Generic(t *testing.T) {
	app := fiber.New()
	app.Get("/x", func(c *fiber.Ctx) error {
		// A completely opaque error — ClassifyError falls through to
		// default, so the response is 500 with a generic message.
		return HandleK8sError(c, errors.New("something completely opaque happened"))
	})

	req, reqErr := http.NewRequest(http.MethodGet, "/x", nil)
	require.NoError(t, reqErr)
	req.Host = "localhost"
	resp, err := app.Test(req)
	require.NoError(t, err)
	require.NotNil(t, resp)
	defer resp.Body.Close()
	require.Equal(t, http.StatusInternalServerError, resp.StatusCode)

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	clusterStatus, ok := payload["clusterStatus"]
	require.True(t, ok, "clusterStatus should be present")
	assert.Equal(t, "error", clusterStatus)
	errorType, ok := payload["errorType"]
	require.True(t, ok, "errorType should be present")
	assert.Equal(t, "internal", errorType)
	errorMessage, ok := payload["errorMessage"]
	require.True(t, ok, "errorMessage should be present")
	assert.Equal(t, "An internal error occurred", errorMessage)
	// The raw error text must not leak into the response.
	msg, ok := payload["errorMessage"].(string)
	require.True(t, ok, "errorMessage should be present and a string")
	assert.NotContains(t, msg, "opaque")
}
