package handlers

import (
	"fmt"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

// SettingsHandler handles persistent settings API endpoints
type SettingsHandler struct {
	manager *settings.SettingsManager
	store   store.Store
}

// NewSettingsHandler creates a new settings handler
func NewSettingsHandler(manager *settings.SettingsManager, s store.Store) *SettingsHandler {
	return &SettingsHandler{manager: manager, store: s}
}

// GetSettings returns all settings with sensitive fields decrypted
// GET /api/settings
func (h *SettingsHandler) GetSettings(c *fiber.Ctx) error {
	// Settings contain decrypted secrets — require console admin role
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	all, err := h.manager.GetAll()
	if err != nil {
		slog.Error(fmt.Sprintf("[settings] GetAll error: %v", err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to load settings",
		})
	}
	return c.JSON(all)
}

// SaveSettings persists all settings, encrypting sensitive fields
// PUT /api/settings
func (h *SettingsHandler) SaveSettings(c *fiber.Ctx) error {
	// Settings modification requires console admin role
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	var all settings.AllSettings
	if err := c.BodyParser(&all); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if err := h.manager.SaveAll(&all); err != nil {
		slog.Error(fmt.Sprintf("[settings] SaveAll error: %v", err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save settings",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Settings saved",
	})
}

// ExportSettings returns the encrypted settings file for backup
// POST /api/settings/export
func (h *SettingsHandler) ExportSettings(c *fiber.Ctx) error {
	// Settings export contains secrets — require console admin role
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	data, err := h.manager.ExportEncrypted()
	if err != nil {
		slog.Error(fmt.Sprintf("[settings] Export error: %v", err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to export settings",
		})
	}

	c.Set("Content-Type", "application/json")
	c.Set("Content-Disposition", "attachment; filename=kc-settings-backup.json")
	return c.Send(data)
}

// ImportSettings imports a settings backup file
// POST /api/settings/import
func (h *SettingsHandler) ImportSettings(c *fiber.Ctx) error {
	// Settings import can overwrite secrets — require console admin role
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != "admin" {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}

	body := c.Body()
	if len(body) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Empty request body",
		})
	}

	if err := h.manager.ImportEncrypted(body); err != nil {
		slog.Error(fmt.Sprintf("[settings] Import error: %v", err))
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Failed to import settings",
			"message": "invalid settings data",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Settings imported",
	})
}
