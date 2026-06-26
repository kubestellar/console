package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupCardTest creates a Fiber app with a CardHandler backed by a MockStore and Hub.
// A middleware injects the given userID into Fiber locals so middleware.GetUserID works.
// The default user is registered with admin role so requireEditorOrAdmin (#5999)
// passes. Individual tests that exercise role denial should override the
// expectation before calling the handler.
func setupCardTest(t *testing.T, userID uuid.UUID) (*fiber.App, *test.MockStore, *CardHandler) {
	app := fiber.New()
	mockStore := new(test.MockStore)

	// Default: admin user so role-based checks allow mutations through.
	mockStore.On("GetUser", userID).Return(&models.User{
		ID:   userID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

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
	app, mockStore, handler := setupCardTest(t, userID)
	app.Put("/api/cards/:id", handler.UpdateCard)

	// MockStore.GetCard returns nil — triggers "Card not found"
	cardID := uuid.New()
	mockStore.On("GetCard", cardID).Return(nil, nil)

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
	app, mockStore, handler := setupCardTest(t, userID)
	app.Delete("/api/cards/:id", handler.DeleteCard)

	cardID := uuid.New()
	mockStore.On("GetCard", cardID).Return(nil, nil)

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

func (s *recordFocusStore) GetCard(_ context.Context, id uuid.UUID) (*models.Card, error) {
	return s.card, nil
}

func (s *recordFocusStore) GetDashboard(_ context.Context, id uuid.UUID) (*models.Dashboard, error) {
	return s.dashboard, nil
}

func TestRecordFocus_BadBody_Returns400(t *testing.T) {
	userID := uuid.New()
	dashID := uuid.New()
	cardID := uuid.New()

	mockStore := new(test.MockStore)
	// RecordFocus now runs requireEditorOrAdmin before parsing the body (#7011),
	// which calls store.GetUser. Register an admin user so the role check passes
	// and the handler proceeds to BodyParser, which is what this test exercises.
	mockStore.On("GetUser", userID).Return(&models.User{
		ID:   userID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

	rfs := &recordFocusStore{
		MockStore: mockStore,
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

// ---------- RBAC / limit / type validation (#6010) ----------

// cardMutationStore is a store wrapper that stubs the dashboard/card lookups
// used by the CardHandler mutation handlers so tests can drive the RBAC,
// limit-reached, type-validation, and config-update paths without a real DB.
type cardMutationStore struct {
	*test.MockStore
	dashboard      *models.Dashboard
	dashboardByID  map[uuid.UUID]*models.Dashboard
	dashboardCards map[uuid.UUID][]models.Card
	card           *models.Card
	createErr      error
	createCalled   bool
	lastCreate     *models.Card
	lastMaxCards   int
	updateErr      error
	updateCalled   bool
	lastUpdate     *models.Card
	moveErr        error
	moveCalled     bool
}

func (s *cardMutationStore) GetDashboard(_ context.Context, id uuid.UUID) (*models.Dashboard, error) {
	if s.dashboardByID != nil {
		if d, ok := s.dashboardByID[id]; ok {
			return d, nil
		}
	}
	return s.dashboard, nil
}

func (s *cardMutationStore) GetCard(_ context.Context, id uuid.UUID) (*models.Card, error) {
	return s.card, nil
}

func (s *cardMutationStore) GetDashboardCards(_ context.Context, dashboardID uuid.UUID) ([]models.Card, error) {
	if s.dashboardCards != nil {
		return s.dashboardCards[dashboardID], nil
	}
	return nil, nil
}

func (s *cardMutationStore) CreateCardWithLimit(_ context.Context, card *models.Card, maxCards int) error {
	s.createCalled = true
	s.lastCreate = card
	s.lastMaxCards = maxCards
	return s.createErr
}

func (s *cardMutationStore) UpdateCard(_ context.Context, card *models.Card) error {
	s.updateCalled = true
	s.lastUpdate = card
	return s.updateErr
}

func (s *cardMutationStore) MoveCardWithLimit(_ context.Context, _ uuid.UUID, _ uuid.UUID, _ int) error {
	s.moveCalled = true
	return s.moveErr
}

// newCardMutationApp wires a CardHandler backed by cardMutationStore, with
// the given user role registered via the MockStore. Returns the app, the
// store wrapper, and the user's UUID.
func newCardMutationApp(
	t *testing.T,
	role models.UserRole,
	dashboardID, cardID uuid.UUID,
) (*fiber.App, *cardMutationStore, uuid.UUID) {
	t.Helper()
	userID := uuid.New()

	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{
		ID:   userID,
		Role: role,
	}, nil).Maybe()

	wrapper := &cardMutationStore{
		MockStore: mockStore,
		dashboard: &models.Dashboard{ID: dashboardID, UserID: userID},
		card: &models.Card{
			ID:          cardID,
			DashboardID: dashboardID,
			CardType:    models.CardTypeClusterHealth,
		},
	}

	hub := NewHub()
	go hub.Run()
	t.Cleanup(func() { hub.Close() })

	handler := NewCardHandler(wrapper, hub)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/api/dashboards/:id/cards", handler.CreateCard)
	app.Put("/api/cards/:id", handler.UpdateCard)
	app.Delete("/api/cards/:id", handler.DeleteCard)
	app.Post("/api/cards/:id/move", handler.MoveCard)
	return app, wrapper, userID
}

// TestMoveCard_RejectsWhenTargetAtLimit verifies MoveCard refuses to push a
// card into a dashboard that is already at MaxCardsPerDashboard (#6569).
func TestMoveCard_RejectsWhenTargetAtLimit(t *testing.T) {
	sourceDashID := uuid.New()
	targetDashID := uuid.New()
	cardID := uuid.New()

	userID := uuid.New()
	mockStore := new(test.MockStore)
	mockStore.On("GetUser", userID).Return(&models.User{
		ID:   userID,
		Role: models.UserRoleAdmin,
	}, nil).Maybe()

	// Build a target dashboard already filled to MaxCardsPerDashboard.
	fullCards := make([]models.Card, MaxCardsPerDashboard)
	for i := range fullCards {
		fullCards[i] = models.Card{ID: uuid.New(), DashboardID: targetDashID}
	}

	wrapper := &cardMutationStore{
		MockStore: mockStore,
		dashboardByID: map[uuid.UUID]*models.Dashboard{
			sourceDashID: {ID: sourceDashID, UserID: userID},
			targetDashID: {ID: targetDashID, UserID: userID},
		},
		dashboardCards: map[uuid.UUID][]models.Card{
			targetDashID: fullCards,
		},
		card: &models.Card{
			ID:          cardID,
			DashboardID: sourceDashID,
			CardType:    models.CardTypeClusterHealth,
		},
		moveErr: store.ErrDashboardCardLimitReached,
	}

	hub := NewHub()
	go hub.Run()
	t.Cleanup(func() { hub.Close() })

	handler := NewCardHandler(wrapper, hub)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return c.Next()
	})
	app.Post("/api/cards/:id/move", handler.MoveCard)

	body := `{"target_dashboard_id":"` + targetDashID.String() + `"}`
	req, err := http.NewRequest("POST", "/api/cards/"+cardID.String()+"/move", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.True(t, wrapper.moveCalled, "MoveCardWithLimit must be called")
}

// --- Viewer denial ---

func TestCreateCard_ViewerForbidden(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleViewer, dashID, cardID)

	body := `{"card_type":"cluster_health","position":{"x":0,"y":0,"w":4,"h":3}}`
	req, err := http.NewRequest("POST", "/api/dashboards/"+dashID.String()+"/cards",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.False(t, wrapper.createCalled, "store must not be touched for a forbidden request")
}

func TestUpdateCard_ViewerForbidden(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleViewer, dashID, cardID)

	body := `{"position":{"x":1,"y":1,"w":4,"h":3}}`
	req, err := http.NewRequest("PUT", "/api/cards/"+cardID.String(), strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.False(t, wrapper.updateCalled)
}

func TestDeleteCard_ViewerForbidden(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, _, _ := newCardMutationApp(t, models.UserRoleViewer, dashID, cardID)

	req, err := http.NewRequest("DELETE", "/api/cards/"+cardID.String(), nil)
	require.NoError(t, err)

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

// --- Admin allowed ---

func TestCreateCard_AdminAllowed(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleAdmin, dashID, cardID)

	body := `{"card_type":"cluster_health","config":{"cluster":"prod"},"position":{"x":0,"y":0,"w":4,"h":3}}`
	req, err := http.NewRequest("POST", "/api/dashboards/"+dashID.String()+"/cards",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusCreated, resp.StatusCode)
	assert.True(t, wrapper.createCalled)
	assert.Equal(t, MaxCardsPerDashboard, wrapper.lastMaxCards)
	require.NotNil(t, wrapper.lastCreate)
	assert.Equal(t, models.CardTypeClusterHealth, wrapper.lastCreate.CardType)
	assert.JSONEq(t, `{"cluster":"prod"}`, string(wrapper.lastCreate.Config))
}

func TestUpdateCard_AdminAllowedWithConfig(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleAdmin, dashID, cardID)

	body := `{"card_type":"pod_issues","config":{"ns":"default"},"position":{"x":1,"y":1,"w":4,"h":3}}`
	req, err := http.NewRequest("PUT", "/api/cards/"+cardID.String(), strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	require.NotNil(t, wrapper.lastUpdate)
	assert.Equal(t, models.CardTypePodIssues, wrapper.lastUpdate.CardType)
	assert.JSONEq(t, `{"ns":"default"}`, string(wrapper.lastUpdate.Config))
	assert.Equal(t, 1, wrapper.lastUpdate.Position.X)
}

// --- Per-dashboard card limit (429) ---

func TestCreateCard_LimitReached_Returns429(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleEditor, dashID, cardID)
	wrapper.createErr = store.ErrDashboardCardLimitReached

	body := `{"card_type":"cluster_health","position":{"x":0,"y":0,"w":4,"h":3}}`
	req, err := http.NewRequest("POST", "/api/dashboards/"+dashID.String()+"/cards",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	assert.True(t, wrapper.createCalled)
}

// --- Unknown card_type (400) ---

func TestCreateCard_UnknownCardType_Returns400(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleEditor, dashID, cardID)

	body := `{"card_type":"not_a_real_card","position":{"x":0,"y":0,"w":4,"h":3}}`
	req, err := http.NewRequest("POST", "/api/dashboards/"+dashID.String()+"/cards",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.False(t, wrapper.createCalled, "store must not be reached for invalid card_type")
}

func TestUpdateCard_UnknownCardType_Returns400(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()
	app, wrapper, _ := newCardMutationApp(t, models.UserRoleEditor, dashID, cardID)

	body := `{"card_type":"not_a_real_card"}`
	req, err := http.NewRequest("PUT", "/api/cards/"+cardID.String(), strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.False(t, wrapper.updateCalled, "store must not be reached for invalid card_type")
}

// --- Store error in RBAC check → 500, not 403 ---

// failingUserStore wraps cardMutationStore and returns an error from GetUser
// so we can verify the #6010 fix where store errors map to 500 instead of
// being masked as 403.
type failingUserStore struct {
	*cardMutationStore
}

func (s *failingUserStore) GetUser(_ context.Context, id uuid.UUID) (*models.User, error) {
	return nil, assert.AnError
}

func TestCreateCard_UserStoreError_Returns500(t *testing.T) {
	dashID := uuid.New()
	cardID := uuid.New()

	inner := &cardMutationStore{
		MockStore: new(test.MockStore),
		dashboard: &models.Dashboard{ID: dashID, UserID: uuid.New()},
		card: &models.Card{
			ID:          cardID,
			DashboardID: dashID,
			CardType:    models.CardTypeClusterHealth,
		},
	}
	failing := &failingUserStore{cardMutationStore: inner}

	hub := NewHub()
	go hub.Run()
	t.Cleanup(func() { hub.Close() })

	handler := NewCardHandler(failing, hub)
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uuid.New())
		return c.Next()
	})
	app.Post("/api/dashboards/:id/cards", handler.CreateCard)

	body := `{"card_type":"cluster_health","position":{"x":0,"y":0,"w":4,"h":3}}`
	req, err := http.NewRequest("POST", "/api/dashboards/"+dashID.String()+"/cards",
		strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.False(t, inner.createCalled)
}
