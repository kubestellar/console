package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// DashboardHandler handles dashboard operations
type DashboardHandler struct {
	store store.Store
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(s store.Store) *DashboardHandler {
	return &DashboardHandler{store: s}
}

// ListDashboards returns all dashboards for the current user
func (h *DashboardHandler) ListDashboards(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	dashboards, err := h.store.GetUserDashboards(userID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list dashboards")
	}
	return c.JSON(dashboards)
}

// GetDashboard returns a dashboard with its cards
func (h *DashboardHandler) GetDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	dashboardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid dashboard ID")
	}

	dashboard, err := h.store.GetDashboard(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get dashboard")
	}
	if dashboard == nil {
		return fiber.NewError(fiber.StatusNotFound, "Dashboard not found")
	}
	if dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	// Get cards
	cards, err := h.store.GetDashboardCards(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get cards")
	}

	return c.JSON(models.DashboardWithCards{
		Dashboard: *dashboard,
		Cards:     cards,
	})
}

// CreateDashboard creates a new dashboard
func (h *DashboardHandler) CreateDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var input struct {
		Name      string `json:"name"`
		IsDefault bool   `json:"is_default"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if input.Name == "" {
		input.Name = "New Dashboard"
	}

	dashboard := &models.Dashboard{
		UserID:    userID,
		Name:      input.Name,
		IsDefault: input.IsDefault,
	}

	if err := h.store.CreateDashboard(dashboard); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create dashboard")
	}

	return c.Status(fiber.StatusCreated).JSON(dashboard)
}

// UpdateDashboard updates a dashboard
func (h *DashboardHandler) UpdateDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	dashboardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid dashboard ID")
	}

	dashboard, err := h.store.GetDashboard(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get dashboard")
	}
	if dashboard == nil {
		return fiber.NewError(fiber.StatusNotFound, "Dashboard not found")
	}
	if dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	var input struct {
		Name      *string `json:"name"`
		IsDefault *bool   `json:"is_default"`
	}
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if input.Name != nil {
		dashboard.Name = *input.Name
	}
	if input.IsDefault != nil {
		dashboard.IsDefault = *input.IsDefault
	}

	if err := h.store.UpdateDashboard(dashboard); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update dashboard")
	}

	return c.JSON(dashboard)
}

// DeleteDashboard deletes a dashboard
func (h *DashboardHandler) DeleteDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	dashboardID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid dashboard ID")
	}

	dashboard, err := h.store.GetDashboard(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get dashboard")
	}
	if dashboard == nil {
		return fiber.NewError(fiber.StatusNotFound, "Dashboard not found")
	}
	if dashboard.UserID != userID {
		return fiber.NewError(fiber.StatusForbidden, "Access denied")
	}

	if err := h.store.DeleteDashboard(dashboardID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete dashboard")
	}

	return c.SendStatus(fiber.StatusNoContent)
}
