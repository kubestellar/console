package handlers

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
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

// requireAdmin verifies the current user has the admin role. It MUST be the
// first call in every settings handler — no configuration, secrets, or
// request body may be loaded until this check passes (#6000). Without this
// invariant, an attacker can trigger side effects (decryption, disk I/O,
// manager lookups) before being told they are forbidden.
func (h *SettingsHandler) requireAdmin(c *fiber.Ctx) error {
	if h.store == nil {
		// No user store configured (dev/demo mode). In this mode settings
		// are not persisted to a real backing store either, so we allow the
		// request through rather than locking the developer out.
		return nil
	}
	currentUserID := middleware.GetUserID(c)
	currentUser, err := h.store.GetUser(currentUserID)
	if err != nil || currentUser == nil || currentUser.Role != models.UserRoleAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Console admin access required")
	}
	return nil
}

// GetSettings returns all settings with sensitive fields decrypted
// GET /api/settings
func (h *SettingsHandler) GetSettings(c *fiber.Ctx) error {
	// RBAC MUST be the very first operation — do not read any settings
	// until the caller has been authorized (#6000).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	all, err := h.manager.GetAll()
	if err != nil {
		slog.Error("[settings] GetAll error", "error", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to load settings",
		})
	}
	return c.JSON(all)
}

// SaveSettings persists all settings, encrypting sensitive fields
// PUT /api/settings
func (h *SettingsHandler) SaveSettings(c *fiber.Ctx) error {
	// RBAC MUST be the very first operation — do not parse the body or
	// touch the settings manager until the caller has been authorized
	// (#6000).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	var all settings.AllSettings
	if err := c.BodyParser(&all); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if err := h.manager.SaveAll(&all); err != nil {
		slog.Error("[settings] SaveAll error", "error", err)
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
	// RBAC MUST be the very first operation — the encrypted export
	// contains secrets and must never be produced for unauthorized callers
	// (#6000).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	data, err := h.manager.ExportEncrypted()
	if err != nil {
		slog.Error("[settings] Export error", "error", err)
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
	// RBAC MUST be the very first operation — do not read the request
	// body or hand it to the settings manager until the caller has been
	// authorized (#6000).
	if err := h.requireAdmin(c); err != nil {
		return err
	}

	body := c.Body()
	if len(body) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Empty request body",
		})
	}

	if err := h.manager.ImportEncrypted(body); err != nil {
		slog.Error("[settings] Import error", "error", err)
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
