package stellar

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
)

// requireUser extracts and validates the Stellar user identity from the request.
// Returns the userID or sends a 401 response and returns an empty string.
func (h *Handler) requireUser(c *fiber.Ctx) (string, error) {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "not authenticated")
	}
	return userID, nil
}

type stellarUserReader interface {
	GetUser(context.Context, uuid.UUID) (*models.User, error)
}

func (h *Handler) isAdminUser(c *fiber.Ctx) bool {
	userReader, ok := h.store.(stellarUserReader)
	if !ok {
		return false
	}
	userID := middleware.GetUserID(c)
	if userID == uuid.Nil {
		return false
	}
	user, err := userReader.GetUser(c.UserContext(), userID)
	if err != nil || user == nil {
		return false
	}
	return user.Role == models.UserRoleAdmin
}
