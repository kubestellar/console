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

func TestKagentProxyHandler_Authorization(t *testing.T) {
	viewerID := uuid.New()
	editorID := uuid.New()

	viewerStore := new(test.MockStore)
	viewerStore.On("GetUser", viewerID).Return(&models.User{ID: viewerID, Role: models.UserRoleViewer}, nil).Maybe()
	editorStore := new(test.MockStore)
	editorStore.On("GetUser", editorID).Return(&models.User{ID: editorID, Role: models.UserRoleEditor}, nil).Maybe()

	tests := []struct {
		name       string
		userID     uuid.UUID
		store      *test.MockStore
		register   func(app *fiber.App, h *KagentProxyHandler)
		request    *http.Request
		wantStatus int
	}{
		{
			name:   "viewer cannot list agents",
			userID: viewerID,
			store:  viewerStore,
			register: func(app *fiber.App, h *KagentProxyHandler) {
				app.Get("/agents", h.ListAgents)
			},
			request:    httptest.NewRequest(http.MethodGet, "/agents", nil),
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "viewer cannot chat",
			userID: viewerID,
			store:  viewerStore,
			register: func(app *fiber.App, h *KagentProxyHandler) {
				app.Post("/chat", h.Chat)
			},
			request: func() *http.Request {
				req := httptest.NewRequest(http.MethodPost, "/chat", bytes.NewReader([]byte(`{"agent":"a","namespace":"ns","message":"hi"}`)))
				req.Header.Set("Content-Type", "application/json")
				return req
			}(),
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "viewer cannot call tools",
			userID: viewerID,
			store:  viewerStore,
			register: func(app *fiber.App, h *KagentProxyHandler) {
				app.Post("/tools/call", h.CallTool)
			},
			request: func() *http.Request {
				req := httptest.NewRequest(http.MethodPost, "/tools/call", bytes.NewReader([]byte(`{"agent":"a","namespace":"ns","tool":"tool"}`)))
				req.Header.Set("Content-Type", "application/json")
				return req
			}(),
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "editor can reach chat handler",
			userID: editorID,
			store:  editorStore,
			register: func(app *fiber.App, h *KagentProxyHandler) {
				app.Post("/chat", h.Chat)
			},
			request: func() *http.Request {
				req := httptest.NewRequest(http.MethodPost, "/chat", bytes.NewReader([]byte(`{"agent":"a","namespace":"ns","message":"hi"}`)))
				req.Header.Set("Content-Type", "application/json")
				return req
			}(),
			wantStatus: http.StatusServiceUnavailable,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Use(func(c *fiber.Ctx) error {
				c.Locals("userID", tt.userID)
				return c.Next()
			})
			h := NewKagentProxyHandler(nil, tt.store)
			tt.register(app, h)

			resp, err := app.Test(tt.request)
			assert.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}
