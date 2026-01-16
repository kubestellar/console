package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// CardHandler handles card operations
type CardHandler struct {
	store store.Store
	hub   *Hub
}

// NewCardHandler creates a new card handler
func NewCardHandler(s store.Store, hub *Hub) *CardHandler {
	return &CardHandler{store: s, hub: hub}
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
		CardType models.CardType      `json:"card_type"`
		Config   map[string]any       `json:"config"`
		Position models.CardPosition  `json:"position"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	card := &models.Card{
		DashboardID: dashboardID,
		CardType:    input.CardType,
		Position:    input.Position,
	}

	if err := h.store.CreateCard(card); err != nil {
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
		Position *models.CardPosition `json:"position"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if input.CardType != nil {
		card.CardType = *input.CardType
	}
	if input.Position != nil {
		card.Position = *input.Position
	}

	if err := h.store.UpdateCard(card); err != nil {
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
	c.BodyParser(&input)

	if err := h.store.UpdateCardFocus(cardID, input.Summary); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update focus")
	}

	// Also record as event
	event := &models.UserEvent{
		UserID:    userID,
		EventType: models.EventTypeCardFocus,
		CardID:    &cardID,
	}
	h.store.RecordEvent(event)

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
	return c.JSON(history)
}
