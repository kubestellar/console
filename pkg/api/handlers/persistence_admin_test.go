package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newPersistenceAuthTestApp(t *testing.T, role models.UserRole) *fiber.App {
	t.Helper()

	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: role}, nil).Maybe()

	persistenceStore := store.NewPersistenceStore("")
	handler := NewConsolePersistenceHandlers(persistenceStore, nil, nil, mockStore)
	persistenceStore.SetClusterHealthChecker(func(_ context.Context, _ string) store.ClusterHealth {
		return store.ClusterHealthHealthy
	})

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Get("/api/persistence/config", handler.GetConfig)
	app.Post("/api/persistence/test", handler.TestConnection)

	return app
}

func TestPersistenceEndpointsRequireAdmin(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
	}{
		{
			name:       "GetConfigForbiddenForViewer",
			method:     http.MethodGet,
			path:       "/api/persistence/config",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "TestConnectionForbiddenForViewer",
			method:     http.MethodPost,
			path:       "/api/persistence/test",
			body:       `{"cluster":"test-cluster"}`,
			wantStatus: http.StatusForbidden,
		},
	}

	app := newPersistenceAuthTestApp(t, models.UserRoleViewer)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body *bytes.Reader
			if tt.body == "" {
				body = bytes.NewReader(nil)
			} else {
				body = bytes.NewReader([]byte(tt.body))
			}

			req := httptest.NewRequest(tt.method, tt.path, body)
			if tt.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}

			resp, err := app.Test(req)
			require.NoError(t, err)
			assert.Equal(t, tt.wantStatus, resp.StatusCode)
		})
	}
}

func TestPersistenceEndpointsAllowAdmin(t *testing.T) {
	app := newPersistenceAuthTestApp(t, models.UserRoleAdmin)

	t.Run("GetConfigAllowedForAdmin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/persistence/config", nil)
		resp, err := app.Test(req)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var config store.PersistenceConfig
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&config))
		assert.Equal(t, store.DefaultNamespace, config.Namespace)
	})

	t.Run("TestConnectionAllowedForAdmin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/persistence/test", bytes.NewBufferString(`{"cluster":"test-cluster"}`))
		req.Header.Set("Content-Type", "application/json")

		resp, err := app.Test(req)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)

		var body map[string]any
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
		assert.Equal(t, "test-cluster", body["cluster"])
		assert.Contains(t, body, "success")
		assert.Contains(t, body, "health")
	})
}
