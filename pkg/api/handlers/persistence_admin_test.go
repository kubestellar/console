package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

// newRequireAdminTestApp builds a minimal Fiber app that calls RequireAdmin and
// returns 200 on success, forwarding any Fiber error otherwise.
func newRequireAdminTestApp(h *ConsolePersistenceHandlers, userID uuid.UUID) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: func(c *fiber.Ctx, err error) error {
		code := fiber.StatusInternalServerError
		if fe, ok := err.(*fiber.Error); ok {
			code = fe.Code
		}
		return c.Status(code).SendString(err.Error())
	}})
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Get("/test", func(c *fiber.Ctx) error {
		if err := h.RequireAdmin(c); err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})
	return app
}

// TestRequireAdmin_NilStore verifies that when no user store is configured
// (dev/demo mode), RequireAdmin bypasses the role check and allows the request.
func TestRequireAdmin_NilStore(t *testing.T) {
	h := &ConsolePersistenceHandlers{userStore: nil}
	app := newRequireAdminTestApp(h, uuid.New())

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// TestRequireAdmin_StoreError verifies that a database error when loading the
// user returns 500 rather than silently downgrading to a 403.
func TestRequireAdmin_StoreError(t *testing.T) {
	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(nil, errors.New("db connection refused"))

	h := &ConsolePersistenceHandlers{userStore: mockStore}
	app := newRequireAdminTestApp(h, userID)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

// TestRequireAdmin_UserNotFound verifies that a nil user record (no error) is
// treated as a missing/unknown user and returns 403.
func TestRequireAdmin_UserNotFound(t *testing.T) {
	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(nil, nil)

	h := &ConsolePersistenceHandlers{userStore: mockStore}
	app := newRequireAdminTestApp(h, userID)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// TestRequireAdmin_NonAdmin verifies that a non-admin user (e.g. viewer) is
// rejected with 403.
func TestRequireAdmin_NonAdmin(t *testing.T) {
	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleViewer}, nil)

	h := &ConsolePersistenceHandlers{userStore: mockStore}
	app := newRequireAdminTestApp(h, userID)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// TestRequireAdmin_Admin verifies that an admin user passes the role check.
func TestRequireAdmin_Admin(t *testing.T) {
	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: models.UserRoleAdmin}, nil)

	h := &ConsolePersistenceHandlers{userStore: mockStore}
	app := newRequireAdminTestApp(h, userID)

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
