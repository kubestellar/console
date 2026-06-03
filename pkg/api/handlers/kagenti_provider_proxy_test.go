package handlers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
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
		assert.Equal(t, 200, resp.StatusCode)

		var body map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&body)
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
		assert.Equal(t, 200, resp.StatusCode)

		var body map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&body)
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
	json.NewDecoder(resp.Body).Decode(&payload)
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

func TestCallToolDirect_RequiresEditorOrAdmin(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	userID := uuid.New()
	mockStore.On("GetUser", userID).Return(&models.User{Role: models.UserRoleViewer}, nil)

	h := NewKagentiProviderProxyHandler(nil, nil, nil, mockStore)
	app.Post("/tools/call-direct", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return h.CallToolDirect(c)
	})

	req := httptest.NewRequest(http.MethodPost, "/tools/call-direct", bytes.NewBufferString(`{"tool":"get_cluster_list","args":{}}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	mockStore.AssertExpectations(t)
}

func TestKagentiDirectSanitizers_StripSensitiveFieldsAndClampResults(t *testing.T) {
	clusters := sanitizeKagentiDirectClusters([]k8s.ClusterInfo{{
		Name:       "cluster-a",
		Server:     "https://internal.example",
		User:       "admin",
		AuthMethod: "token",
		Healthy:    true,
		NodeCount:  3,
		PodCount:   12,
	}})
	clusterJSON, err := json.Marshal(clusters)
	assert.NoError(t, err)
	assert.NotContains(t, string(clusterJSON), "server")
	assert.NotContains(t, string(clusterJSON), "authMethod")

	pods := sanitizeKagentiDirectPods([]k8s.PodInfo{
		{
			Name:        "pod-a",
			Namespace:   "default",
			Cluster:     "cluster-a",
			Status:      "Running",
			Ready:       "1/1",
			Restarts:    2,
			Age:         "5m",
			Node:        "node-a",
			Labels:      map[string]string{"secret": "value"},
			Annotations: map[string]string{"token": "hidden"},
			Containers: []k8s.ContainerInfo{{
				Name:    "main",
				Image:   "nginx:latest",
				Ready:   true,
				State:   "running",
				Reason:  "Started",
				Message: "sensitive details",
			}},
		},
		{Name: "pod-b", Namespace: "default", Status: "Pending", Ready: "0/1", Age: "1m"},
	}, 1)
	assert.Len(t, pods, 1)
	podJSON, err := json.Marshal(pods)
	assert.NoError(t, err)
	assert.NotContains(t, string(podJSON), "labels")
	assert.NotContains(t, string(podJSON), "annotations")
	assert.NotContains(t, string(podJSON), "node")
	assert.NotContains(t, string(podJSON), "message")

	assert.Equal(t, kagentiDirectToolMaxItems, extractKagentiDirectToolLimit(map[string]any{"limit": float64(500)}))
	assert.Equal(t, kagentiDirectToolDefaultLimit, extractKagentiDirectToolLimit(map[string]any{}))
}
