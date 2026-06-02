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

func TestKagentiProviderProxyHandler_RoleAuthorization(t *testing.T) {
	tests := []struct {
		name        string
		role        models.UserRole
		method      string
		path        string
		body        string
		register    func(app *fiber.App, h *KagentiProviderProxyHandler)
		handler     *KagentiProviderProxyHandler
		wantStatus  int
		wantMessage string
	}{
		{
			name:   "UpdateConfig rejects viewer",
			role:   models.UserRoleViewer,
			method: http.MethodPatch,
			path:   "/config",
			body:   `{"llm_provider":"anthropic"}`,
			register: func(app *fiber.App, h *KagentiProviderProxyHandler) {
				app.Patch("/config", h.UpdateConfig)
			},
			handler:     NewKagentiProviderProxyHandler(nil, &stubKagentiConfigManager{}, nil, nil),
			wantStatus:  http.StatusForbidden,
			wantMessage: "Console admin access required",
		},
		{
			name:   "CallTool rejects editor",
			role:   models.UserRoleEditor,
			method: http.MethodPost,
			path:   "/tools/call",
			body:   `{"agent":"ops","namespace":"default","tool":"get_cluster_list"}`,
			register: func(app *fiber.App, h *KagentiProviderProxyHandler) {
				app.Post("/tools/call", h.CallTool)
			},
			handler:     NewKagentiProviderProxyHandler(nil, nil, nil, nil),
			wantStatus:  http.StatusForbidden,
			wantMessage: "Console admin access required",
		},
		{
			name:   "Chat rejects viewer",
			role:   models.UserRoleViewer,
			method: http.MethodPost,
			path:   "/chat",
			body:   `{"agent":"ops","namespace":"default","message":"hello"}`,
			register: func(app *fiber.App, h *KagentiProviderProxyHandler) {
				app.Post("/chat", h.Chat)
			},
			handler:     NewKagentiProviderProxyHandler(nil, nil, nil, nil),
			wantStatus:  http.StatusForbidden,
			wantMessage: "Editor or admin role required",
		},
		{
			name:   "CallToolDirect rejects viewer",
			role:   models.UserRoleViewer,
			method: http.MethodPost,
			path:   "/tools/call-direct",
			body:   `{"tool":"get_cluster_list"}`,
			register: func(app *fiber.App, h *KagentiProviderProxyHandler) {
				app.Post("/tools/call-direct", h.CallToolDirect)
			},
			handler:     NewKagentiProviderProxyHandler(nil, nil, nil, nil),
			wantStatus:  http.StatusForbidden,
			wantMessage: "Editor or admin role required",
		},
		{
			name:   "Chat allows editor before upstream availability check",
			role:   models.UserRoleEditor,
			method: http.MethodPost,
			path:   "/chat",
			body:   `{"agent":"ops","namespace":"default","message":"hello"}`,
			register: func(app *fiber.App, h *KagentiProviderProxyHandler) {
				app.Post("/chat", h.Chat)
			},
			handler:     NewKagentiProviderProxyHandler(nil, nil, nil, nil),
			wantStatus:  http.StatusServiceUnavailable,
			wantMessage: "kagenti not configured",
		},
		{
			name:   "CallToolDirect allows editor before k8s check",
			role:   models.UserRoleEditor,
			method: http.MethodPost,
			path:   "/tools/call-direct",
			body:   `{"tool":"get_cluster_list"}`,
			register: func(app *fiber.App, h *KagentiProviderProxyHandler) {
				app.Post("/tools/call-direct", h.CallToolDirect)
			},
			handler:     NewKagentiProviderProxyHandler(nil, nil, nil, nil),
			wantStatus:  http.StatusServiceUnavailable,
			wantMessage: "k8s client not available",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			mockStore := new(test.MockStore)
			userID := uuid.New()
			mockStore.On("GetUser", userID).Return(&models.User{Role: tt.role}, nil)

			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})

			h := tt.handler
			h.store = mockStore
			tt.register(app, h)

			req := httptest.NewRequest(tt.method, tt.path, bytes.NewBufferString(tt.body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := app.Test(req)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)

			bodyBytes, readErr := io.ReadAll(resp.Body)
			assert.NoError(t, readErr)

			var payload map[string]interface{}
			if err := json.Unmarshal(bodyBytes, &payload); err == nil {
				assert.Equal(t, tt.wantMessage, payload["error"])
			} else {
				assert.Equal(t, tt.wantMessage, string(bytes.TrimSpace(bodyBytes)))
			}
			mockStore.AssertExpectations(t)
		})
	}
}

func TestWriteSSEDataEvent_PreservesMultilinePayloads(t *testing.T) {
	var buf bytes.Buffer
	writer := bufio.NewWriter(&buf)

	err := writeSSEDataEvent(writer, "line one\nline two")
	assert.NoError(t, err)
	assert.NoError(t, writer.Flush())
	assert.Equal(t, "data: line one\ndata: line two\n\n", buf.String())
}
