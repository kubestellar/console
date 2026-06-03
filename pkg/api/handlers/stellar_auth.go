package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
)

// requireUser extracts and validates the Stellar user identity from the request.
// Returns the userID or sends a 401 response and returns an empty string.
func (h *StellarHandler) requireUser(c *fiber.Ctx) (string, error) {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "not authenticated")
	}
	return userID, nil
}

func (h *StellarHandler) isCurrentUserAdmin(c *fiber.Ctx) (bool, error) {
	userStore, ok := h.store.(interface {
		GetUser(context.Context, uuid.UUID) (*models.User, error)
	})
	if !ok {
		return false, nil
	}
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return false, nil
	}
	user, err := userStore.GetUser(c.UserContext(), userID)
	if err != nil {
		return false, fiber.NewError(fiber.StatusInternalServerError, "failed to verify user role")
	}
	return user != nil && user.Role == models.UserRoleAdmin, nil
}
