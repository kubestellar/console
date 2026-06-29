package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestGetAuditLog(t *testing.T) {
	t.Run("DemoMode", func(t *testing.T) {
		env := setupTestEnv(t)
		handler := NewAuditHandler(env.Store)
		env.App.Get("/api/audit", handler.GetAuditLog)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		req.Header.Set("X-Demo-Mode", "true")
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var entries []store.AuditEntry
		json.NewDecoder(resp.Body).Decode(&entries)
		assert.Empty(t, entries)
	})

	t.Run("RequiresAdmin", func(t *testing.T) {
		env := setupTestEnv(t)
		handler := NewAuditHandler(env.Store)
		env.App.Get("/api/audit", handler.GetAuditLog)

		env.Store.(*test.MockStore).ExpectedCalls = nil
		env.Store.(*test.MockStore).Calls = nil
		env.Store.(*test.MockStore).On("GetUser", testAdminUserID).Return(&models.User{ID: testAdminUserID, Role: models.UserRoleViewer}, nil)
		env.Store.(*test.MockStore).On("CountUsersByRole").Return(1, 0, 1, nil)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		env.Store.(*test.MockStore).AssertNotCalled(t, "QueryAuditLogs", mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("Success", func(t *testing.T) {
		env := setupTestEnv(t)
		handler := NewAuditHandler(env.Store)
		env.App.Get("/api/audit", handler.GetAuditLog)

		mockEntries := []store.AuditEntry{
			{ID: 1, UserID: "user-1", Action: "test-action"},
		}
		env.Store.(*test.MockStore).On("QueryAuditLogs", 50, "", "").Return(mockEntries, nil)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var entries []store.AuditEntry
		json.NewDecoder(resp.Body).Decode(&entries)
		assert.Len(t, entries, 1)
		assert.Equal(t, "user-1", entries[0].UserID)
	})

	t.Run("WithFilters", func(t *testing.T) {
		env := setupTestEnv(t)
		handler := NewAuditHandler(env.Store)
		env.App.Get("/api/audit", handler.GetAuditLog)

		env.Store.(*test.MockStore).On("QueryAuditLogs", 100, "user-123", "delete").Return([]store.AuditEntry{}, nil)

		req := httptest.NewRequest("GET", "/api/audit?limit=100&user_id=user-123&action=delete", nil)
		req.Host = "localhost"
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		env.Store.(*test.MockStore).AssertExpectations(t)
	})

	t.Run("LimitCapping", func(t *testing.T) {
		env := setupTestEnv(t)
		handler := NewAuditHandler(env.Store)
		env.App.Get("/api/audit", handler.GetAuditLog)

		// Max limit is 200
		env.Store.(*test.MockStore).On("QueryAuditLogs", 200, "", "").Return([]store.AuditEntry{}, nil)

		req := httptest.NewRequest("GET", "/api/audit?limit=500", nil)
		req.Host = "localhost"
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		env.Store.(*test.MockStore).AssertExpectations(t)
	})

	t.Run("StoreError", func(t *testing.T) {
		env := setupTestEnv(t)
		handler := NewAuditHandler(env.Store)
		env.App.Get("/api/audit", handler.GetAuditLog)

		env.Store.(*test.MockStore).On("QueryAuditLogs", mock.Anything, mock.Anything, mock.Anything).Return(nil, assert.AnError)

		req := httptest.NewRequest("GET", "/api/audit", nil)
		req.Host = "localhost"
		resp, _ := env.App.Test(req)

		assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	})
}
