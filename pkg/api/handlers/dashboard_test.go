package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fiberTestTimeout is the maximum time (ms) Fiber's app.Test waits for a response.
const fiberTestTimeout = 5000

// setupDashboardTest creates a Fiber app with a DashboardHandler backed by a MockStore.
// A middleware injects the given userID into Fiber locals so middleware.GetUserID works.
func setupDashboardTest(userID uuid.UUID) (*fiber.App, *test.MockStore, *DashboardHandler) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	handler := NewDashboardHandler(mockStore)

	// Inject userID into context (simulates auth middleware)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	return app, mockStore, handler
}

// ---------- ListDashboards ----------

func TestListDashboards_Empty(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Get("/api/dashboards", handler.ListDashboards)

	// MockStore.GetUserDashboards returns nil, nil by default — valid empty list
	req, err := http.NewRequest("GET", "/api/dashboards", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- CreateDashboard ----------

func TestCreateDashboard_Success(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Post("/api/dashboards", handler.CreateDashboard)

	body := `{"name":"Test Dashboard","is_default":false}`
	req, err := http.NewRequest("POST", "/api/dashboards", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	respBody, _ := io.ReadAll(resp.Body)
	var dashboard models.Dashboard
	require.NoError(t, json.Unmarshal(respBody, &dashboard))
	assert.Equal(t, "Test Dashboard", dashboard.Name)
}

func TestCreateDashboard_DefaultName(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Post("/api/dashboards", handler.CreateDashboard)

	// Empty name should default to "New Dashboard"
	body := `{}`
	req, err := http.NewRequest("POST", "/api/dashboards", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	respBody, _ := io.ReadAll(resp.Body)
	var dashboard models.Dashboard
	require.NoError(t, json.Unmarshal(respBody, &dashboard))
	assert.Equal(t, "New Dashboard", dashboard.Name)
}

func TestCreateDashboard_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Post("/api/dashboards", handler.CreateDashboard)

	req, err := http.NewRequest("POST", "/api/dashboards", strings.NewReader("not-json"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- GetDashboard ----------

func TestGetDashboard_InvalidID(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Get("/api/dashboards/:id", handler.GetDashboard)

	req, err := http.NewRequest("GET", "/api/dashboards/not-a-uuid", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestGetDashboard_NotFound(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Get("/api/dashboards/:id", handler.GetDashboard)

	// MockStore.GetDashboard returns nil, nil — triggers "not found"
	dashID := uuid.New()
	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String(), nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- DeleteDashboard ----------

func TestDeleteDashboard_InvalidID(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Delete("/api/dashboards/:id", handler.DeleteDashboard)

	req, err := http.NewRequest("DELETE", "/api/dashboards/bad-id", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestDeleteDashboard_NotFound(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Delete("/api/dashboards/:id", handler.DeleteDashboard)

	dashID := uuid.New()
	req, err := http.NewRequest("DELETE", "/api/dashboards/"+dashID.String(), nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- ImportDashboard ----------

func TestImportDashboard_InvalidBody(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Post("/api/dashboards/import", handler.ImportDashboard)

	req, err := http.NewRequest("POST", "/api/dashboards/import", strings.NewReader("not-json"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestImportDashboard_UnsupportedFormat(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Post("/api/dashboards/import", handler.ImportDashboard)

	body := `{"format":"unknown-format","name":"Bad Import","cards":[]}`
	req, err := http.NewRequest("POST", "/api/dashboards/import", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestImportDashboard_Success(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupDashboardTest(userID)
	app.Post("/api/dashboards/import", handler.ImportDashboard)

	body := `{"format":"kc-dashboard-v1","name":"Imported","cards":[]}`
	req, err := http.NewRequest("POST", "/api/dashboards/import", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)

	respBody, _ := io.ReadAll(resp.Body)
	var result models.DashboardWithCards
	require.NoError(t, json.Unmarshal(respBody, &result))
	assert.Equal(t, "Imported", result.Name)
}
