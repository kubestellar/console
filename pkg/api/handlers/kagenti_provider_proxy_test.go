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
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestKagentiProviderProxyHandler_RBAC(t *testing.T) {
	tests := []struct {
		name       string
		role       models.UserRole
		method     string
		path       string
		body       []byte
		wantStatus int
	}{
		{
			name:       "viewer forbidden to chat",
			role:       models.UserRoleViewer,
			method:     http.MethodPost,
			path:       "/chat",
			body:       []byte(`{"agent":"agent1","namespace":"ns1","message":"hello"}`),
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "editor can reach chat handler",
			role:       models.UserRoleEditor,
			method:     http.MethodPost,
			path:       "/chat",
			body:       []byte(`{"agent":"agent1","namespace":"ns1","message":"hello"}`),
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "editor forbidden to update config",
			role:       models.UserRoleEditor,
			method:     http.MethodPatch,
			path:       "/config",
			body:       []byte(`{"llm_provider":"openai"}`),
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "admin can reach update config handler",
			role:       models.UserRoleAdmin,
			method:     http.MethodPatch,
			path:       "/config",
			body:       []byte(`{"llm_provider":"openai"}`),
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "editor forbidden to call upstream tool",
			role:       models.UserRoleEditor,
			method:     http.MethodPost,
			path:       "/tools/call",
			body:       []byte(`{"agent":"agent1","namespace":"ns1","tool":"get_cluster_list","args":{}}`),
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "admin can reach upstream tool handler",
			role:       models.UserRoleAdmin,
			method:     http.MethodPost,
			path:       "/tools/call",
			body:       []byte(`{"agent":"agent1","namespace":"ns1","tool":"get_cluster_list","args":{}}`),
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "viewer forbidden to call direct tool",
			role:       models.UserRoleViewer,
			method:     http.MethodPost,
			path:       "/tools/call-direct",
			body:       []byte(`{"tool":"get_cluster_list","args":{}}`),
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "editor can reach direct tool handler",
			role:       models.UserRoleEditor,
			method:     http.MethodPost,
			path:       "/tools/call-direct",
			body:       []byte(`{"tool":"get_cluster_list","args":{}}`),
			wantStatus: http.StatusServiceUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			mockStore := new(test.MockStore)
			userID := uuid.New()
			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Once()

			h := NewKagentiProviderProxyHandler(nil, nil, nil, mockStore)
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})
			app.Post("/chat", h.Chat)
			app.Patch("/config", h.UpdateConfig)
			app.Post("/tools/call", h.CallTool)
			app.Post("/tools/call-direct", h.CallToolDirect)

			req := httptest.NewRequest(tt.method, tt.path, bytes.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")

			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
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
