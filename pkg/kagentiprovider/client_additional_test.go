package kagentiprovider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewKagentiClientFromEnvReturnsNilWhenDetectionFails(t *testing.T) {
	t.Setenv("KAGENTI_AGENT_URL", "")
	t.Setenv("KAGENTI_AGENT_NAME", "")
	t.Setenv("KAGENTI_AGENT_NAMESPACE", "")
	t.Setenv("KAGENTI_CONTROLLER_URL", "")
	t.Setenv("KAGENTI_NAMESPACE", "missing-ns")
	t.Setenv("KAGENTI_SERVICE_NAME", "missing-svc")
	t.Setenv("KAGENTI_SERVICE_PORT", "65535")
	t.Setenv("KAGENTI_SERVICE_PROTOCOL", "http")

	client := NewKagentiClientFromEnv()
	assert.Nil(t, client)
}

func TestDecodeAgentListInvalidShape(t *testing.T) {
	got, err := decodeAgentList(strings.NewReader(`{"agents":"nope"}`))
	require.Error(t, err)
	assert.Nil(t, got)
	assert.Contains(t, err.Error(), "unsupported list response shape")
}

func TestWrapperMethods(t *testing.T) {
	t.Run("Status delegates to StatusWithContext", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		ok, err := client.Status()
		require.NoError(t, err)
		assert.True(t, ok)
	})

	t.Run("ListAgents delegates to ListAgentsWithContext", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/v1/agents" {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`[{"name":"agent-one","namespace":"team-a"}]`))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		agents, err := client.ListAgents()
		require.NoError(t, err)
		require.Len(t, agents, 1)
		assert.Equal(t, "agent-one", agents[0].Name)
	})

	t.Run("Detect delegates to DetectWithContext", func(t *testing.T) {
		t.Setenv("KAGENTI_NAMESPACE", "probe-ns")
		t.Setenv("KAGENTI_SERVICE_NAME", "probe-svc")
		t.Setenv("KAGENTI_SERVICE_PORT", "7777")
		t.Setenv("KAGENTI_SERVICE_PROTOCOL", "http")

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Host == "probe-svc.probe-ns.svc:7777" && r.URL.Path == "/health" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := &KagentiClient{httpClient: newReroutedHTTPClient(t, server.URL)}
		assert.Equal(t, "http://probe-svc.probe-ns.svc:7777", client.Detect())
	})
}

func TestStatusWithContextAllPathsFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	ok, err := client.StatusWithContext(context.Background())
	require.Error(t, err)
	assert.False(t, ok)
	assert.Contains(t, err.Error(), "failed for all known endpoints")
}

func TestStatusWithContextDirectAgentAllPathsFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL: strings.TrimRight(server.URL, "/"),
		httpClient:     &http.Client{Timeout: defaultClientTimeout},
	}
	ok, err := client.StatusWithContext(context.Background())
	require.Error(t, err)
	assert.False(t, ok)
	assert.Contains(t, err.Error(), "direct agent health check failed")
}

func TestListAgentsWithContextAllPathsFail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream unavailable"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	agents, err := client.ListAgentsWithContext(context.Background())
	require.Error(t, err)
	assert.Nil(t, agents)
	assert.Contains(t, err.Error(), "/api/agents")
	assert.Contains(t, err.Error(), "502")
}

func TestListAgentsWithContextInvalidJSONFallsThrough(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":"invalid"}`))
			return
		}
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("upstream unavailable"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	agents, err := client.ListAgentsWithContext(context.Background())
	require.Error(t, err)
	assert.Nil(t, agents)
	assert.Contains(t, err.Error(), "/api/agents")
}

func TestInvokeControllerModeReturnsLastFallbackError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("stream unavailable"))
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	body, err := client.Invoke(context.Background(), "team-a", "agent-one", "test", "", nil)
	require.Error(t, err)
	assert.Nil(t, body)
	assert.Contains(t, err.Error(), "/api/chat/team-a/agent-one/stream")
	assert.Contains(t, err.Error(), "502")
}

func TestInvokeDirectAgentModeReturnsLastFallbackError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("try later"))
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL: strings.TrimRight(server.URL, "/"),
		httpClient:     &http.Client{Timeout: defaultClientTimeout},
	}

	body, err := client.Invoke(context.Background(), "", "", "msg", "", nil)
	require.Error(t, err)
	assert.Nil(t, body)
	assert.Contains(t, err.Error(), "503")
	assert.Contains(t, err.Error(), "try later")
}
