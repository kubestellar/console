package kagent

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewKagentClient(t *testing.T) {
	tests := []struct {
		name    string
		baseURL string
		want    string
	}{
		{
			name:    "URL without trailing slash",
			baseURL: "http://localhost:8083",
			want:    "http://localhost:8083",
		},
		{
			name:    "URL with trailing slash",
			baseURL: "http://localhost:8083/",
			want:    "http://localhost:8083",
		},
		{
			name:    "URL with multiple trailing slashes",
			baseURL: "http://localhost:8083///",
			want:    "http://localhost:8083",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := NewKagentClient(tt.baseURL)
			require.NotNil(t, client)
			assert.Equal(t, tt.want, client.baseURL)
			assert.NotNil(t, client.httpClient)
			assert.Equal(t, 30*time.Second, client.httpClient.Timeout)
		})
	}
}

func TestNewKagentClientFromEnv(t *testing.T) {
	t.Run("with KAGENT_CONTROLLER_URL set", func(t *testing.T) {
		originalURL := os.Getenv("KAGENT_CONTROLLER_URL")
		defer func() {
			if originalURL == "" {
				os.Unsetenv("KAGENT_CONTROLLER_URL")
			} else {
				os.Setenv("KAGENT_CONTROLLER_URL", originalURL)
			}
		}()

		testURL := "http://test-kagent:8083"
		os.Setenv("KAGENT_CONTROLLER_URL", testURL)

		client := NewKagentClientFromEnv()
		require.NotNil(t, client)
		assert.Equal(t, testURL, client.baseURL)
	})

	t.Run("without KAGENT_CONTROLLER_URL - no detection", func(t *testing.T) {
		originalURL := os.Getenv("KAGENT_CONTROLLER_URL")
		defer func() {
			if originalURL == "" {
				os.Unsetenv("KAGENT_CONTROLLER_URL")
			} else {
				os.Setenv("KAGENT_CONTROLLER_URL", originalURL)
			}
		}()

		os.Unsetenv("KAGENT_CONTROLLER_URL")
		client := NewKagentClientFromEnv()
		assert.Nil(t, client)
	})
}

func TestKagentClient_Status(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantOK     bool
		wantErr    bool
	}{
		{
			name:       "healthy service",
			statusCode: http.StatusOK,
			wantOK:     true,
			wantErr:    false,
		},
		{
			name:       "service unavailable",
			statusCode: http.StatusServiceUnavailable,
			wantOK:     false,
			wantErr:    false,
		},
		{
			name:       "not found",
			statusCode: http.StatusNotFound,
			wantOK:     false,
			wantErr:    false,
		},
		{
			name:       "internal server error",
			statusCode: http.StatusInternalServerError,
			wantOK:     false,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "/health", r.URL.Path)
				w.WriteHeader(tt.statusCode)
			}))
			defer server.Close()

			client := NewKagentClient(server.URL)
			ok, err := client.Status()

			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
			assert.Equal(t, tt.wantOK, ok)
		})
	}

	t.Run("unreachable server", func(t *testing.T) {
		client := NewKagentClient("http://localhost:99999")
		ok, err := client.Status()
		assert.False(t, ok)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "kagent health check failed")
	})
}

func TestKagentClient_ListAgents(t *testing.T) {
	t.Run("successful list", func(t *testing.T) {
		agents := []AgentInfo{
			{
				Name:        "test-agent",
				Namespace:   "default",
				Description: "Test agent",
				Framework:   "langchain",
				Tools:       []string{"kubectl", "helm"},
			},
			{
				Name:      "another-agent",
				Namespace: "kube-system",
				Framework: "custom",
			},
		}

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/agents", r.URL.Path)
			assert.Equal(t, http.MethodGet, r.Method)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(agents)
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.ListAgents()

		require.NoError(t, err)
		require.Len(t, result, 2)
		assert.Equal(t, "test-agent", result[0].Name)
		assert.Equal(t, "default", result[0].Namespace)
		assert.Equal(t, []string{"kubectl", "helm"}, result[0].Tools)
		assert.Equal(t, "another-agent", result[1].Name)
	})

	t.Run("server returns error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("internal error"))
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.ListAgents()

		require.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "list agents returned 500")
	})

	t.Run("invalid JSON response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("not valid json"))
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.ListAgents()

		require.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "failed to decode agent list")
	})
}

func TestKagentClient_Discover(t *testing.T) {
	t.Run("successful discovery", func(t *testing.T) {
		card := AgentCard{
			Name:         "my-agent",
			Description:  "A test agent",
			URL:          "http://agent.example.com",
			Capabilities: []string{"chat", "tools"},
		}

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/a2a/default/my-agent/.well-known/agent.json", r.URL.Path)
			assert.Equal(t, http.MethodGet, r.Method)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(card)
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.Discover("default", "my-agent")

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, "my-agent", result.Name)
		assert.Equal(t, "A test agent", result.Description)
		assert.Equal(t, []string{"chat", "tools"}, result.Capabilities)
	})

	t.Run("agent not found", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte("agent not found"))
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.Discover("default", "nonexistent")

		require.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "discover agent default/nonexistent returned 404")
	})

	t.Run("namespace and agent name are URL encoded", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Contains(t, r.URL.Path, "my%2Bnamespace")
			assert.Contains(t, r.URL.Path, "my%2Bagent")
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(AgentCard{Name: "test"})
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		_, err := client.Discover("my+namespace", "my+agent")
		require.NoError(t, err)
	})
}

func TestKagentClient_Invoke(t *testing.T) {
	t.Run("successful invoke with context ID", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/api/a2a/default/test-agent", r.URL.Path)
			assert.Equal(t, http.MethodPost, r.Method)
			assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

			body, _ := io.ReadAll(r.Body)
			var req map[string]any
			json.Unmarshal(body, &req)

			assert.Equal(t, "2.0", req["jsonrpc"])
			assert.Equal(t, "message/send", req["method"])

			params := req["params"].(map[string]any)
			assert.Equal(t, "ctx-123", params["contextId"])

			message := params["message"].(map[string]any)
			assert.Equal(t, "user", message["role"])

			w.WriteHeader(http.StatusOK)
			w.Write([]byte("response data"))
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.Invoke(context.Background(), "default", "test-agent", "Hello", "ctx-123")

		require.NoError(t, err)
		require.NotNil(t, result)
		defer result.Close()

		data, _ := io.ReadAll(result)
		assert.Equal(t, "response data", string(data))
	})

	t.Run("successful invoke without context ID", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, _ := io.ReadAll(r.Body)
			var req map[string]any
			json.Unmarshal(body, &req)

			params := req["params"].(map[string]any)
			_, hasContextID := params["contextId"]
			assert.False(t, hasContextID)

			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.Invoke(context.Background(), "default", "test-agent", "Hello", "")

		require.NoError(t, err)
		require.NotNil(t, result)
		result.Close()
	})

	t.Run("server returns error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte("invalid request"))
		}))
		defer server.Close()

		client := NewKagentClient(server.URL)
		result, err := client.Invoke(context.Background(), "default", "test-agent", "Hello", "")

		require.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "A2A invoke returned 400")
	})

	t.Run("context cancellation", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(100 * time.Millisecond)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		client := NewKagentClient(server.URL)
		result, err := client.Invoke(ctx, "default", "test-agent", "Hello", "")

		require.Error(t, err)
		assert.Nil(t, result)
	})
}

func TestBuildDetectCandidates(t *testing.T) {
	t.Run("default values", func(t *testing.T) {
		os.Unsetenv("KAGENT_NAMESPACE")
		os.Unsetenv("KAGENT_SERVICE_NAME")
		os.Unsetenv("KAGENT_SERVICE_PORT")
		os.Unsetenv("KAGENT_SERVICE_PROTOCOL")

		candidates := buildDetectCandidates()
		require.Len(t, candidates, 2)
		assert.Equal(t, "http://kagent-controller.kagent.svc:8083", candidates[0])
		assert.Equal(t, "http://kagent-controller.kagent.svc.cluster.local:8083", candidates[1])
	})

	t.Run("custom values from environment", func(t *testing.T) {
		os.Setenv("KAGENT_NAMESPACE", "custom-ns")
		os.Setenv("KAGENT_SERVICE_NAME", "custom-svc")
		os.Setenv("KAGENT_SERVICE_PORT", "9000")
		os.Setenv("KAGENT_SERVICE_PROTOCOL", "https")
		defer func() {
			os.Unsetenv("KAGENT_NAMESPACE")
			os.Unsetenv("KAGENT_SERVICE_NAME")
			os.Unsetenv("KAGENT_SERVICE_PORT")
			os.Unsetenv("KAGENT_SERVICE_PROTOCOL")
		}()

		candidates := buildDetectCandidates()
		require.Len(t, candidates, 2)
		assert.Equal(t, "https://custom-svc.custom-ns.svc:9000", candidates[0])
		assert.Equal(t, "https://custom-svc.custom-ns.svc.cluster.local:9000", candidates[1])
	})
}

func TestKagentClient_Detect(t *testing.T) {
	t.Run("successful detection on first candidate", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/health", r.URL.Path)
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		os.Setenv("KAGENT_NAMESPACE", "test")
		os.Setenv("KAGENT_SERVICE_NAME", "test-svc")
		os.Setenv("KAGENT_SERVICE_PORT", strings.TrimPrefix(server.URL, "http://localhost:"))
		os.Setenv("KAGENT_SERVICE_PROTOCOL", "http")
		defer func() {
			os.Unsetenv("KAGENT_NAMESPACE")
			os.Unsetenv("KAGENT_SERVICE_NAME")
			os.Unsetenv("KAGENT_SERVICE_PORT")
			os.Unsetenv("KAGENT_SERVICE_PROTOCOL")
		}()

		client := &KagentClient{httpClient: &http.Client{Timeout: 1 * time.Second}}
		result := client.Detect()

		assert.NotEmpty(t, result)
		assert.Contains(t, result, "test-svc.test.svc")
	})

	t.Run("no reachable candidates", func(t *testing.T) {
		os.Setenv("KAGENT_NAMESPACE", "nonexistent")
		os.Setenv("KAGENT_SERVICE_NAME", "nonexistent")
		os.Setenv("KAGENT_SERVICE_PORT", "99999")
		defer func() {
			os.Unsetenv("KAGENT_NAMESPACE")
			os.Unsetenv("KAGENT_SERVICE_NAME")
			os.Unsetenv("KAGENT_SERVICE_PORT")
		}()

		client := &KagentClient{httpClient: &http.Client{Timeout: 100 * time.Millisecond}}
		result := client.Detect()

		assert.Empty(t, result)
	})
}

func TestKagentClient_DetectWithContext(t *testing.T) {
	t.Run("context cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		client := &KagentClient{httpClient: &http.Client{Timeout: 1 * time.Second}}
		result := client.DetectWithContext(ctx)

		assert.Empty(t, result)
	})

	t.Run("context timeout", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Millisecond)
		defer cancel()

		os.Setenv("KAGENT_NAMESPACE", "test")
		os.Setenv("KAGENT_SERVICE_PORT", "99999")
		defer func() {
			os.Unsetenv("KAGENT_NAMESPACE")
			os.Unsetenv("KAGENT_SERVICE_PORT")
		}()

		client := &KagentClient{httpClient: &http.Client{Timeout: 5 * time.Second}}
		result := client.DetectWithContext(ctx)

		assert.Empty(t, result)
	})
}

func TestAgentInfoMarshalUnmarshal(t *testing.T) {
	info := AgentInfo{
		Name:        "test-agent",
		Namespace:   "default",
		Description: "A test agent for unit tests",
		Framework:   "langchain",
		Tools:       []string{"kubectl", "helm", "terraform"},
	}

	data, err := json.Marshal(info)
	require.NoError(t, err)

	var decoded AgentInfo
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, info.Name, decoded.Name)
	assert.Equal(t, info.Namespace, decoded.Namespace)
	assert.Equal(t, info.Description, decoded.Description)
	assert.Equal(t, info.Framework, decoded.Framework)
	assert.Equal(t, info.Tools, decoded.Tools)
}

func TestAgentCardMarshalUnmarshal(t *testing.T) {
	card := AgentCard{
		Name:         "kubernetes-agent",
		Description:  "AI agent for Kubernetes operations",
		URL:          "http://agent.example.com/a2a",
		Capabilities: []string{"chat", "tools", "streaming"},
	}

	data, err := json.Marshal(card)
	require.NoError(t, err)

	var decoded AgentCard
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, card.Name, decoded.Name)
	assert.Equal(t, card.Description, decoded.Description)
	assert.Equal(t, card.URL, decoded.URL)
	assert.Equal(t, card.Capabilities, decoded.Capabilities)
}

func TestMaxKAgentResponseBytes(t *testing.T) {
	assert.Equal(t, 10*1024*1024, maxKAgentResponseBytes)
}
