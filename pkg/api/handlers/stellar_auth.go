package handlers

import "github.com/gofiber/fiber/v2"

// requireUser extracts and validates the Stellar user identity from the request.
// Returns the userID or sends a 401 response and returns an empty string.
func (h *StellarHandler) requireUser(c *fiber.Ctx) (string, error) {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return "", fiber.NewError(fiber.StatusUnauthorized, "not authenticated")
	}
	return userID, nil
}
