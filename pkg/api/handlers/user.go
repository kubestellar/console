package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	userservice "github.com/kubestellar/console/pkg/services/user"
	"github.com/kubestellar/console/pkg/store"
)

// UserHandler handles user HTTP operations, delegating business logic to the
// user service layer.
type UserHandler struct {
	svc userservice.Service
}

// NewUserHandler creates a new user handler. It accepts a store.Store for
// backward compatibility and instantiates the service internally.
func NewUserHandler(s store.Store) *UserHandler {
	return &UserHandler{svc: userservice.New(s)}
}

// GetCurrentUser returns the current user
func (h *UserHandler) GetCurrentUser(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetByID(c.UserContext(), userID)
	if err != nil {
		if errors.Is(err, userservice.ErrNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "User not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}
	return c.JSON(user)
}

// UpdateCurrentUser updates the current user
func (h *UserHandler) UpdateCurrentUser(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var updates struct {
		Email   string `json:"email"`
		SlackID string `json:"slackId"`
	}
	if err := c.BodyParser(&updates); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	user, err := h.svc.UpdateProfile(c.UserContext(), userID, userservice.UpdateParams{
		Email:   updates.Email,
		SlackID: updates.SlackID,
	})
	if err != nil {
		if errors.Is(err, userservice.ErrNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "User not found")
		}
		if errors.Is(err, userservice.ErrInvalidEmail) {
			return fiber.NewError(fiber.StatusBadRequest, "invalid email format")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update user")
	}

	return c.JSON(user)
}
