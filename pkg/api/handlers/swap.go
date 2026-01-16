package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// SwapHandler handles card swap operations
type SwapHandler struct {
	store store.Store
	hub   *Hub
}

// NewSwapHandler creates a new swap handler
func NewSwapHandler(s store.Store, hub *Hub) *SwapHandler {
	return &SwapHandler{store: s, hub: hub}
}

// ListPendingSwaps returns pending swaps for the current user
func (h *SwapHandler) ListPendingSwaps(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	swaps, err := h.store.GetUserPendingSwaps(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list swaps")
	}
	return c.JSON(swaps)
}

// SnoozeSwap snoozes a swap for a specified duration
func (h *SwapHandler) SnoozeSwap(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	swapID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid swap ID")
	}

	swap, err := h.store.GetPendingSwap(swapID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get swap")
	}
	if swap == nil {
		return fiber.NewError(fiber.StatusNotFound, "Swap not found")
	}
	if swap.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	var input struct {
		Duration string `json:"duration"` // e.g., "1h", "30m", "1d"
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	duration, err := time.ParseDuration(input.Duration)
	if err != nil {
		// Try parsing as day
		if input.Duration == "1d" {
			duration = 24 * time.Hour
		} else {
			duration = time.Hour // Default to 1 hour
		}
	}

	newSwapAt := time.Now().Add(duration)
	if err := h.store.SnoozeSwap(swapID, newSwapAt); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to snooze swap")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "swap_snoozed",
		Data: fiber.Map{
			"id":      swapID,
			"swap_at": newSwapAt,
		},
	})

	return c.JSON(fiber.Map{
		"status":  "snoozed",
		"swap_at": newSwapAt,
	})
}

// ExecuteSwap executes a swap immediately
func (h *SwapHandler) ExecuteSwap(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	swapID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid swap ID")
	}

	swap, err := h.store.GetPendingSwap(swapID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get swap")
	}
	if swap == nil {
		return fiber.NewError(fiber.StatusNotFound, "Swap not found")
	}
	if swap.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	// Get the original card
	originalCard, err := h.store.GetCard(swap.CardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get card")
	}
	if originalCard == nil {
		return fiber.NewError(fiber.StatusNotFound, "Original card not found")
	}

	// Save to history
	history := &models.CardHistory{
		UserID:         userID,
		OriginalCardID: &originalCard.ID,
		CardType:       originalCard.CardType,
		Config:         originalCard.Config,
		Reason:         swap.Reason,
	}
	if err := h.store.AddCardHistory(history); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to save history")
	}

	// Update the card with new type
	originalCard.CardType = swap.NewCardType
	originalCard.Config = swap.NewCardConfig
	if err := h.store.UpdateCard(originalCard); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update card")
	}

	// Mark swap as completed
	if err := h.store.UpdateSwapStatus(swapID, models.SwapStatusCompleted); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to complete swap")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "swap_executed",
		Data: fiber.Map{
			"swap_id":  swapID,
			"card":     originalCard,
			"history":  history,
		},
	})

	return c.JSON(fiber.Map{
		"status": "executed",
		"card":   originalCard,
	})
}

// CancelSwap cancels a pending swap
func (h *SwapHandler) CancelSwap(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	swapID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid swap ID")
	}

	swap, err := h.store.GetPendingSwap(swapID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get swap")
	}
	if swap == nil {
		return fiber.NewError(fiber.StatusNotFound, "Swap not found")
	}
	if swap.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	if err := h.store.UpdateSwapStatus(swapID, models.SwapStatusCancelled); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to cancel swap")
	}

	// Notify via WebSocket
	h.hub.Broadcast(userID, Message{
		Type: "swap_cancelled",
		Data: fiber.Map{"id": swapID},
	})

	return c.JSON(fiber.Map{"status": "cancelled"})
}
