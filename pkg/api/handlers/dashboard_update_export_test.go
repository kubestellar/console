package handlers

import (
	"context"
	"encoding/json"
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

// dashboardStubStore overrides the dashboard-related MockStore methods (which
// are hardcoded to return nil/zero values) so tests can exercise the
// UpdateDashboard/ExportDashboard success and forbidden branches, which
// require GetDashboard to return a real dashboard.
type dashboardStubStore struct {
	*test.MockStore
	dashboard *models.Dashboard
	cards     []models.Card
	getErr    error
	updateErr error
	cardsErr  error
}

func (s *dashboardStubStore) GetDashboard(ctx context.Context, id uuid.UUID) (*models.Dashboard, error) {
	return s.dashboard, s.getErr
}

func (s *dashboardStubStore) UpdateDashboard(ctx context.Context, dashboard *models.Dashboard) error {
	return s.updateErr
}

func (s *dashboardStubStore) GetDashboardCards(ctx context.Context, dashboardID uuid.UUID) ([]models.Card, error) {
	return s.cards, s.cardsErr
}

func setupDashboardStubTest(userID uuid.UUID, stub *dashboardStubStore) (*fiber.App, *DashboardHandler) {
	stub.MockStore = new(test.MockStore)
	app := fiber.New()
	handler := NewDashboardHandler(stub)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	return app, handler
}

// ---------- UpdateDashboard ----------

func TestUpdateDashboard_InvalidID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupDashboardStubTest(userID, &dashboardStubStore{})
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	req, err := http.NewRequest("PUT", "/api/dashboards/bad-id", strings.NewReader(`{}`))
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateDashboard_NotFound(t *testing.T) {
	userID := uuid.New()
	app, handler := setupDashboardStubTest(userID, &dashboardStubStore{dashboard: nil})
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	dashID := uuid.New()
	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{}`))
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestUpdateDashboard_Forbidden(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{dashboard: &models.Dashboard{ID: dashID, UserID: uuid.New(), Name: "Other"}}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{"name":"New"}`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestUpdateDashboard_InvalidBody(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{dashboard: &models.Dashboard{ID: dashID, UserID: userID, Name: "Mine"}}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{bad json`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateDashboard_EmptyNameRejected(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{dashboard: &models.Dashboard{ID: dashID, UserID: userID, Name: "Mine"}}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{"name":"   "}`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateDashboard_Success(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{dashboard: &models.Dashboard{ID: dashID, UserID: userID, Name: "Old Name", IsDefault: false}}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{"name":"New Name","is_default":true}`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var got models.Dashboard
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&got))
	assert.Equal(t, "New Name", got.Name)
	assert.True(t, got.IsDefault)
}

func TestUpdateDashboard_StoreError(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{
		dashboard: &models.Dashboard{ID: dashID, UserID: userID, Name: "Mine"},
		updateErr: assert.AnError,
	}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{"name":"New Name"}`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestUpdateDashboard_DemoMode(t *testing.T) {
	userID := uuid.New()
	app, handler := setupDashboardStubTest(userID, &dashboardStubStore{})
	app.Put("/api/dashboards/:id", handler.UpdateDashboard)

	dashID := uuid.New()
	req, err := http.NewRequest("PUT", "/api/dashboards/"+dashID.String(), strings.NewReader(`{}`))
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// ---------- ExportDashboard ----------

func TestExportDashboard_InvalidID(t *testing.T) {
	userID := uuid.New()
	app, handler := setupDashboardStubTest(userID, &dashboardStubStore{})
	app.Get("/api/dashboards/:id/export", handler.ExportDashboard)

	req, err := http.NewRequest("GET", "/api/dashboards/bad-id/export", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestExportDashboard_NotFound(t *testing.T) {
	userID := uuid.New()
	app, handler := setupDashboardStubTest(userID, &dashboardStubStore{dashboard: nil})
	app.Get("/api/dashboards/:id/export", handler.ExportDashboard)

	dashID := uuid.New()
	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String()+"/export", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestExportDashboard_Forbidden(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{dashboard: &models.Dashboard{ID: dashID, UserID: uuid.New(), Name: "Other"}}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Get("/api/dashboards/:id/export", handler.ExportDashboard)

	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String()+"/export", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestExportDashboard_CardsError(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{
		dashboard: &models.Dashboard{ID: dashID, UserID: userID, Name: "Mine"},
		cardsErr:  assert.AnError,
	}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Get("/api/dashboards/:id/export", handler.ExportDashboard)

	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String()+"/export", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func TestExportDashboard_Success(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	stub := &dashboardStubStore{
		dashboard: &models.Dashboard{ID: dashID, UserID: userID, Name: "Mine", Layout: []byte(`{"cols":2}`)},
		cards: []models.Card{
			{CardType: "gpu-summary", Config: []byte(`{"foo":"bar"}`), Position: models.CardPosition{X: 0, Y: 0}},
		},
	}
	app, handler := setupDashboardStubTest(userID, stub)
	app.Get("/api/dashboards/:id/export", handler.ExportDashboard)

	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String()+"/export", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var export DashboardExport
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&export))
	assert.Equal(t, "kc-dashboard-v1", export.Format)
	assert.Equal(t, "Mine", export.Name)
	require.Len(t, export.Cards, 1)
	assert.Equal(t, "gpu-summary", export.Cards[0].CardType)
}

func TestExportDashboard_DemoMode(t *testing.T) {
	userID := uuid.New()
	app, handler := setupDashboardStubTest(userID, &dashboardStubStore{})
	app.Get("/api/dashboards/:id/export", handler.ExportDashboard)

	dashID := uuid.New()
	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String()+"/export", nil)
	require.NoError(t, err)
	req.Host = "localhost"
	req.Header.Set("X-Demo-Mode", "true")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var export DashboardExport
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&export))
	assert.Equal(t, "Demo Dashboard", export.Name)
}
