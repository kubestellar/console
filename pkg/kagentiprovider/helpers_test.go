package kagentiprovider

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDrainAndClose(t *testing.T) {
	t.Run("nil body is handled safely", func(t *testing.T) {
		// Should not panic
		assert.NotPanics(t, func() {
			drainAndClose(nil)
		})
	})

	t.Run("drains and closes body", func(t *testing.T) {
		body := io.NopCloser(strings.NewReader("test data"))
		drainAndClose(body)
		
		// Verify reading again returns EOF (already drained/closed)
		buf := make([]byte, 1)
		_, err := body.Read(buf)
		require.Error(t, err)
	})

	t.Run("handles large bodies with size limit", func(t *testing.T) {
		// Create body larger than 1MB limit
		largeData := strings.Repeat("x", 2*1024*1024)
		body := io.NopCloser(strings.NewReader(largeData))
		
		// Should not panic even with large body
		assert.NotPanics(t, func() {
			drainAndClose(body)
		})
	})
}

func TestAgentInfo_Defaults(t *testing.T) {
	agent := AgentInfo{
		Name:      "test-agent",
		Namespace: "test-ns",
	}
	
	assert.Equal(t, "test-agent", agent.Name)
	assert.Equal(t, "test-ns", agent.Namespace)
	assert.Empty(t, agent.Description)
	assert.Empty(t, agent.Framework)
	assert.Empty(t, agent.Tools)
}

func TestAgentCard_Serialization(t *testing.T) {
	card := AgentCard{
		Name:         "test-agent",
		Description:  "A test agent",
		URL:          "http://example.com",
		Capabilities: []string{"chat", "stream"},
	}
	
	assert.Equal(t, "test-agent", card.Name)
	assert.Equal(t, "A test agent", card.Description)
	assert.Equal(t, "http://example.com", card.URL)
	assert.Len(t, card.Capabilities, 2)
}

func TestConstants(t *testing.T) {
	t.Run("timeout constants", func(t *testing.T) {
		require.Equal(t, defaultClientTimeout.Seconds(), float64(30))
		require.Equal(t, defaultDetectTimeout.Seconds(), float64(3))
	})

	t.Run("service defaults", func(t *testing.T) {
		require.Equal(t, "kagenti-system", defaultKagentiNamespace)
		require.Equal(t, "kagenti-backend", defaultKagentiServiceName)
		require.Equal(t, "8000", defaultKagentiServicePort)
		require.Equal(t, "kagenti-controller", legacyKagentiServiceName)
		require.Equal(t, "8083", legacyKagentiServicePort)
		require.Equal(t, "http", defaultKagentiServiceScheme)
		require.Equal(t, "kagenti-agent", defaultDirectAgentName)
		require.Equal(t, "default", defaultDirectAgentNamespace)
	})

	t.Run("max response size", func(t *testing.T) {
		require.Equal(t, 10*1024*1024, maxKAgentResponseBytes)
	})

	t.Run("health paths", func(t *testing.T) {
		require.Contains(t, kagentiHealthPaths, "/health")
		require.Contains(t, kagentiHealthPaths, "/healthz")
		require.Contains(t, kagentiHealthPaths, "/api/health")
	})

	t.Run("list agent paths", func(t *testing.T) {
		require.Contains(t, kagentiListAgentPaths, "/api/v1/agents")
		require.Contains(t, kagentiListAgentPaths, "/api/agents")
	})

	t.Run("direct card paths", func(t *testing.T) {
		require.Contains(t, kagentiDirectCardPaths, "/.well-known/agent-card.json")
		require.Contains(t, kagentiDirectCardPaths, "/.well-known/agent.json")
	})
}

func TestKagentiClient_Accessors(t *testing.T) {
	t.Run("controller client", func(t *testing.T) {
		client := NewKagentiClient("http://controller.example.com")
		
		assert.Equal(t, "http://controller.example.com", client.BaseURL())
		assert.Empty(t, client.DirectAgentURL())
		assert.Empty(t, client.DirectAgentName())
		assert.Empty(t, client.DirectAgentNamespace())
	})

	t.Run("direct agent client", func(t *testing.T) {
		client := &KagentiClient{
			directAgentURL:       "http://agent.example.com",
			directAgentName:      "my-agent",
			directAgentNamespace: "my-ns",
			httpClient:           &http.Client{},
		}
		
		assert.Empty(t, client.BaseURL())
		assert.Equal(t, "http://agent.example.com", client.DirectAgentURL())
		assert.Equal(t, "my-agent", client.DirectAgentName())
		assert.Equal(t, "my-ns", client.DirectAgentNamespace())
	})
}
