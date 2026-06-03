package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/kagentiprovider"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

type stubKagentiConfigManager struct {
	status   *kagentiprovider.ConfigStatus
	updateFn func(update kagentiprovider.ConfigUpdate) (*kagentiprovider.ConfigStatus, error)
}

func (s *stubKagentiConfigManager) GetStatus(context.Context) (*kagentiprovider.ConfigStatus, error) {
	return s.status, nil
}

func (s *stubKagentiConfigManager) UpdateConfig(_ context.Context, update kagentiprovider.ConfigUpdate) (*kagentiprovider.ConfigStatus, error) {
	if s.updateFn != nil {
		return s.updateFn(update)
	}
	return s.status, nil
}

func TestKagentiProviderProxyHandler_GetStatus(t *testing.T) {
	t.Run("Nil Client", func(t *testing.T) {
		h := NewKagentiProviderProxyHandler(nil, nil, nil, nil)
		app := fiber.New()
		app.Get("/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/status", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var body map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		assert.False(t, body["available"].(bool))
	})

	t.Run("Available", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()

		client := kagentiprovider.NewKagentiClient(server.URL)
		h := NewKagentiProviderProxyHandler(client, &stubKagentiConfigManager{status: &kagentiprovider.ConfigStatus{
			LLMProvider:         "openai",
			APIKeyConfigured:    true,
			ConfiguredProviders: []string{"openai"},
		}}, nil, nil)
		app := fiber.New()
		app.Get("/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/status", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var body map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&body)
		assert.True(t, body["available"].(bool))
		assert.Equal(t, "openai", body["llm_provider"])
		assert.Equal(t, true, body["api_key_configured"])
	})
}

func TestKagentiProviderProxyHandler_UpdateConfig(t *testing.T) {
	manager := &stubKagentiConfigManager{
		updateFn: func(update kagentiprovider.ConfigUpdate) (*kagentiprovider.ConfigStatus, error) {
			assert.Equal(t, "anthropic", update.LLMProvider)
			assert.Equal(t, "sk-ant", update.APIKey)
			return &kagentiprovider.ConfigStatus{
				LLMProvider:         "anthropic",
				APIKeyConfigured:    true,
				ConfiguredProviders: []string{"anthropic"},
			}, nil
		},
	}

	h := NewKagentiProviderProxyHandler(nil, manager, nil, nil)
	app := fiber.New()
	app.Patch("/config", h.UpdateConfig)

	body := bytes.NewBufferString(`{"llm_provider":"anthropic","api_key":"sk-ant"}`)
	req := httptest.NewRequest(http.MethodPatch, "/config", body)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var payload map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&payload)
	assert.Equal(t, "anthropic", payload["llm_provider"])
	assert.Equal(t, true, payload["api_key_configured"])
}

func TestWriteSSEDataEvent_PreservesMultilinePayloads(t *testing.T) {
	var buf bytes.Buffer
	writer := bufio.NewWriter(&buf)

	err := writeSSEDataEvent(writer, "line one\nline two")
	assert.NoError(t, err)
	assert.NoError(t, writer.Flush())
	assert.Equal(t, "data: line one\ndata: line two\n\n", buf.String())
}

func TestKagentiProviderProxyHandler_ChatUsesGenericPromptForNonAdmin(t *testing.T) {
	var gotMessage string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		gotMessage, _ = payload["message"].(string)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: hello\n\ndata: [DONE]\n\n")
	}))
	defer server.Close()

	mockStore := new(test.MockStore)
	userID := uuid.New()
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleViewer}, nil).Once()

	h := NewKagentiProviderProxyHandler(kagentiprovider.NewKagentiClient(server.URL), nil, &k8s.MultiClusterClient{}, mockStore)
	app := fiber.New()
	app.Post("/chat", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return h.Chat(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/chat", bytes.NewBufferString(`{"agent":"planner","namespace":"default","message":"hi"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, buildKagentiGenericPrompt("hi"), gotMessage)
	mockStore.AssertExpectations(t)
}

func TestKagentiProviderProxyHandler_ChatUsesGenericPromptWhenInventoryDisabled(t *testing.T) {
	t.Setenv(kagentiDisableInventory, "true")

	var gotMessage string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		var payload map[string]any
		_ = json.NewDecoder(r.Body).Decode(&payload)
		gotMessage, _ = payload["message"].(string)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: hello\n\ndata: [DONE]\n\n")
	}))
	defer server.Close()

	h := NewKagentiProviderProxyHandler(kagentiprovider.NewKagentiClient(server.URL), nil, &k8s.MultiClusterClient{}, nil)
	app := fiber.New()
	app.Post("/chat", func(c *fiber.Ctx) error {
		return h.Chat(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/chat", bytes.NewBufferString(`{"agent":"planner","namespace":"default","message":"original"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, buildKagentiGenericPrompt("original"), gotMessage)
}

func TestBuildKagentiInventoryPromptIncludesOnlySanitizedClusterDetails(t *testing.T) {
	message := buildKagentiInventoryPrompt("check cluster health", []k8s.ClusterInfo{{
		Name:      "cluster-a",
		Healthy:   true,
		NodeCount: 3,
		PodCount:  42,
		Server:    "https://10.0.0.1:6443",
		User:      "cluster-admin",
	}})

	assert.Contains(t, message, "You are a helpful Kubernetes assistant")
	assert.Contains(t, message, "Cluster: cluster-a")
	assert.Contains(t, message, "Status: Healthy")
	assert.NotContains(t, message, "Nodes: 3")
	assert.NotContains(t, message, "Pods: 42")
	assert.NotContains(t, message, "10.0.0.1")
	assert.NotContains(t, message, "cluster-admin")
	assert.Contains(t, message, "check cluster health")
}

func TestSanitizeKagentiClusterInventoryRedactsSensitiveFields(t *testing.T) {
	summaries := sanitizeKagentiClusterInventory([]k8s.ClusterInfo{{
		Name:          "cluster-a",
		Healthy:       false,
		HealthUnknown: true,
		Server:        "https://10.0.0.1:6443",
		User:          "cluster-admin",
		NodeCount:     3,
		PodCount:      42,
	}})

	assert.Equal(t, []kagentiClusterSummary{{
		Name:   "cluster-a",
		Status: "Unknown",
	}}, summaries)
}
