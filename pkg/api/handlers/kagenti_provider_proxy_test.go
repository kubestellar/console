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
	"github.com/kubestellar/console/pkg/kagentiprovider"
	"github.com/kubestellar/console/pkg/models"
	teststore "github.com/kubestellar/console/pkg/test"
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
		assert.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
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
		assert.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
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
	assert.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Equal(t, "anthropic", payload["llm_provider"])
	assert.Equal(t, true, payload["api_key_configured"])
}

func TestKagentiProviderProxyHandler_CallToolDirect(t *testing.T) {
	t.Run("Requires Admin", func(t *testing.T) {
		userID := uuid.New()
		mockStore := &teststore.MockStore{}
		mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleViewer}, nil)

		h := NewKagentiProviderProxyHandler(nil, nil, nil, mockStore)
		app := fiber.New()
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
		app.Post("/tools/call-direct", h.CallToolDirect)

		body := bytes.NewBufferString(`{"tool":"get_cluster_list"}`)
		req := httptest.NewRequest(http.MethodPost, "/tools/call-direct", body)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})

	t.Run("Admin Continues To Handler", func(t *testing.T) {
		userID := uuid.New()
		mockStore := &teststore.MockStore{}
		mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleAdmin}, nil)

		h := NewKagentiProviderProxyHandler(nil, nil, nil, mockStore)
		app := fiber.New()
		app.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", userID)
			return c.Next()
		})
		app.Post("/tools/call-direct", h.CallToolDirect)

		body := bytes.NewBufferString(`{"tool":"get_cluster_list"}`)
		req := httptest.NewRequest(http.MethodPost, "/tools/call-direct", body)
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})
}

func TestWriteSSEDataEvent_PreservesMultilinePayloads(t *testing.T) {
	var buf bytes.Buffer
	writer := bufio.NewWriter(&buf)

	err := writeSSEDataEvent(writer, "line one\nline two")
	assert.NoError(t, err)
	assert.NoError(t, writer.Flush())
	assert.Equal(t, "data: line one\ndata: line two\n\n", buf.String())
}
