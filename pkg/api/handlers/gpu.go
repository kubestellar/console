package handlers

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// GPUHandler handles GPU reservation CRUD operations
type GPUHandler struct {
	store store.Store
}

// NewGPUHandler creates a new GPU handler
func NewGPUHandler(s store.Store) *GPUHandler {
	return &GPUHandler{store: s}
}

// CreateReservation creates a new GPU reservation
func (h *GPUHandler) CreateReservation(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var input models.CreateGPUReservationInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	if input.Title == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Title is required")
	}
	if input.Cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Cluster is required")
	}
	if input.Namespace == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Namespace is required")
	}
	if input.GPUCount < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "GPU count must be at least 1")
	}
	if input.StartDate == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Start date is required")
	}

	// Check over-allocation: sum of active/pending reservations + this request must not exceed cluster capacity
	if input.MaxClusterGPUs > 0 {
		reserved, err := h.store.GetClusterReservedGPUCount(input.Cluster, nil)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to check cluster GPU usage")
		}
		if reserved+input.GPUCount > input.MaxClusterGPUs {
			available := input.MaxClusterGPUs - reserved
			if available < 0 {
				available = 0
			}
			return fiber.NewError(fiber.StatusConflict,
				fmt.Sprintf("Over-allocation: cluster %q has %d GPUs available (%d reserved of %d total), but %d requested",
					input.Cluster, available, reserved, input.MaxClusterGPUs, input.GPUCount))
		}
	}

	// Get user info for user_name
	user, err := h.store.GetUser(userID)
	if err != nil || user == nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}

	reservation := &models.GPUReservation{
		UserID:        userID,
		UserName:      user.GitHubLogin,
		Title:         input.Title,
		Description:   input.Description,
		Cluster:       input.Cluster,
		Namespace:     input.Namespace,
		GPUCount:      input.GPUCount,
		GPUType:       input.GPUType,
		StartDate:     input.StartDate,
		DurationHours: input.DurationHours,
		Notes:         input.Notes,
		QuotaName:     input.QuotaName,
		QuotaEnforced: input.QuotaEnforced,
	}

	if reservation.DurationHours == 0 {
		reservation.DurationHours = 24
	}

	if err := h.store.CreateGPUReservation(reservation); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create reservation")
	}

	return c.Status(fiber.StatusCreated).JSON(reservation)
}

// ListReservations lists GPU reservations (optionally filtered to current user)
func (h *GPUHandler) ListReservations(c *fiber.Ctx) error {
	mine := c.Query("mine") == "true"

	if mine {
		userID := middleware.GetUserID(c)
		reservations, err := h.store.ListUserGPUReservations(userID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to list reservations")
		}
		if reservations == nil {
			reservations = []models.GPUReservation{}
		}
		return c.JSON(reservations)
	}

	reservations, err := h.store.ListGPUReservations()
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list reservations")
	}
	if reservations == nil {
		reservations = []models.GPUReservation{}
	}
	return c.JSON(reservations)
}

// GetReservation gets a single GPU reservation by ID
func (h *GPUHandler) GetReservation(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid reservation ID")
	}

	reservation, err := h.store.GetGPUReservation(id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if reservation == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
	}

	return c.JSON(reservation)
}

// UpdateReservation updates an existing GPU reservation
func (h *GPUHandler) UpdateReservation(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid reservation ID")
	}

	existing, err := h.store.GetGPUReservation(id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if existing == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
	}

	var input models.UpdateGPUReservationInput
	if err := c.BodyParser(&input); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid request body")
	}

	// Apply partial updates
	if input.Title != nil {
		existing.Title = *input.Title
	}
	if input.Description != nil {
		existing.Description = *input.Description
	}
	if input.Cluster != nil {
		existing.Cluster = *input.Cluster
	}
	if input.Namespace != nil {
		existing.Namespace = *input.Namespace
	}
	if input.GPUCount != nil {
		existing.GPUCount = *input.GPUCount
	}
	if input.GPUType != nil {
		existing.GPUType = *input.GPUType
	}
	if input.StartDate != nil {
		existing.StartDate = *input.StartDate
	}
	if input.DurationHours != nil {
		existing.DurationHours = *input.DurationHours
	}
	if input.Notes != nil {
		existing.Notes = *input.Notes
	}
	if input.Status != nil {
		existing.Status = *input.Status
	}
	if input.QuotaName != nil {
		existing.QuotaName = *input.QuotaName
	}
	if input.QuotaEnforced != nil {
		existing.QuotaEnforced = *input.QuotaEnforced
	}

	// Check over-allocation on update if GPU count changed and capacity is provided
	if input.GPUCount != nil && input.MaxClusterGPUs != nil && *input.MaxClusterGPUs > 0 {
		reserved, err := h.store.GetClusterReservedGPUCount(existing.Cluster, &existing.ID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to check cluster GPU usage")
		}
		if reserved+existing.GPUCount > *input.MaxClusterGPUs {
			available := *input.MaxClusterGPUs - reserved
			if available < 0 {
				available = 0
			}
			return fiber.NewError(fiber.StatusConflict,
				fmt.Sprintf("Over-allocation: cluster %q has %d GPUs available (%d reserved of %d total), but %d requested",
					existing.Cluster, available, reserved, *input.MaxClusterGPUs, existing.GPUCount))
		}
	}

	if err := h.store.UpdateGPUReservation(existing); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update reservation")
	}

	return c.JSON(existing)
}

// DeleteReservation deletes a GPU reservation
func (h *GPUHandler) DeleteReservation(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid reservation ID")
	}

	existing, err := h.store.GetGPUReservation(id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if existing == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
	}

	if err := h.store.DeleteGPUReservation(id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete reservation")
	}

	return c.JSON(fiber.Map{"status": "ok"})
}
