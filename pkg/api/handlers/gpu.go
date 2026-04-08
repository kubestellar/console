package handlers

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

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
	if _, err := time.Parse(time.RFC3339, input.StartDate); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Start date must be RFC 3339 format (e.g. 2024-01-15T09:00:00Z)")
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

// getCallerUser looks up the calling user and returns it. Returns nil + error
// response if the user cannot be resolved.
func (h *GPUHandler) getCallerUser(c *fiber.Ctx) (*models.User, error) {
	userID := middleware.GetUserID(c)
	user, err := h.store.GetUser(userID)
	if err != nil || user == nil {
		return nil, fiber.NewError(fiber.StatusForbidden, "Unable to verify user")
	}
	return user, nil
}

// requireOwnerOrAdmin returns a 403 error if the caller is neither the
// reservation owner nor an admin.
func requireOwnerOrAdmin(c *fiber.Ctx, user *models.User, reservationOwnerID uuid.UUID) error {
	if user.ID != reservationOwnerID && user.Role != models.UserRoleAdmin {
		slog.Warn("[gpu] SECURITY: unauthorized access attempt",
			"user_id", user.ID,
			"github_login", user.GitHubLogin,
			"reservation_owner", reservationOwnerID)
		return fiber.NewError(fiber.StatusForbidden, "Not authorized — owner or admin access required")
	}
	return nil
}

// ListReservations lists GPU reservations.
// Non-admin users only see their own reservations. Admins see all (#5414).
func (h *GPUHandler) ListReservations(c *fiber.Ctx) error {
	user, err := h.getCallerUser(c)
	if err != nil {
		return err
	}

	// Non-admin users always see only their own reservations
	if user.Role != models.UserRoleAdmin {
		reservations, err := h.store.ListUserGPUReservations(user.ID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to list reservations")
		}
		if reservations == nil {
			reservations = []models.GPUReservation{}
		}
		return c.JSON(reservations)
	}

	// Admins: honour ?mine=true filter, otherwise return all
	mine := c.Query("mine") == "true"
	if mine {
		reservations, err := h.store.ListUserGPUReservations(user.ID)
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

// GetReservation gets a single GPU reservation by ID.
// Only the owner or an admin may read a reservation (#5415).
func (h *GPUHandler) GetReservation(c *fiber.Ctx) error {
	user, uerr := h.getCallerUser(c)
	if uerr != nil {
		return uerr
	}

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

	if authErr := requireOwnerOrAdmin(c, user, reservation.UserID); authErr != nil {
		return authErr
	}

	return c.JSON(reservation)
}

// UpdateReservation updates an existing GPU reservation.
// Only the owner or an admin may modify a reservation (#5416).
func (h *GPUHandler) UpdateReservation(c *fiber.Ctx) error {
	user, uerr := h.getCallerUser(c)
	if uerr != nil {
		return uerr
	}

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

	if authErr := requireOwnerOrAdmin(c, user, existing.UserID); authErr != nil {
		return authErr
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
		if _, err := time.Parse(time.RFC3339, *input.StartDate); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Start date must be RFC 3339 format (e.g. 2024-01-15T09:00:00Z)")
		}
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

// DeleteReservation deletes a GPU reservation.
// Only the owner or an admin may delete a reservation (#5417).
func (h *GPUHandler) DeleteReservation(c *fiber.Ctx) error {
	user, uerr := h.getCallerUser(c)
	if uerr != nil {
		return uerr
	}

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

	if authErr := requireOwnerOrAdmin(c, user, existing.UserID); authErr != nil {
		return authErr
	}

	if err := h.store.DeleteGPUReservation(id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete reservation")
	}

	return c.JSON(fiber.Map{"status": "ok"})
}

// GetReservationUtilization returns utilization snapshots for a single reservation.
// Only the owner or an admin may read utilization data.
func (h *GPUHandler) GetReservationUtilization(c *fiber.Ctx) error {
	user, uerr := h.getCallerUser(c)
	if uerr != nil {
		return uerr
	}

	id := c.Params("id")
	parsedID, err := uuid.Parse(id)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid reservation ID")
	}

	// Verify ownership before returning utilization data
	reservation, err := h.store.GetGPUReservation(parsedID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if reservation == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
	}
	if authErr := requireOwnerOrAdmin(c, user, reservation.UserID); authErr != nil {
		return authErr
	}

	snapshots, err := h.store.GetUtilizationSnapshots(id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get utilization data")
	}
	if snapshots == nil {
		snapshots = []models.GPUUtilizationSnapshot{}
	}

	return c.JSON(snapshots)
}

// GetBulkUtilizations returns utilization snapshots for multiple reservations.
// Non-admin users may only request utilization for their own reservations.
func (h *GPUHandler) GetBulkUtilizations(c *fiber.Ctx) error {
	user, uerr := h.getCallerUser(c)
	if uerr != nil {
		return uerr
	}

	idsParam := c.Query("ids")
	if idsParam == "" {
		return c.JSON(map[string][]models.GPUUtilizationSnapshot{})
	}

	ids := strings.Split(idsParam, ",")
	// Validate all IDs and check ownership for non-admin users
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		parsedID, err := uuid.Parse(trimmed)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("Invalid reservation ID: %s", id))
		}
		// Non-admin: verify each reservation belongs to the caller
		if user.Role != models.UserRoleAdmin {
			reservation, err := h.store.GetGPUReservation(parsedID)
			if err != nil || reservation == nil {
				return fiber.NewError(fiber.StatusNotFound, fmt.Sprintf("Reservation not found: %s", trimmed))
			}
			if reservation.UserID != user.ID {
				return fiber.NewError(fiber.StatusForbidden, "Not authorized — owner or admin access required")
			}
		}
	}

	// Trim spaces
	trimmedIDs := make([]string, len(ids))
	for i, id := range ids {
		trimmedIDs[i] = strings.TrimSpace(id)
	}

	result, err := h.store.GetBulkUtilizationSnapshots(trimmedIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get utilization data")
	}

	return c.JSON(result)
}
