package persistence

import (
	"bytes"
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

// newPersistenceEndpointsTestApp wires every /api/persistence route exactly
// as registrar.go does, so these tests exercise the handlers through the
// same path production traffic takes. Unlike newPersistenceAuthTestApp in
// admin_test.go, this registers the full route set (#23725) so the
// previously-untested list/get/sync/update handlers get coverage too.
func newPersistenceEndpointsTestApp(t *testing.T, role models.UserRole) (*fiber.App, *ConsolePersistenceHandlers) {
	t.Helper()

	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{ID: userID, Role: role}, nil).Maybe()

	persistenceStore := store.NewPersistenceStore("")
	handler := NewConsolePersistenceHandlers(persistenceStore, nil, nil, mockStore)

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Put("/api/persistence/config", handler.UpdateConfig)
	app.Get("/api/persistence/status", handler.GetStatus)
	app.Post("/api/persistence/sync", handler.SyncNow)
	app.Get("/api/persistence/workloads", handler.ListManagedWorkloads)
	app.Get("/api/persistence/workloads/:name", handler.GetManagedWorkload)
	app.Get("/api/persistence/groups", handler.ListClusterGroups)
	app.Get("/api/persistence/groups/:name", handler.GetClusterGroup)
	app.Get("/api/persistence/deployments", handler.ListWorkloadDeployments)
	app.Get("/api/persistence/deployments/:name", handler.GetWorkloadDeployment)

	return app, handler
}

// ---------- UpdateConfig ----------

func TestUpdateConfig_ForbiddenForViewer(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodPut, "/api/persistence/config", bytes.NewBufferString(`{"enabled":false}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestUpdateConfig_InvalidBody(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleAdmin)

	req := httptest.NewRequest(http.MethodPut, "/api/persistence/config", bytes.NewBufferString(`not-json`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateConfig_DisabledSucceeds(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleAdmin)

	req := httptest.NewRequest(http.MethodPut, "/api/persistence/config", bytes.NewBufferString(`{"enabled":false,"namespace":"custom-ns"}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var cfg store.PersistenceConfig
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&cfg))
	assert.False(t, cfg.Enabled)
	assert.Equal(t, "custom-ns", cfg.Namespace)
}

func TestUpdateConfig_EnabledWithoutClusterLogsButSucceeds(t *testing.T) {
	app, handler := newPersistenceEndpointsTestApp(t, models.UserRoleAdmin)
	// No k8sClient is configured; StartWatcher must fail closed (logged, not
	// fatal) rather than panicking the request (#4749).
	require.Nil(t, handler.k8sClient)

	req := httptest.NewRequest(http.MethodPut, "/api/persistence/config", bytes.NewBufferString(`{"enabled":true,"primaryCluster":"cluster-a"}`))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- GetStatus ----------

func TestGetStatus_ForbiddenForViewer(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/status", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestGetStatus_AllowedForAdmin(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleAdmin)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/status", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- SyncNow ----------

func TestSyncNow_ForbiddenForViewer(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodPost, "/api/persistence/sync", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestSyncNow_NotEnabled(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleAdmin)

	req := httptest.NewRequest(http.MethodPost, "/api/persistence/sync", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestSyncNow_EnabledReturnsNotImplemented(t *testing.T) {
	app, handler := newPersistenceEndpointsTestApp(t, models.UserRoleAdmin)
	require.NoError(t, handler.persistenceStore.UpdateConfig(store.PersistenceConfig{
		Enabled:        true,
		PrimaryCluster: "cluster-a",
		Namespace:      store.DefaultNamespace,
		SyncMode:       "primary-only",
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/persistence/sync", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotImplemented, resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, false, body["synced"])
	assert.Equal(t, "SYNC_NOT_IMPLEMENTED", body["errorCode"])
}

// ---------- List/Get handlers: no active client configured ----------
//
// None of these routes require admin, but all go through
// persistenceStore.GetActiveClient first. With persistence disabled (the
// default from NewPersistenceStore), that call fails and every handler must
// surface it as 503 rather than panicking on a nil client (#16484).

func TestListManagedWorkloads_ServiceUnavailable(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/workloads", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetManagedWorkload_ServiceUnavailable(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/workloads/my-workload", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestListClusterGroups_ServiceUnavailable(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/groups", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetClusterGroup_ServiceUnavailable(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/groups/my-group", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestListWorkloadDeployments_ServiceUnavailable(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/deployments", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}

func TestGetWorkloadDeployment_ServiceUnavailable(t *testing.T) {
	app, _ := newPersistenceEndpointsTestApp(t, models.UserRoleViewer)

	req := httptest.NewRequest(http.MethodGet, "/api/persistence/deployments/my-deployment", nil)
	req.Host = "localhost"

	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
}
