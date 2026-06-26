package kagent

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newTestClient(t *testing.T, baseURL string, transport http.RoundTripper) *KagentClient {
	t.Helper()

	client := NewKagentClient(baseURL)
	if transport != nil {
		client.httpClient.Transport = transport
	}
	return client
}

func readAllAndClose(t *testing.T, rc io.ReadCloser) string {
	t.Helper()

	defer func() {
		require.NoError(t, rc.Close())
	}()

	data, err := io.ReadAll(rc)
	require.NoError(t, err)
	return string(data)
}

func TestNewKagentClientTrimsTrailingSlash(t *testing.T) {
	client := NewKagentClient("http://example.com/")
	assert.Equal(t, "http://example.com", client.baseURL)
	require.NotNil(t, client.httpClient)
}

func TestNewKagentClientFromEnvUsesConfiguredURL(t *testing.T) {
	t.Setenv("KAGENT_CONTROLLER_URL", "http://controller.example.com/")

	client := NewKagentClientFromEnv()
	require.NotNil(t, client)
	assert.Equal(t, "http://controller.example.com", client.baseURL)
}

func TestKagentClientStatus(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		transport  http.RoundTripper
		want       bool
		wantErr    string
	}{
		{
			name:       "healthy response returns true",
			statusCode: http.StatusOK,
			want:       true,
		},
		{
			name:       "non success response returns false without error",
			statusCode: http.StatusServiceUnavailable,
			want:       false,
		},
		{
			name: "transport errors are wrapped",
			transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return nil, errors.New("boom")
			}),
			wantErr: "kagent health check failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.transport != nil {
				client := newTestClient(t, "http://example.com", tt.transport)
				ok, err := client.Status()
				require.Error(t, err)
				assert.False(t, ok)
				assert.Contains(t, err.Error(), tt.wantErr)
				return
			}

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/health", r.URL.Path)
				w.WriteHeader(tt.statusCode)
			}))
			defer server.Close()

			client := NewKagentClient(server.URL)
			ok, err := client.Status()
			require.NoError(t, err)
			assert.Equal(t, tt.want, ok)
		})
	}
}

func TestKagentClientListAgents(t *testing.T) {
	tests := []struct {
		name        string
		statusCode  int
		body        string
		wantAgents  []AgentInfo
		wantErrText string
	}{
		{
			name:       "decodes agent list",
			statusCode: http.StatusOK,
			body:       `[{"name":"ops","namespace":"team-a","description":"Ops agent","framework":"langgraph","tools":["kubectl","logs"]}]`,
			wantAgents: []AgentInfo{{Name: "ops", Namespace: "team-a", Description: "Ops agent", Framework: "langgraph", Tools: []string{"kubectl", "logs"}}},
		},
		{
			name:        "includes response body on http error",
			statusCode:  http.StatusBadGateway,
			body:        `upstream unavailable`,
			wantErrText: "list agents returned 502: upstream unavailable",
		},
		{
			name:        "reports invalid json",
			statusCode:  http.StatusOK,
			body:        `{`,
			wantErrText: "failed to decode agent list",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/api/agents", r.URL.Path)
				w.WriteHeader(tt.statusCode)
				_, _ = io.WriteString(w, tt.body)
			}))
			defer server.Close()

			client := NewKagentClient(server.URL)
			agents, err := client.ListAgents()
			if tt.wantErrText != "" {
				require.Error(t, err)
				assert.Nil(t, agents)
				assert.Contains(t, err.Error(), tt.wantErrText)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantAgents, agents)
		})
	}
}

func TestKagentClientDiscover(t *testing.T) {
	tests := []struct {
		name          string
		namespace     string
		agentName     string
		statusCode    int
		body          string
		wantEscaped   string
		wantCard      *AgentCard
		wantErrSubstr string
	}{
		{
			name:        "escapes path segments and decodes card",
			namespace:   "team/alpha",
			agentName:   "ops bot",
			statusCode:  http.StatusOK,
			body:        `{"name":"ops bot","description":"handles ops","url":"https://agent.example.com","capabilities":["chat"]}`,
			wantEscaped: "/api/a2a/team%2Falpha/ops%20bot/.well-known/agent.json",
			wantCard:    &AgentCard{Name: "ops bot", Description: "handles ops", URL: "https://agent.example.com", Capabilities: []string{"chat"}},
		},
		{
			name:          "returns http error details",
			namespace:     "team-a",
			agentName:     "missing",
			statusCode:    http.StatusNotFound,
			body:          `missing`,
			wantEscaped:   "/api/a2a/team-a/missing/.well-known/agent.json",
			wantErrSubstr: "discover agent team-a/missing returned 404: missing",
		},
		{
			name:          "reports invalid json",
			namespace:     "team-a",
			agentName:     "broken",
			statusCode:    http.StatusOK,
			body:          `{`,
			wantEscaped:   "/api/a2a/team-a/broken/.well-known/agent.json",
			wantErrSubstr: "failed to decode agent card",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, tt.wantEscaped, r.URL.EscapedPath())
				w.WriteHeader(tt.statusCode)
				_, _ = io.WriteString(w, tt.body)
			}))
			defer server.Close()

			client := NewKagentClient(server.URL)
			card, err := client.Discover(tt.namespace, tt.agentName)
			if tt.wantErrSubstr != "" {
				require.Error(t, err)
				assert.Nil(t, card)
				assert.Contains(t, err.Error(), tt.wantErrSubstr)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantCard, card)
		})
	}
}

func TestKagentClientInvoke(t *testing.T) {
	tests := []struct {
		name             string
		contextID        string
		responseStatus   int
		responseBody     string
		wantContextField bool
		wantErrSubstr    string
	}{
		{
			name:             "sends json rpc request with context id",
			contextID:        "ctx-7",
			responseStatus:   http.StatusOK,
			responseBody:     `stream-body`,
			wantContextField: true,
		},
		{
			name:             "omits empty context id",
			responseStatus:   http.StatusOK,
			responseBody:     `stream-body`,
			wantContextField: false,
		},
		{
			name:           "returns http error details",
			responseStatus: http.StatusBadGateway,
			responseBody:   `upstream failed`,
			wantErrSubstr:  "A2A invoke returned 502: upstream failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodPost, r.Method)
				assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
				assert.Equal(t, "/api/a2a/team%2Falpha/ops%20bot", r.URL.EscapedPath())

				var reqBody a2aRequest
				require.NoError(t, json.NewDecoder(r.Body).Decode(&reqBody))
				assert.Equal(t, "2.0", reqBody.JSONRPC)
				assert.Equal(t, "message/send", reqBody.Method)
				assert.Equal(t, "user", reqBody.Params["message"].(map[string]any)["role"])
				assert.Equal(t, []any{"text"}, []any{reqBody.Params["message"].(map[string]any)["parts"].([]any)[0].(map[string]any)["kind"]})
				assert.Equal(t, []any{"text"}, reqBody.Params["configuration"].(map[string]any)["acceptedOutputModes"])

				_, hasContext := reqBody.Params["contextId"]
				assert.Equal(t, tt.wantContextField, hasContext)
				if tt.wantContextField {
					assert.Equal(t, tt.contextID, reqBody.Params["contextId"])
				}

				w.WriteHeader(tt.responseStatus)
				_, _ = io.WriteString(w, tt.responseBody)
			}))
			defer server.Close()

			client := NewKagentClient(server.URL)
			body, err := client.Invoke(context.Background(), "team/alpha", "ops bot", "check pods", tt.contextID)
			if tt.wantErrSubstr != "" {
				require.Error(t, err)
				assert.Nil(t, body)
				assert.Contains(t, err.Error(), tt.wantErrSubstr)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.responseBody, readAllAndClose(t, body))
		})
	}
}

func TestKagentClientInvokeTransportError(t *testing.T) {
	client := newTestClient(t, "http://example.com", roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return nil, errors.New("dial failed")
	}))

	body, err := client.Invoke(context.Background(), "team-a", "ops", "hello", "")
	require.Error(t, err)
	assert.Nil(t, body)
	assert.Contains(t, err.Error(), "A2A invoke failed")
}

func TestBuildDetectCandidates(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		t.Setenv("KAGENT_NAMESPACE", "")
		t.Setenv("KAGENT_SERVICE_NAME", "")
		t.Setenv("KAGENT_SERVICE_PORT", "")
		t.Setenv("KAGENT_SERVICE_PROTOCOL", "")

		assert.Equal(t, []string{
			"http://kagent-controller.kagent.svc:8083",
			"http://kagent-controller.kagent.svc.cluster.local:8083",
		}, buildDetectCandidates())
	})

	t.Run("environment overrides", func(t *testing.T) {
		t.Setenv("KAGENT_NAMESPACE", "agents")
		t.Setenv("KAGENT_SERVICE_NAME", "controller")
		t.Setenv("KAGENT_SERVICE_PORT", "8443")
		t.Setenv("KAGENT_SERVICE_PROTOCOL", "https")

		assert.Equal(t, []string{
			"https://controller.agents.svc:8443",
			"https://controller.agents.svc.cluster.local:8443",
		}, buildDetectCandidates())
	})
}

func TestKagentClientDetectWithContext(t *testing.T) {
	tests := []struct {
		name       string
		transport  http.RoundTripper
		want       string
		cancelCtx  bool
		setEnvFunc func(t *testing.T)
	}{
		{
			name: "returns first healthy candidate",
			transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if strings.Contains(req.URL.Host, ".svc:") {
					return nil, errors.New("dial tcp: lookup failed")
				}
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("ok")), Header: make(http.Header)}, nil
			}),
			want: "http://kagent-controller.kagent.svc.cluster.local:8083",
		},
		{
			name: "ignores unhealthy candidates",
			transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: http.StatusBadGateway, Body: io.NopCloser(strings.NewReader("bad")), Header: make(http.Header)}, nil
			}),
			want: "",
		},
		{
			name: "returns empty when context already cancelled",
			transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				return nil, req.Context().Err()
			}),
			want:      "",
			cancelCtx: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := newTestClient(t, "http://unused", tt.transport)
			ctx := context.Background()
			if tt.cancelCtx {
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			}

			assert.Equal(t, tt.want, client.DetectWithContext(ctx))
		})
	}
}
