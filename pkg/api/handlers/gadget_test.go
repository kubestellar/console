package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGadgetHandlers_GetStatus(t *testing.T) {
	env := setupTestEnv(t)
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewGadgetHandler(bridge)
	env.App.Get("/api/mcp/gadget/status", h.GetStatus)

	t.Run("unavailable", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/mcp/gadget/status", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var status map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&status)
		// Since we didn't start the bridge, gadgetClient is nil, so Status() returns false available
		assert.False(t, status["available"].(bool))
	})
}

func TestGadgetHandlers_GetTools(t *testing.T) {
	env := setupTestEnv(t)
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewGadgetHandler(bridge)
	env.App.Get("/api/mcp/gadget/tools", h.GetTools)

	t.Run("unavailable", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/mcp/gadget/tools", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var respData map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&respData)
		assert.False(t, respData["available"].(bool))
	})
}

func TestGadgetHandlers_RunTrace(t *testing.T) {
	env := setupTestEnv(t)
	bridge := mcp.NewBridge(mcp.BridgeConfig{})
	h := NewGadgetHandler(bridge)
	env.App.Post("/api/mcp/gadget/trace", h.RunTrace)

	t.Run("missing body", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/mcp/gadget/trace", nil)
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("invalid json", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/mcp/gadget/trace", bytes.NewReader([]byte(`{invalid}`)))
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("missing tool name", func(t *testing.T) {
		body := map[string]interface{}{
			"args": map[string]interface{}{"foo": "bar"},
		}
		data, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/api/mcp/gadget/trace", bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})

	t.Run("bridge unavailable", func(t *testing.T) {
		body := map[string]interface{}{
			"tool": "trace_dns",
		}
		data, _ := json.Marshal(body)
		req := httptest.NewRequest("POST", "/api/mcp/gadget/trace", bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
	})
}
