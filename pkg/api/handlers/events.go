package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// EventHandler handles user event tracking
type EventHandler struct {
	store store.Store
}

// NewEventHandler creates a new event handler
func NewEventHandler(s store.Store) *EventHandler {
	return &EventHandler{store: s}
}

// RecordEvent records a user event
func (h *EventHandler) RecordEvent(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var input struct {
		EventType string         `json:"event_type"`
		CardID    string         `json:"card_id,omitempty"`
		Metadata  map[string]any `json:"metadata,omitempty"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	event := &models.UserEvent{
		UserID:    userID,
		EventType: models.EventType(input.EventType),
	}

	if input.CardID != "" {
		cardID, err := uuid.Parse(input.CardID)
		if err == nil {
			event.CardID = &cardID
		}
	}

	if input.Metadata != nil {
		metadata, _ := json.Marshal(input.Metadata)
		event.Metadata = metadata
	}

	if err := h.store.RecordEvent(event); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to record event")
	}

	return c.JSON(fiber.Map{"status": "ok", "id": event.ID})
}
