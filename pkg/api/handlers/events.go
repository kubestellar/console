package handlers

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// maxEventLimit mirrors the store layer's maxSQLLimit to keep the
// response's "limit" field consistent with the rows actually returned.
const maxEventLimit = 1000

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
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid card_id: must be a valid UUID")
		}
		event.CardID = &cardID
	}

	if input.Metadata != nil {
		metadata, err := json.Marshal(input.Metadata)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "failed to marshal event metadata")
		}
		event.Metadata = metadata
	}

	if err := h.store.RecordEvent(c.UserContext(), event); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to record event")
	}

	return c.JSON(fiber.Map{"status": "ok", "id": event.ID})
}

// GetEvents returns recent user events
// GET /api/events
func (h *EventHandler) GetEvents(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	since := 24 * time.Hour
	if s := c.Query("since"); s != "" {
		if d, err := time.ParseDuration(s); err == nil {
			since = d
		}
	}

	limit := 100
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > maxEventLimit {
		limit = maxEventLimit
	}

	offset := 0
	if o := c.Query("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	events, err := h.store.GetRecentEvents(c.UserContext(), userID, since, limit, offset)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to retrieve events")
	}

	return c.JSON(fiber.Map{
		"events": events,
		"limit":  limit,
		"offset": offset,
	})
}
