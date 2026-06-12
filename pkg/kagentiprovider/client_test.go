package kagentiprovider

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	neturl "net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewKagentiClient(t *testing.T) {
	client := NewKagentiClient("http://example.com///")

	assert.Equal(t, "http://example.com", client.BaseURL())
	assert.Empty(t, client.DirectAgentURL())
	assert.NotNil(t, client.httpClient)
	assert.Equal(t, defaultClientTimeout, client.httpClient.Timeout)
}

func TestNewKagentiClientFromEnv(t *testing.T) {
	t.Run("direct agent env", func(t *testing.T) {
		t.Setenv("KAGENTI_AGENT_URL", "http://agent.example///")
		t.Setenv("KAGENTI_AGENT_NAME", "demo-agent")
		t.Setenv("KAGENTI_AGENT_NAMESPACE", "demo-ns")
		t.Setenv("KAGENTI_CONTROLLER_URL", "")

		client := NewKagentiClientFromEnv()
		require.NotNil(t, client)

		assert.Equal(t, "http://agent.example", client.DirectAgentURL())
		assert.Equal(t, "demo-agent", client.DirectAgentName())
		assert.Equal(t, "demo-ns", client.DirectAgentNamespace())
		assert.Empty(t, client.BaseURL())
		assert.Equal(t, defaultClientTimeout, client.httpClient.Timeout)
	})

	t.Run("controller env", func(t *testing.T) {
		t.Setenv("KAGENTI_AGENT_URL", "")
		t.Setenv("KAGENTI_AGENT_NAME", "")
		t.Setenv("KAGENTI_AGENT_NAMESPACE", "")
		t.Setenv("KAGENTI_CONTROLLER_URL", "http://controller.example///")

		client := NewKagentiClientFromEnv()
		require.NotNil(t, client)

		assert.Equal(t, "http://controller.example", client.BaseURL())
		assert.Empty(t, client.DirectAgentURL())
		assert.Equal(t, defaultClientTimeout, client.httpClient.Timeout)
	})
}

func TestStatusWithContext_Controller(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		if r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL + "/")
	ok, err := client.StatusWithContext(context.Background())
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, []string{"/health", "/healthz"}, requests)
}

func TestStatusWithContext_DirectAgent(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		if r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL: strings.TrimRight(server.URL, "/"),
		httpClient:     &http.Client{Timeout: defaultClientTimeout},
	}

	ok, err := client.StatusWithContext(context.Background())
	require.NoError(t, err)
	assert.True(t, ok)
	assert.Equal(t, []string{
		"/.well-known/agent-card.json",
		"/.well-known/agent.json",
		"/health",
		"/healthz",
	}, requests)
}

func TestListAgentsWithContext_Controller(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/api/v1/agents":
			w.WriteHeader(http.StatusNotFound)
		case "/api/agents":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"name":"agent-one","namespace":"team-a","framework":"kagenti"}]`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewKagentiClient(server.URL)
	agents, err := client.ListAgentsWithContext(context.Background())
	require.NoError(t, err)
	require.Len(t, agents, 1)
	assert.Equal(t, AgentInfo{Name: "agent-one", Namespace: "team-a", Framework: "kagenti"}, agents[0])
	assert.Equal(t, []string{"/api/v1/agents", "/api/agents"}, requests)
}

func TestListAgentsWithContext_DirectAgentUsesCardName(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/.well-known/agent-card.json" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"card-agent","description":"demo"}`))
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL: strings.TrimRight(server.URL, "/"),
		httpClient:     &http.Client{Timeout: defaultClientTimeout},
	}

	agents, err := client.ListAgentsWithContext(context.Background())
	require.NoError(t, err)
	require.Len(t, agents, 1)
	assert.Equal(t, "card-agent", agents[0].Name)
	assert.Equal(t, defaultDirectAgentNamespace, agents[0].Namespace)
	assert.Contains(t, agents[0].Description, server.URL)
	assert.Equal(t, "kagenti", agents[0].Framework)
}

func TestListAgentsWithContext_DirectAgentFallsBackToDefaultName(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := &KagentiClient{
		directAgentURL: strings.TrimRight(server.URL, "/"),
		httpClient:     &http.Client{Timeout: defaultClientTimeout},
	}

	agents, err := client.ListAgentsWithContext(context.Background())
	require.NoError(t, err)
	require.Len(t, agents, 1)
	assert.Equal(t, defaultDirectAgentName, agents[0].Name)
	assert.Equal(t, defaultDirectAgentNamespace, agents[0].Namespace)
	assert.Equal(t, []string{"/.well-known/agent-card.json", "/.well-known/agent.json"}, requests)
}

func TestDecodeAgentList(t *testing.T) {
	tests := []struct {
		name string
		body string
		want []AgentInfo
	}{
		{
			name: "wrapped items",
			body: `{"items":[{"name":"wrapped","namespace":"team-a"}]}`,
			want: []AgentInfo{{Name: "wrapped", Namespace: "team-a"}},
		},
		{
			name: "direct array",
			body: `[{"name":"direct","namespace":"team-b"}]`,
			want: []AgentInfo{{Name: "direct", Namespace: "team-b"}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := decodeAgentList(strings.NewReader(tt.body))
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestBuildDetectCandidatesFromEnv(t *testing.T) {
	t.Run("defaults deduplicate configured and legacy backend urls", func(t *testing.T) {
		t.Setenv("KAGENTI_NAMESPACE", "")
		t.Setenv("KAGENTI_SERVICE_NAME", "")
		t.Setenv("KAGENTI_SERVICE_PORT", "")
		t.Setenv("KAGENTI_SERVICE_PROTOCOL", "")

		assert.Equal(t, []string{
			"http://kagenti-backend.kagenti-system.svc:8000",
			"http://kagenti-backend.kagenti-system.svc.cluster.local:8000",
			"http://kagenti-controller.kagenti-system.svc:8083",
			"http://kagenti-controller.kagenti-system.svc.cluster.local:8083",
		}, BuildDetectCandidatesFromEnv())
	})

	t.Run("custom settings prepend configured urls", func(t *testing.T) {
		t.Setenv("KAGENTI_NAMESPACE", "custom-ns")
		t.Setenv("KAGENTI_SERVICE_NAME", "custom-svc")
		t.Setenv("KAGENTI_SERVICE_PORT", "9000")
		t.Setenv("KAGENTI_SERVICE_PROTOCOL", "https")

		assert.Equal(t, []string{
			"https://custom-svc.custom-ns.svc:9000",
			"https://custom-svc.custom-ns.svc.cluster.local:9000",
			"http://kagenti-controller.kagenti-system.svc:8083",
			"http://kagenti-controller.kagenti-system.svc.cluster.local:8083",
			"http://kagenti-backend.kagenti-system.svc:8000",
			"http://kagenti-backend.kagenti-system.svc.cluster.local:8000",
		}, BuildDetectCandidatesFromEnv())
	})
}

func TestDetectWithContext(t *testing.T) {
	t.Setenv("KAGENTI_NAMESPACE", "probe-ns")
	t.Setenv("KAGENTI_SERVICE_NAME", "probe-svc")
	t.Setenv("KAGENTI_SERVICE_PORT", "7777")
	t.Setenv("KAGENTI_SERVICE_PROTOCOL", "http")

	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Host+r.URL.Path)
		if r.Host == "probe-svc.probe-ns.svc.cluster.local:7777" && r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	client := &KagentiClient{httpClient: newReroutedHTTPClient(t, server.URL)}
	got := client.DetectWithContext(context.Background())

	assert.Equal(t, "http://probe-svc.probe-ns.svc.cluster.local:7777", got)
	assert.Equal(t, []string{
		"probe-svc.probe-ns.svc:7777/health",
		"probe-svc.probe-ns.svc:7777/healthz",
		"probe-svc.probe-ns.svc:7777/api/health",
		"probe-svc.probe-ns.svc.cluster.local:7777/health",
		"probe-svc.probe-ns.svc.cluster.local:7777/healthz",
	}, requests)
}

func TestStreamURLs(t *testing.T) {
	client := &KagentiClient{
		baseURL:        "http://controller.example",
		directAgentURL: "http://agent.example///",
	}

	assert.Equal(t, []string{
		"http://agent.example/api/chat/stream",
		"http://agent.example/chat/stream",
		"http://agent.example/stream",
	}, client.directStreamURLs())

	escapedNamespace := neturl.PathEscape("team/a")
	escapedAgentName := neturl.PathEscape("agent one/2")
	assert.Equal(t, []string{
		"http://controller.example/api/v1/chat/" + escapedNamespace + "/" + escapedAgentName + "/stream",
		"http://controller.example/api/chat/" + escapedNamespace + "/" + escapedAgentName + "/stream",
	}, client.controllerStreamURLs("team/a", "agent one/2"))
}

func newReroutedHTTPClient(t *testing.T, targetURL string) *http.Client {
	t.Helper()

	parsed, err := neturl.Parse(targetURL)
	require.NoError(t, err)

	return &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, network, parsed.Host)
			},
		},
		Timeout: defaultDetectTimeout,
	}
}

func TestDiscover(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/a2a/team-a/agent-one/.well-known/agent.json", r.URL.Path)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"name":"agent-one","description":"demo agent","url":"http://example.com"}`))
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		card, err := client.Discover("team-a", "agent-one")
		require.NoError(t, err)
		require.NotNil(t, card)
		assert.Equal(t, "agent-one", card.Name)
		assert.Equal(t, "demo agent", card.Description)
		assert.Equal(t, "http://example.com", card.URL)
	})

	t.Run("escapes namespace and agent name", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/a2a/team%2Fa/agent%20one/.well-known/agent.json", r.URL.Path)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"name":"agent one","description":"demo"}`))
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		card, err := client.Discover("team/a", "agent one")
		require.NoError(t, err)
		assert.Equal(t, "agent one", card.Name)
	})

	t.Run("handles HTTP errors", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("agent not found"))
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		card, err := client.Discover("team-a", "missing-agent")
		assert.Error(t, err)
		assert.Nil(t, card)
		assert.Contains(t, err.Error(), "404")
	})

	t.Run("handles invalid JSON", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{invalid json`))
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		card, err := client.Discover("team-a", "agent-one")
		assert.Error(t, err)
		assert.Nil(t, card)
		assert.Contains(t, err.Error(), "decode")
	})
}

func TestInvoke(t *testing.T) {
	t.Run("controller mode success", func(t *testing.T) {
		var receivedPayload map[string]any
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/v1/chat/team-a/agent-one/stream" {
				assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
				assert.Equal(t, "text/event-stream", r.Header.Get("Accept"))
				err := json.NewDecoder(r.Body).Decode(&receivedPayload)
				require.NoError(t, err)
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: response\n\n"))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		history := []HistoryMessage{{Role: "user", Content: "hello"}}
		body, err := client.Invoke(context.Background(), "team-a", "agent-one", "test message", "ctx-123", history)
		require.NoError(t, err)
		require.NotNil(t, body)
		defer body.Close()

		assert.Equal(t, "test message", receivedPayload["message"])
		assert.Equal(t, "ctx-123", receivedPayload["session_id"])
		assert.Equal(t, 1, len(receivedPayload["history"].([]any)))
	})

	t.Run("controller mode fallback paths", func(t *testing.T) {
		var requests []string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests = append(requests, r.URL.Path)
			if r.URL.Path == "/api/chat/team-a/agent-one/stream" {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: ok\n\n"))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		body, err := client.Invoke(context.Background(), "team-a", "agent-one", "test", "", nil)
		require.NoError(t, err)
		require.NotNil(t, body)
		defer body.Close()

		assert.Equal(t, []string{
			"/api/v1/chat/team-a/agent-one/stream",
			"/api/chat/team-a/agent-one/stream",
		}, requests)
	})

	t.Run("direct agent mode success", func(t *testing.T) {
		var receivedPayload map[string]any
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/api/chat/stream" {
				err := json.NewDecoder(r.Body).Decode(&receivedPayload)
				require.NoError(t, err)
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: response\n\n"))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := &KagentiClient{
			directAgentURL: strings.TrimRight(server.URL, "/"),
			httpClient:     &http.Client{Timeout: defaultClientTimeout},
		}

		history := []HistoryMessage{{Role: "assistant", Content: "hi"}}
		body, err := client.Invoke(context.Background(), "ignored-ns", "ignored-agent", "direct message", "session-456", history)
		require.NoError(t, err)
		require.NotNil(t, body)
		defer body.Close()

		assert.Equal(t, "direct message", receivedPayload["message"])
		assert.Equal(t, "session-456", receivedPayload["session_id"])
		assert.Equal(t, 1, len(receivedPayload["history"].([]any)))
	})

	t.Run("direct agent mode fallback paths", func(t *testing.T) {
		var requests []string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requests = append(requests, r.URL.Path)
			if r.URL.Path == "/stream" {
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = w.Write([]byte("data: ok\n\n"))
				return
			}
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		client := &KagentiClient{
			directAgentURL: strings.TrimRight(server.URL, "/"),
			httpClient:     &http.Client{Timeout: defaultClientTimeout},
		}

		body, err := client.Invoke(context.Background(), "", "", "msg", "", nil)
		require.NoError(t, err)
		require.NotNil(t, body)
		defer body.Close()

		assert.Equal(t, []string{
			"/api/chat/stream",
			"/chat/stream",
			"/stream",
		}, requests)
	})

	t.Run("handles HTTP errors", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("invalid request"))
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		body, err := client.Invoke(context.Background(), "team-a", "agent-one", "test", "", nil)
		assert.Error(t, err)
		assert.Nil(t, body)
		assert.Contains(t, err.Error(), "400")
	})

	t.Run("handles context cancellation", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			<-r.Context().Done()
		}))
		defer server.Close()

		client := NewKagentiClient(server.URL)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		body, err := client.Invoke(ctx, "team-a", "agent-one", "test", "", nil)
		assert.Error(t, err)
		assert.Nil(t, body)
	})
}
