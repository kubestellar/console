package compliance

import (
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
	"github.com/stretchr/testify/mock"
)

// adminUserID is the fixed user ID injected into Fiber locals so
// middleware.GetUserID / auth.RequireAdmin resolve consistently across
// audit-handler test cases below.
var adminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

// newAuditTestApp builds a fresh Fiber app plus a MockStore pre-configured
// with an admin user for adminUserID, mirroring pkg/api/handlers.SetupTestEnv
// but scoped to what the audit-log handler tests need.
func newAuditTestApp(t *testing.T) (*fiber.App, *test.MockStore) {
	t.Helper()

	mockStore := new(test.MockStore)
	mockStore.On("GetUser", adminUserID).Return(&models.User{
		ID:   adminUserID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", adminUserID)
		return c.Next()
	})

	return app, mockStore
}

func TestGetAuditLog(t *testing.T) {
	t.Run("DemoMode", func(t *testing.T) {
		app, mockStore := newAuditTestApp(t)
		handler := NewAuditHandler(mockStore)
		app.Get("/api/audit", handler.GetAuditLog)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "true")
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var entries []store.AuditEntry
		json.NewDecoder(resp.Body).Decode(&entries)
		assert.Empty(t, entries)
	})

	t.Run("RequiresAdmin", func(t *testing.T) {
		app, mockStore := newAuditTestApp(t)
		handler := NewAuditHandler(mockStore)
		app.Get("/api/audit", handler.GetAuditLog)

		mockStore.ExpectedCalls = nil
		mockStore.Calls = nil
		mockStore.On("GetUser", adminUserID).Return(&models.User{ID: adminUserID, Role: models.UserRoleViewer}, nil)
		mockStore.On("CountUsersByRole").Return(1, 0, 1, nil)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		mockStore.AssertNotCalled(t, "QueryAuditLogs", mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("Success", func(t *testing.T) {
		app, mockStore := newAuditTestApp(t)
		handler := NewAuditHandler(mockStore)
		app.Get("/api/audit", handler.GetAuditLog)

		mockEntries := []store.AuditEntry{
			{ID: 1, UserID: "user-1", Action: "test-action"},
		}
		mockStore.On("QueryAuditLogs", 50, "", "").Return(mockEntries, nil)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var entries []store.AuditEntry
		json.NewDecoder(resp.Body).Decode(&entries)
		assert.Len(t, entries, 1)
		assert.Equal(t, "user-1", entries[0].UserID)
	})

	t.Run("WithFilters", func(t *testing.T) {
		app, mockStore := newAuditTestApp(t)
		handler := NewAuditHandler(mockStore)
		app.Get("/api/audit", handler.GetAuditLog)

		mockStore.On("QueryAuditLogs", 100, "user-123", "delete").Return([]store.AuditEntry{}, nil)

		req := httptest.NewRequest("GET", "/api/audit?limit=100&user_id=user-123&action=delete", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})

	t.Run("LimitCapping", func(t *testing.T) {
		app, mockStore := newAuditTestApp(t)
		handler := NewAuditHandler(mockStore)
		app.Get("/api/audit", handler.GetAuditLog)

		// Max limit is 200
		mockStore.On("QueryAuditLogs", 200, "", "").Return([]store.AuditEntry{}, nil)

		req := httptest.NewRequest("GET", "/api/audit?limit=500", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		mockStore.AssertExpectations(t)
	})

	t.Run("StoreError", func(t *testing.T) {
		app, mockStore := newAuditTestApp(t)
		handler := NewAuditHandler(mockStore)
		app.Get("/api/audit", handler.GetAuditLog)

		mockStore.On("QueryAuditLogs", mock.Anything, mock.Anything, mock.Anything).Return(nil, assert.AnError)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	})
}
