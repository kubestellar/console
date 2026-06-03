package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/kagent"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKagentProxyHandler_GetStatus(t *testing.T) {
	t.Run("Nil Client", func(t *testing.T) {
		h := NewKagentProxyHandler(nil, nil)
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

		client := kagent.NewKagentClient(server.URL)
		h := NewKagentProxyHandler(client, nil)
		app := fiber.New()
		app.Get("/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/status", nil)
		resp, err := app.Test(req)
		assert.NoError(t, err)
		assert.Equal(t, 200, resp.StatusCode)

		var body map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&body)
		assert.True(t, body["available"].(bool))
	})
}

func TestKagentProxyHandler_ListAgents(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, `[{"name":"agent1","namespace":"ns1"}]`)
	}))
	defer server.Close()

	client := kagent.NewKagentClient(server.URL)
	h := NewKagentProxyHandler(client, nil)
	app := fiber.New()
	app.Get("/agents", h.ListAgents)

	req := httptest.NewRequest("GET", "/agents", nil)
	resp, err := app.Test(req)
	assert.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var body map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&body)
	assert.NotNil(t, body["agents"])
	agents := body["agents"].([]interface{})
	assert.Len(t, agents, 1)
}

func TestKagentProxyHandler_RequiresEditorOrAdmin(t *testing.T) {
	tests := []struct {
		name       string
		role       models.UserRole
		path       string
		method     string
		body       []byte
		wantStatus int
	}{
		{
			name:       "viewer forbidden to list agents",
			role:       models.UserRoleViewer,
			path:       "/agents",
			method:     http.MethodGet,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "editor can list agents",
			role:       models.UserRoleEditor,
			path:       "/agents",
			method:     http.MethodGet,
			wantStatus: http.StatusOK,
		},
		{
			name:       "viewer forbidden to chat",
			role:       models.UserRoleViewer,
			path:       "/chat",
			method:     http.MethodPost,
			body:       []byte(`{"agent":"agent1","namespace":"ns1","message":"hi"}`),
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "editor can reach chat handler",
			role:       models.UserRoleEditor,
			path:       "/chat",
			method:     http.MethodPost,
			body:       []byte(`{"agent":"agent1","namespace":"ns1","message":"hi"}`),
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "viewer forbidden to call tools",
			role:       models.UserRoleViewer,
			path:       "/tools/call",
			method:     http.MethodPost,
			body:       []byte(`{"agent":"agent1","namespace":"ns1","tool":"kubectl-get","args":{}}`),
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "editor can reach tool call handler",
			role:       models.UserRoleEditor,
			path:       "/tools/call",
			method:     http.MethodPost,
			body:       []byte(`{"agent":"agent1","namespace":"ns1","tool":"kubectl-get","args":{}}`),
			wantStatus: http.StatusServiceUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			mockStore := new(test.MockStore)
			userID := uuid.New()
			mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: tt.role}, nil).Once()

			h := NewKagentProxyHandler(nil, mockStore)
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", userID)
				return c.Next()
			})
			app.Get("/agents", h.ListAgents)
			app.Post("/chat", h.Chat)
			app.Post("/tools/call", h.CallTool)

			req := httptest.NewRequest(tt.method, tt.path, bytes.NewReader(tt.body))
			if tt.body != nil {
				req.Header.Set("Content-Type", "application/json")
			}

			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			mockStore.AssertExpectations(t)
		})
	}
}
