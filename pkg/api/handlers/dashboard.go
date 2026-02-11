package handlers

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// DashboardExport is the portable format for sharing dashboards
type DashboardExport struct {
	Format       string             `json:"format"`
	Name         string             `json:"name"`
	Description  string             `json:"description,omitempty"`
	ExportedAt   time.Time          `json:"exported_at"`
	ExportedFrom string             `json:"exported_from,omitempty"`
	Layout       json.RawMessage    `json:"layout,omitempty"`
	Cards        []CardExport       `json:"cards"`
}

// CardExport is a portable card definition (no IDs, no dashboard binding)
type CardExport struct {
	CardType string              `json:"card_type"`
	Config   json.RawMessage     `json:"config,omitempty"`
	Position models.CardPosition `json:"position"`
}

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

// ExportDashboard returns a self-contained JSON blob with the dashboard and
// all its cards in a portable format that can be shared or re-imported.
func (h *DashboardHandler) ExportDashboard(c *fiber.Ctx) error {
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

	cards, err := h.store.GetDashboardCards(dashboardID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get cards")
	}

	cardExports := make([]CardExport, len(cards))
	for i, card := range cards {
		cardExports[i] = CardExport{
			CardType: string(card.CardType),
			Config:   card.Config,
			Position: card.Position,
		}
	}

	export := DashboardExport{
		Format:     "kc-dashboard-v1",
		Name:       dashboard.Name,
		ExportedAt: time.Now().UTC(),
		Layout:     dashboard.Layout,
		Cards:      cardExports,
	}

	return c.JSON(export)
}

// ImportDashboard creates a new dashboard from a portable export JSON blob.
func (h *DashboardHandler) ImportDashboard(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var input DashboardExport
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}
	if input.Format != "kc-dashboard-v1" {
		return fiber.NewError(fiber.StatusBadRequest, "Unsupported format: expected kc-dashboard-v1")
	}
	if input.Name == "" {
		input.Name = "Imported Dashboard"
	}

	dashboard := &models.Dashboard{
		UserID: userID,
		Name:   input.Name,
		Layout: input.Layout,
	}
	if err := h.store.CreateDashboard(dashboard); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create dashboard")
	}

	for _, ce := range input.Cards {
		card := &models.Card{
			DashboardID: dashboard.ID,
			CardType:    models.CardType(ce.CardType),
			Config:      ce.Config,
			Position:    ce.Position,
		}
		if err := h.store.CreateCard(card); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to create card")
		}
	}

	// Return the full dashboard with cards
	cards, err := h.store.GetDashboardCards(dashboard.ID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get cards")
	}

	return c.Status(fiber.StatusCreated).JSON(models.DashboardWithCards{
		Dashboard: *dashboard,
		Cards:     cards,
	})
}
