package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/kagenti_provider"
	"github.com/stretchr/testify/assert"
)

type stubKagentiConfigManager struct {
	status   *kagenti_provider.ConfigStatus
	updateFn func(update kagenti_provider.ConfigUpdate) (*kagenti_provider.ConfigStatus, error)
}

func (s *stubKagentiConfigManager) GetStatus(context.Context) (*kagenti_provider.ConfigStatus, error) {
	return s.status, nil
}

func (s *stubKagentiConfigManager) UpdateConfig(_ context.Context, update kagenti_provider.ConfigUpdate) (*kagenti_provider.ConfigStatus, error) {
	if s.updateFn != nil {
		return s.updateFn(update)
	}
	return s.status, nil
}

func TestKagentiProviderProxyHandler_GetStatus(t *testing.T) {
	t.Run("Nil Client", func(t *testing.T) {
		h := NewKagentiProviderProxyHandler(nil, nil)
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

		client := kagenti_provider.NewKagentiClient(server.URL)
		h := NewKagentiProviderProxyHandler(client, &stubKagentiConfigManager{status: &kagenti_provider.ConfigStatus{
			LLMProvider:         "openai",
			APIKeyConfigured:    true,
			ConfiguredProviders: []string{"openai"},
		}})
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
		updateFn: func(update kagenti_provider.ConfigUpdate) (*kagenti_provider.ConfigStatus, error) {
			assert.Equal(t, "anthropic", update.LLMProvider)
			assert.Equal(t, "sk-ant", update.APIKey)
			return &kagenti_provider.ConfigStatus{
				LLMProvider:         "anthropic",
				APIKeyConfigured:    true,
				ConfiguredProviders: []string{"anthropic"},
			}, nil
		},
	}

	h := NewKagentiProviderProxyHandler(nil, manager)
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
