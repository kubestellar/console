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

// setupCardTest creates a Fiber app with a CardHandler backed by a MockStore and Hub.
// A middleware injects the given userID into Fiber locals so middleware.GetUserID works.
func setupCardTest(t *testing.T, userID uuid.UUID) (*fiber.App, *test.MockStore, *CardHandler) {
	app := fiber.New()
	mockStore := new(test.MockStore)

	hub := NewHub()
	go hub.Run()
	t.Cleanup(func() { hub.Close() })

	handler := NewCardHandler(mockStore, hub)

	// Inject userID into context (simulates auth middleware)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})

	return app, mockStore, handler
}

// ---------- GetCardTypes ----------

func TestGetCardTypes_ReturnsNonEmpty(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Get("/api/cards/types", handler.GetCardTypes)

	req, err := http.NewRequest("GET", "/api/cards/types", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	var types []models.CardTypeInfo
	require.NoError(t, json.Unmarshal(body, &types))
	assert.Greater(t, len(types), 0, "Expected at least one card type")
}

// ---------- ListCards ----------

func TestListCards_InvalidDashboardID(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Get("/api/dashboards/:id/cards", handler.ListCards)

	req, err := http.NewRequest("GET", "/api/dashboards/not-a-uuid/cards", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestListCards_DashboardNotFound(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Get("/api/dashboards/:id/cards", handler.ListCards)

	// MockStore.GetDashboard returns nil — triggers "Access denied" (nil dashboard check)
	dashID := uuid.New()
	req, err := http.NewRequest("GET", "/api/dashboards/"+dashID.String()+"/cards", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// ---------- CreateCard ----------

func TestCreateCard_InvalidDashboardID(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Post("/api/dashboards/:id/cards", handler.CreateCard)

	body := `{"card_type":"cluster_health","position":{"x":0,"y":0,"w":4,"h":3}}`
	req, err := http.NewRequest("POST", "/api/dashboards/bad-id/cards", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- UpdateCard ----------

func TestUpdateCard_InvalidCardID(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Put("/api/cards/:id", handler.UpdateCard)

	body := `{"position":{"x":1,"y":1,"w":4,"h":3}}`
	req, err := http.NewRequest("PUT", "/api/cards/bad-id", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestUpdateCard_NotFound(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Put("/api/cards/:id", handler.UpdateCard)

	// MockStore.GetCard returns nil — triggers "Card not found"
	cardID := uuid.New()
	body := `{"position":{"x":1,"y":1,"w":4,"h":3}}`
	req, err := http.NewRequest("PUT", "/api/cards/"+cardID.String(), strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- DeleteCard ----------

func TestDeleteCard_InvalidID(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Delete("/api/cards/:id", handler.DeleteCard)

	req, err := http.NewRequest("DELETE", "/api/cards/bad-id", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestDeleteCard_NotFound(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Delete("/api/cards/:id", handler.DeleteCard)

	cardID := uuid.New()
	req, err := http.NewRequest("DELETE", "/api/cards/"+cardID.String(), nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

// ---------- RecordFocus ----------

// recordFocusStore wraps MockStore and overrides GetCard / GetDashboard so that
// the RecordFocus handler can reach the BodyParser step without 404 or 403 errors.
type recordFocusStore struct {
	*test.MockStore
	card      *models.Card
	dashboard *models.Dashboard
}

func (s *recordFocusStore) GetCard(id uuid.UUID) (*models.Card, error) {
	return s.card, nil
}

func (s *recordFocusStore) GetDashboard(id uuid.UUID) (*models.Dashboard, error) {
	return s.dashboard, nil
}

func TestRecordFocus_BadBody_Returns400(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	cardID := uuid.New()

	rfs := &recordFocusStore{
		MockStore: new(test.MockStore),
		card: &models.Card{
			ID:          cardID,
			DashboardID: dashID,
		},
		dashboard: &models.Dashboard{
			ID:     dashID,
			UserID: userID,
		},
	}

	app := fiber.New()
	hub := NewHub()
	go hub.Run()
	t.Cleanup(func() { hub.Close() })

	handler := NewCardHandler(rfs, hub)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/api/cards/:id/focus", handler.RecordFocus)

	req, err := http.NewRequest("POST", "/api/cards/"+cardID.String()+"/focus",
		strings.NewReader("{invalid json"))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// ---------- GetHistory ----------

func TestGetHistory_ReturnsOK(t *testing.T) {
	userID := uuid.New()
	app, _, handler := setupCardTest(t, userID)
	app.Get("/api/cards/history", handler.GetHistory)

	req, err := http.NewRequest("GET", "/api/cards/history", nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}
