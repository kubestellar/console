package handlers

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/settings"
)

// SettingsHandler handles persistent settings API endpoints
type SettingsHandler struct {
	manager *settings.SettingsManager
}

// NewSettingsHandler creates a new settings handler
func NewSettingsHandler(manager *settings.SettingsManager) *SettingsHandler {
	return &SettingsHandler{manager: manager}
}

// GetSettings returns all settings with sensitive fields decrypted
// GET /api/settings
func (h *SettingsHandler) GetSettings(c *fiber.Ctx) error {
	all, err := h.manager.GetAll()
	if err != nil {
		log.Printf("[settings] GetAll error: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to load settings",
		})
	}
	return c.JSON(all)
}

// SaveSettings persists all settings, encrypting sensitive fields
// PUT /api/settings
func (h *SettingsHandler) SaveSettings(c *fiber.Ctx) error {
	var all settings.AllSettings
	if err := c.BodyParser(&all); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if err := h.manager.SaveAll(&all); err != nil {
		log.Printf("[settings] SaveAll error: %v", err)
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
	data, err := h.manager.ExportEncrypted()
	if err != nil {
		log.Printf("[settings] Export error: %v", err)
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
	body := c.Body()
	if len(body) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Empty request body",
		})
	}

	if err := h.manager.ImportEncrypted(body); err != nil {
		log.Printf("[settings] Import error: %v", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Failed to import settings",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Settings imported",
	})
}
