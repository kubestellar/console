package handlers

import (
	"net/mail"
	"regexp"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/store"
)

// emailDomainRegexp requires a domain with at least one dot and a TLD of 2+ chars.
// This complements net/mail.ParseAddress which handles RFC 5322 structure but
// accepts bare domains like "user@localhost".
var emailDomainRegexp = regexp.MustCompile(`^[^@]+@[^@]+\.[a-zA-Z]{2,}$`)

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
		Email   string `json:"email"`
		SlackID string `json:"slackId"`
	}
	if err := c.BodyParser(&updates); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if updates.Email != "" {
		// RFC 5322 structural validation
		if _, err := mail.ParseAddress(updates.Email); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid email format")
		}
		// Require a real domain with a TLD (e.g. "user@example.com", not "user@localhost")
		if !emailDomainRegexp.MatchString(updates.Email) {
			return fiber.NewError(fiber.StatusBadRequest, "invalid email format")
		}
		user.Email = updates.Email
	}
	if updates.SlackID != "" {
		user.SlackID = updates.SlackID
	}

	if err := h.store.UpdateUser(user); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update user")
	}

	return c.JSON(user)
}
