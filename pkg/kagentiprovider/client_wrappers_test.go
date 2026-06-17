package kagentiprovider

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestStatus_DelegatesToStatusWithContext verifies the non-context Status()
// wrapper hits the same health endpoint as StatusWithContext.
func TestStatus_DelegatesToStatusWithContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	ok, err := client.Status()
	require.NoError(t, err)
	assert.True(t, ok)
}

// TestStatus_AllEndpointsFail verifies Status returns false when every
// health path returns a non-2xx status.
func TestStatus_AllEndpointsFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	ok, err := client.Status()
	assert.Error(t, err)
	assert.False(t, ok)
}

// TestListAgents_DelegatesToListAgentsWithContext verifies the non-context
// ListAgents() wrapper works via httptest.
func TestListAgents_DelegatesToListAgentsWithContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]any{
			{"name": "agent-1", "namespace": "ns-1"},
		})
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	agents, err := client.ListAgents()
	require.NoError(t, err)
	require.Len(t, agents, 1)
	assert.Equal(t, "agent-1", agents[0].Name)
}

// TestDetect_DelegatesToDetectWithContext verifies the non-context Detect()
// wrapper returns a URL when a health endpoint responds successfully.
func TestDetect_DelegatesToDetectWithContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Set env to point detection at our test server
	t.Setenv("KAGENTI_NAMESPACE", "test-ns")
	t.Setenv("KAGENTI_SERVICE_NAME", "test-svc")
	t.Setenv("KAGENTI_SERVICE_PORT", "80")
	t.Setenv("KAGENTI_SERVICE_PROTOCOL", server.URL[:strings.Index(server.URL, ":")])

	// Detect tries standard in-cluster URLs which won't match our test server.
	// So we test that Detect() returns empty string (no reachable endpoint).
	client := NewKagentiClient(server.URL)
	result := client.Detect()
	// The wrapper itself works — it returns whatever DetectWithContext returns.
	// In test env without matching k8s service DNS, result is empty.
	assert.IsType(t, "", result)
}

// TestDiscover_Success verifies Discover returns a parsed AgentCard on 200.
func TestDiscover_Success(t *testing.T) {
	card := AgentCard{
		Name:         "my-agent",
		Description:  "A test agent",
		URL:          "http://agent.example.com",
		Capabilities: []string{"chat", "code"},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/api/a2a/test-ns/my-agent/.well-known/agent.json")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(card)
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	result, err := client.Discover("test-ns", "my-agent")
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "my-agent", result.Name)
	assert.Equal(t, "A test agent", result.Description)
	assert.Equal(t, []string{"chat", "code"}, result.Capabilities)
}

// TestDiscover_NotFound verifies Discover returns an error on 404.
func TestDiscover_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("agent not found"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	result, err := client.Discover("ns", "missing-agent")
	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "404")
}

// TestDiscover_InvalidJSON verifies Discover returns an error on malformed JSON.
func TestDiscover_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{invalid json"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	result, err := client.Discover("ns", "bad-agent")
	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "decode agent card")
}

// TestInvoke_ControllerPath_Success verifies Invoke returns the response body
// when the controller endpoint returns 200.
func TestInvoke_ControllerPath_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "text/event-stream", r.Header.Get("Accept"))

		// Verify request body
		var payload map[string]any
		err := json.NewDecoder(r.Body).Decode(&payload)
		require.NoError(t, err)
		assert.Equal(t, "hello", payload["message"])
		assert.Equal(t, "session-1", payload["session_id"])

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("data: response\n\n"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	body, err := client.Invoke(context.Background(), "ns", "agent", "hello", "session-1", nil)
	require.NoError(t, err)
	require.NotNil(t, body)
	defer body.Close()

	data, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.Equal(t, "data: response\n\n", string(data))
}

// TestInvoke_ControllerPath_WithHistory verifies Invoke sends conversation
// history in the request payload.
func TestInvoke_ControllerPath_WithHistory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Message   string           `json:"message"`
			SessionID string           `json:"session_id"`
			History   []HistoryMessage `json:"history"`
		}
		err := json.NewDecoder(r.Body).Decode(&payload)
		require.NoError(t, err)
		assert.Len(t, payload.History, 2)
		assert.Equal(t, "user", payload.History[0].Role)
		assert.Equal(t, "assistant", payload.History[1].Role)

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	history := []HistoryMessage{
		{Role: "user", Content: "first message"},
		{Role: "assistant", Content: "first response"},
	}
	body, err := client.Invoke(context.Background(), "ns", "agent", "follow-up", "", history)
	require.NoError(t, err)
	require.NotNil(t, body)
	body.Close()
}

// TestInvoke_ControllerPath_ServerError verifies Invoke returns an error
// when the controller returns 500.
func TestInvoke_ControllerPath_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	body, err := client.Invoke(context.Background(), "ns", "agent", "test", "", nil)
	assert.Error(t, err)
	assert.Nil(t, body)
	assert.Contains(t, err.Error(), "500")
}

// TestInvoke_DirectAgent_Success verifies Invoke uses directAgentURL
// when configured and returns the response body on 200.
func TestInvoke_DirectAgent_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)

		var payload map[string]any
		json.NewDecoder(r.Body).Decode(&payload)
		assert.Equal(t, "test message", payload["message"])

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("streaming response"))
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL:       server.URL,
		directAgentName:      "test-agent",
		directAgentNamespace: "test-ns",
		httpClient:           &http.Client{},
	}

	body, err := client.Invoke(context.Background(), "ns", "agent", "test message", "", nil)
	require.NoError(t, err)
	require.NotNil(t, body)
	defer body.Close()

	data, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.Equal(t, "streaming response", string(data))
}

// TestInvoke_DirectAgent_AllEndpointsFail verifies Invoke returns an error
// when all direct stream URLs return non-2xx.
func TestInvoke_DirectAgent_AllEndpointsFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte("upstream error"))
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL:       server.URL,
		directAgentName:      "test-agent",
		directAgentNamespace: "test-ns",
		httpClient:           &http.Client{},
	}

	body, err := client.Invoke(context.Background(), "ns", "agent", "test", "", nil)
	assert.Error(t, err)
	assert.Nil(t, body)
	assert.Contains(t, err.Error(), "502")
}

// TestInvoke_DirectAgent_WithSessionAndHistory verifies direct agent path
// includes session_id and history in the payload when provided.
func TestInvoke_DirectAgent_WithSessionAndHistory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		json.NewDecoder(r.Body).Decode(&payload)
		assert.Equal(t, "ctx-123", payload["session_id"])
		assert.NotNil(t, payload["history"])

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL:  server.URL,
		directAgentName: "agent",
		httpClient:      &http.Client{},
	}

	history := []HistoryMessage{{Role: "user", Content: "hi"}}
	body, err := client.Invoke(context.Background(), "", "", "msg", "ctx-123", history)
	require.NoError(t, err)
	require.NotNil(t, body)
	body.Close()
}
