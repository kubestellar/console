package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/kagent"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestAgentBackend_Integration_Proxy verifies issue #4.3:
// Agent ↔ Backend communication flow.
// It exercises the Backend's ability to proxy requests to an upstream Agent.
func TestAgentBackend_Integration_Proxy(t *testing.T) {
	// 1. Setup a Mock Agent Controller
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/api/agents":
			agents := []kagent.AgentInfo{
				{Name: "test-agent", Namespace: "kagent", Description: "integration test agent"},
			}
			json.NewEncoder(w).Encode(agents)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mockServer.Close()

	// 2. Setup the Backend Handler with a client pointing to the mock server
	kClient := kagent.NewKagentClient(mockServer.URL)
	handler := NewKagentProxyHandler(kClient)

	app := fiber.New()
	app.Get("/api/kagent/status", handler.GetStatus)
	app.Get("/api/kagent/agents", handler.ListAgents)

	// 3. Test Agent Status Proxy
	req1 := httptest.NewRequest(http.MethodGet, "/api/kagent/status", nil)
	resp1, err := app.Test(req1)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp1.StatusCode)

	var status map[string]interface{}
	require.NoError(t, json.NewDecoder(resp1.Body).Decode(&status))
	assert.Equal(t, true, status["available"])

	// 4. Test List Agents Proxy
	req2 := httptest.NewRequest(http.MethodGet, "/api/kagent/agents", nil)
	resp2, err := app.Test(req2)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp2.StatusCode)

	var agentsResp struct {
		Agents []kagent.AgentInfo `json:"agents"`
	}
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&agentsResp))
	require.Len(t, agentsResp.Agents, 1)
	assert.Equal(t, "test-agent", agentsResp.Agents[0].Name)
}

// TestAgentBackend_Integration_ChatProxy verifies the A2A chat proxying flow.
func TestAgentBackend_Integration_ChatProxy(t *testing.T) {
	// 1. Setup Mock Agent with A2A stream support
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/a2a/kagent/test-agent" {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Transfer-Encoding", "chunked")
			f, ok := w.(http.Flusher)
			fmt.Fprintln(w, `{"chunk": "Hello"}`)
			if ok {
				f.Flush()
			}
			fmt.Fprintln(w, `{"chunk": "World"}`)
			if ok {
				f.Flush()
			}
			// Keep server open briefly for client to read
			time.Sleep(100 * time.Millisecond)
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))

	defer mockServer.Close()

	kClient := kagent.NewKagentClient(mockServer.URL)
	handler := NewKagentProxyHandler(kClient)

	app := fiber.New()
	app.Post("/api/kagent/chat", handler.Chat)

	// 2. Request Chat
	chatReq := chatRequest{
		Agent:     "test-agent",
		Namespace: "kagent",
		Message:   "Hi",
	}
	body, _ := json.Marshal(chatReq)
	req := httptest.NewRequest(http.MethodPost, "/api/kagent/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	// 3. Verify SSE response stream
	// Note: In integration we check the raw body for the SSE format
	respBody, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	respStr := string(respBody)
	assert.Contains(t, respStr, "data: {\"chunk\": \"Hello\"}")
	assert.Contains(t, respStr, "data: {\"chunk\": \"World\"}")
	assert.Contains(t, respStr, "data: [DONE]")
}
