package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// MaxCardsPerDashboard is the hard limit on the number of cards a single
// dashboard may contain. The limit prevents runaway client scripts (or a
// compromised session) from exhausting the database by creating unlimited
// cards via the API (#5999).
const MaxCardsPerDashboard = 200

// CardHandler handles card operations
type CardHandler struct {
	store store.Store
	hub   *Hub
}

// NewCardHandler creates a new card handler
func NewCardHandler(s store.Store, hub *Hub) *CardHandler {
	return &CardHandler{store: s, hub: hub}
}

// requireEditorOrAdmin verifies the requesting user has at least the editor
// role. Viewers must not be able to create, update, or delete dashboard cards
// via the API (#5999). If no user store is configured (dev/demo mode) the
// check is skipped.
//
// Error mapping (#6010): a store lookup failure returns 500 — the caller is
// not necessarily unauthorized, the backend is broken. Only a successful
// lookup that returns no user (or a user with insufficient role) yields 403.
func (h *CardHandler) requireEditorOrAdmin(c *fiber.Ctx) error {
	if h.store == nil {
		return nil
	}
	userID := middleware.GetUserID(c)
	user, err := h.store.GetUser(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify user role")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusForbidden, "User not found")
	}
	if user.Role != models.UserRoleAdmin && user.Role != models.UserRoleEditor {
		return fiber.NewError(fiber.StatusForbidden, "Editor or admin role required to modify cards")
	}
	return nil
}

// isValidCardType reports whether the supplied card type is in the set of
// types registered by models.GetCardTypes. Used by both CreateCard and
// UpdateCard (#6010) to reject garbage input before touching the store.
func isValidCardType(t models.CardType) bool {
	if t == "" {
		return false
	}
	for _, known := range models.GetCardTypes() {
		if known.Type == t {
			return true
		}
	}
	return false
}

// ListCards returns all cards for a dashboard
func (h *CardHandler) ListCards(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	dashboardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid dashboard ID")
	}

	// Verify ownership
	dashboard, err := h.store.GetDashboard(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get dashboard")
	}
	if dashboard == nil || dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	cards, err := h.store.GetDashboardCards(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list cards")
	}
	return c.JSON(cards)
}

// CreateCard creates a new card
func (h *CardHandler) CreateCard(c *fiber.Ctx) error {
	// Role check must run before any data access (#5999). Viewers cannot
	// create cards; only editors and admins may.
	if err := h.requireEditorOrAdmin(c); err != nil {
		return err
	}

	userID := middleware.GetUserID(c)
	dashboardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid dashboard ID")
	}

	// Verify ownership
	dashboard, err := h.store.GetDashboard(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get dashboard")
	}
	if dashboard == nil || dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	var input struct {
		CardType models.CardType     `json:"card_type"`
		Config   json.RawMessage     `json:"config"`
		Position models.CardPosition `json:"position"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate card type against the registered set — reject empty or
	// unknown types so the store never sees garbage input (#5999).
	if input.CardType == "" {
		return fiber.NewError(fiber.StatusBadRequest, "card_type is required")
	}
	if !isValidCardType(input.CardType) {
		return fiber.NewError(fiber.StatusBadRequest, "Unknown card_type")
	}

	card := &models.Card{
		DashboardID: dashboardID,
		CardType:    input.CardType,
		Config:      input.Config,
		Position:    input.Position,
	}

	// Enforce the per-dashboard card limit (#5999) and the insert atomically
	// via CreateCardWithLimit to close the TOCTOU race where concurrent
	// creates could both observe count == MaxCardsPerDashboard-1 and both
	// succeed (#6010).
	if err := h.store.CreateCardWithLimit(card, MaxCardsPerDashboard); err != nil {
		if errors.Is(err, store.ErrDashboardCardLimitReached) {
			return fiber.NewError(fiber.StatusTooManyRequests,
				"Dashboard card limit reached")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create card")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "card_created",
		Data: card,
	})

	return c.Status(fiber.StatusCreated).JSON(card)
}

// UpdateCard updates a card
func (h *CardHandler) UpdateCard(c *fiber.Ctx) error {
	// Role check must run before any data access (#5999).
	if err := h.requireEditorOrAdmin(c); err != nil {
		return err
	}
	userID := middleware.GetUserID(c)
	cardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid card ID")
	}

	card, err := h.store.GetCard(cardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get card")
	}
	if card == nil {
		return fiber.NewError(fiber.StatusNotFound, "Card not found")
	}

	// Verify ownership via dashboard
	dashboard, err := h.store.GetDashboard(card.DashboardID)
	if err != nil || dashboard == nil || dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	var input struct {
		CardType *models.CardType     `json:"card_type"`
		Config   *json.RawMessage     `json:"config"`
		Position *models.CardPosition `json:"position"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate card_type if the caller supplied one — reject unknown types
	// so the store never sees garbage input (#6010). Matches the CreateCard
	// validation to prevent viewers or buggy clients from writing bogus
	// types via the update path.
	if input.CardType != nil {
		if !isValidCardType(*input.CardType) {
			return fiber.NewError(fiber.StatusBadRequest, "Unknown card_type")
		}
		card.CardType = *input.CardType
	}
	// Accept config updates — the SQLite UpdateCard already persists
	// card.Config, but the handler previously ignored the field on the
	// wire and only card_type/position would ever be written (#6010).
	if input.Config != nil {
		card.Config = *input.Config
	}
	if input.Position != nil {
		card.Position = *input.Position
	}

	if err := h.store.UpdateCard(card); err != nil {
		// #6610: UpdateCard now returns sql.ErrNoRows when the row was
		// deleted concurrently (or never existed). Surface that as 404
		// so the client re-syncs instead of seeing a spurious 500.
		if errors.Is(err, sql.ErrNoRows) {
			return fiber.NewError(fiber.StatusNotFound, "Card not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update card")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "card_updated",
		Data: card,
	})

	return c.JSON(card)
}

// DeleteCard deletes a card
func (h *CardHandler) DeleteCard(c *fiber.Ctx) error {
	// Role check must run before any data access (#5999).
	if err := h.requireEditorOrAdmin(c); err != nil {
		return err
	}
	userID := middleware.GetUserID(c)
	cardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid card ID")
	}

	card, err := h.store.GetCard(cardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get card")
	}
	if card == nil {
		return fiber.NewError(fiber.StatusNotFound, "Card not found")
	}

	// Verify ownership via dashboard
	dashboard, err := h.store.GetDashboard(card.DashboardID)
	if err != nil || dashboard == nil || dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	if err := h.store.DeleteCard(cardID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete card")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "card_deleted",
		Data: fiber.Map{"id": cardID},
	})

	return c.SendStatus(fiber.StatusNoContent)
}

// RecordFocus records a card focus event
func (h *CardHandler) RecordFocus(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	cardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid card ID")
	}

	card, err := h.store.GetCard(cardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get card")
	}
	if card == nil {
		return fiber.NewError(fiber.StatusNotFound, "Card not found")
	}

	// Verify ownership via dashboard
	dashboard, err := h.store.GetDashboard(card.DashboardID)
	if err != nil || dashboard == nil || dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	var input struct {
		Summary string `json:"summary"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if err := h.store.UpdateCardFocus(cardID, input.Summary); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update focus")
	}

	// Also record as event. Failures here are telemetry-only and must not
	// fail the user request — but log structurally so the failure is visible.
	event := &models.UserEvent{
		UserID:    userID,
		EventType: models.EventTypeCardFocus,
		CardID:    &cardID,
	}
	if err := h.store.RecordEvent(event); err != nil {
		slog.Warn("[cards] failed to record focus event",
			"user", userID, "card", cardID, "error", err)
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// GetCardTypes returns available card types
func (h *CardHandler) GetCardTypes(c *fiber.Ctx) error {
	return c.JSON(models.GetCardTypes())
}

// GetHistory returns the user's card history
func (h *CardHandler) GetHistory(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	limit := 50
	if l := c.QueryInt("limit"); l > 0 && l <= 100 {
		limit = l
	}

	history, err := h.store.GetUserCardHistory(userID, limit)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get history")
	}
	// Never marshal a Go nil slice as JSON null; clients expect [].
	if history == nil {
		history = []models.CardHistory{}
	}
	return c.JSON(history)
}

// MoveCard moves a card to a different dashboard
func (h *CardHandler) MoveCard(c *fiber.Ctx) error {
	// Role check must run before any data access (#5999).
	if err := h.requireEditorOrAdmin(c); err != nil {
		return err
	}
	userID := middleware.GetUserID(c)
	cardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid card ID")
	}

	var input struct {
		TargetDashboardID string `json:"target_dashboard_id"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	targetDashboardID, err := uuid.Parse(input.TargetDashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid target dashboard ID")
	}

	// Get the card
	card, err := h.store.GetCard(cardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get card")
	}
	if card == nil {
		return fiber.NewError(fiber.StatusNotFound, "Card not found")
	}

	// Verify ownership of source dashboard
	sourceDashboard, err := h.store.GetDashboard(card.DashboardID)
	if err != nil || sourceDashboard == nil || sourceDashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied to source dashboard")
	}

	// Verify ownership of target dashboard
	targetDashboard, err := h.store.GetDashboard(targetDashboardID)
	if err != nil || targetDashboard == nil || targetDashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied to target dashboard")
	}

	// Enforce per-dashboard card limit on the TARGET before moving.
	// Without this, a Move can push a dashboard over MaxCardsPerDashboard,
	// bypassing the limit that CreateCardWithLimit enforces on create.
	// Note: if the source and target are the same dashboard this is a no-op
	// from a count perspective, but we still allow it.
	if card.DashboardID != targetDashboardID {
		targetCards, cErr := h.store.GetDashboardCards(targetDashboardID)
		if cErr != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to check target dashboard capacity")
		}
		if len(targetCards) >= MaxCardsPerDashboard {
			return fiber.NewError(
				fiber.StatusBadRequest,
				fmt.Sprintf("Target dashboard already has %d cards (limit %d)", len(targetCards), MaxCardsPerDashboard),
			)
		}
	}

	// Update the card's dashboard ID
	card.DashboardID = targetDashboardID
	if err := h.store.UpdateCard(card); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to move card")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "card_moved",
		Data: fiber.Map{
			"card_id":             cardID,
			"source_dashboard_id": sourceDashboard.ID,
			"target_dashboard_id": targetDashboardID,
		},
	})

	return c.JSON(fiber.Map{
		"status":              "ok",
		"card":                card,
		"source_dashboard_id": sourceDashboard.ID,
		"target_dashboard_id": targetDashboardID,
	})
}
