package handlers

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/store"
)

// UserHandler handles user operations
type UserHandler struct {
	store store.Store
}

// NewUserHandler creates a new user handler
func NewUserHandler(s store.Store) *UserHandler {
	return &UserHandler{store: s}
}

// GetCurrentUser returns the current user
func (h *UserHandler) GetCurrentUser(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	user, err := h.store.GetUser(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusNotFound, "User not found")
	}
	return c.JSON(user)
}

// UpdateCurrentUser updates the current user
func (h *UserHandler) UpdateCurrentUser(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	user, err := h.store.GetUser(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}
	if user == nil {
		return fiber.NewError(fiber.StatusNotFound, "User not found")
	}

	// Only allow updating certain fields
	var updates struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&updates); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if updates.Email != "" {
		user.Email = updates.Email
	}

	if err := h.store.UpdateUser(user); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update user")
	}

	return c.JSON(user)
}
