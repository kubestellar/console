package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// bulkUtilizationsMaxIDs caps the number of reservation ids a single
// GetBulkUtilizations API request may ask for. This is a DoS guard at the
// handler level; the store now batches IN clauses internally (#6888).
const bulkUtilizationsMaxIDs = 500

// maxSnapshotQueryLimit caps the ?limit query parameter for utilization
// snapshots, preventing requests for billions of rows that exhaust memory (#7023).
const maxSnapshotQueryLimit = 10_000

// maxGPUCountWithoutCapacity is the ceiling on GPUCount when no capacity
// provider is configured. Prevents absurdly large values from being stored
// when there is no cluster to validate against (#6962).
const maxGPUCountWithoutCapacity = 1024

// minDurationHours is the minimum acceptable DurationHours for a reservation.
const minDurationHours = 1

// ClusterCapacityProvider returns the total GPU capacity for a cluster
// by querying authoritative server-side data (e.g. k8s node resources).
// Returns 0 if the cluster has no GPUs or cannot be reached.
type ClusterCapacityProvider func(ctx context.Context, cluster string) int

// provisionTimeoutSeconds is the k8s provisioning deadline for namespace + quota
// creation during synchronous reservation flow.
const provisionTimeoutSeconds = 30

// reservationNSLabel tags namespaces created by the GPU reservation system.
const reservationNSLabel = "kubestellar.io/gpu-reservation"

type gpuProvisioningClient interface {
	CreateNamespace(ctx context.Context, contextName, name string, labels map[string]string) (*models.NamespaceDetails, error)
	CreateOrUpdateResourceQuota(ctx context.Context, contextName string, spec k8s.ResourceQuotaSpec) (*k8s.ResourceQuota, error)
	DeleteResourceQuota(ctx context.Context, contextName, namespace, name string) error
}

// GPUHandler handles GPU reservation CRUD operations
type GPUHandler struct {
	store           store.Store
	clusterCapacity ClusterCapacityProvider
	k8sClient       gpuProvisioningClient
}

// NewGPUHandler creates a new GPU handler.
// capacityProvider supplies server-side cluster GPU capacity; if nil,
// over-allocation checks are skipped (safe default for tests).
// k8sClient enables synchronous namespace+quota provisioning; if nil,
// reservations are created with "pending" status (no cluster access).
func NewGPUHandler(s store.Store, capacityProvider ClusterCapacityProvider, k8sClient gpuProvisioningClient) *GPUHandler {
	return &GPUHandler{store: s, clusterCapacity: capacityProvider, k8sClient: k8sClient}
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
	if err := mcpValidateClusterAndNamespace(input.Cluster, input.Namespace); err != nil {
		return err
	}
	if input.GPUCount < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "GPU count must be at least 1")
	}
	if input.GPUCount > maxGPUCountWithoutCapacity {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("GPU count must not exceed %d", maxGPUCountWithoutCapacity))
	}
	if input.DurationHours < minDurationHours {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("Duration must be at least %d hour(s)", minDurationHours))
	}
	if input.StartDate == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Start date is required")
	}
	if _, err := time.Parse(time.RFC3339, input.StartDate); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Start date must be RFC 3339 format (e.g. 2024-01-15T09:00:00Z)")
	}

	// #6612: resolve server-side capacity up front so we can pass it into
	// the atomic CreateGPUReservationWithCapacity call below. The old
	// two-step flow (checkOverAllocation THEN CreateGPUReservation) was
	// TOCTOU-racy: two concurrent requests could both read the same stale
	// reserved total, both pass the check, and both insert — pushing the
	// cluster above its declared capacity. Passing the capacity into a
	// single SQL statement makes the check+insert atomic.
	capacity := 0
	if h.clusterCapacity != nil {
		capacity = h.clusterCapacity(c.Context(), input.Cluster)
	}
	// A pre-check is still useful when capacity > 0 so clients get a
	// descriptive 409 message with available/reserved numbers, but the
	// authoritative decision is made inside the transaction below.
	// Pass the already-resolved capacity so we don't re-fetch it (#6958).
	if err := h.checkOverAllocationWithCapacity(c.Context(), input.Cluster, input.GPUCount, nil, capacity); err != nil {
		return err
	}

	// Get user info for user_name
	user, err := h.store.GetUser(c.UserContext(), userID)
	if err != nil || user == nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get user")
	}

	reservation := &models.GPUReservation{
		ID:            uuid.New(),
		UserID:        userID,
		UserName:      user.GitHubLogin,
		Title:         input.Title,
		Description:   input.Description,
		Cluster:       input.Cluster,
		Namespace:     input.Namespace,
		GPUCount:      input.GPUCount,
		GPUType:       input.GPUType,
		GPUTypes:      input.GPUTypes,
		StartDate:     input.StartDate,
		DurationHours: input.DurationHours,
		Notes:         input.Notes,
		QuotaName:     input.QuotaName,
		QuotaEnforced: input.QuotaEnforced,
	}
	// Reconcile legacy single + new multi fields. NormalizeGPUTypes
	// is idempotent and handles all combinations (legacy-only, multi-only,
	// both, neither) uniformly. Called here so validation and capacity
	// checks see the canonical shape before the store call below.
	reservation.NormalizeGPUTypes()

	// Synchronous provisioning: create namespace + ResourceQuota on the
	// target cluster before persisting the reservation. This eliminates
	// the "pending" state — the caller gets either "active" (provisioned)
	// or an immediate error.
	provisioned := false
	if h.k8sClient != nil {
		if provErr := h.provisionOnCluster(c.Context(), reservation); provErr != nil {
			slog.Error("[gpu] synchronous provisioning failed",
				"cluster", reservation.Cluster,
				"namespace", reservation.Namespace,
				"error", provErr)
			return fiber.NewError(fiber.StatusServiceUnavailable,
				"failed to provision cluster resources")
		}
		reservation.Status = models.ReservationStatusActive
		provisioned = true
	}

	if err := h.store.CreateGPUReservationWithCapacity(c.UserContext(), reservation, capacity); err != nil {
		if provisioned {
			h.cleanupProvisionedResources(c.Context(), reservation)
		}
		if errors.Is(err, store.ErrGPUQuotaExceeded) {
			return fiber.NewError(fiber.StatusConflict,
				"requested GPUs exceed available capacity")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create reservation")
	}

	// #9890: persist audit entry after successful mutation.
	audit.Log(c, audit.ActionCreateGPUReservation, "gpu_reservation", reservation.ID.String(),
		fmt.Sprintf("cluster=%s namespace=%s gpus=%d status=%s", reservation.Cluster, reservation.Namespace, reservation.GPUCount, reservation.Status))

	return c.Status(fiber.StatusCreated).JSON(reservation)
}

// getCallerUser looks up the calling user and returns it. Returns nil + error
// response if the user cannot be resolved.
func (h *GPUHandler) getCallerUser(c *fiber.Ctx) (*models.User, error) {
	userID := middleware.GetUserID(c)
	user, err := h.store.GetUser(c.UserContext(), userID)
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
// All authenticated users see all reservations. ?mine=true filters to caller's own.
func (h *GPUHandler) ListReservations(c *fiber.Ctx) error {
	user, err := h.getCallerUser(c)
	if err != nil {
		return err
	}

	// All authenticated users see all reservations.
	// ?mine=true filter returns only the caller's reservations.
	mine := c.Query("mine") == "true"
	if mine {
		reservations, err := h.store.ListUserGPUReservations(c.UserContext(), user.ID)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to list reservations")
		}
		if reservations == nil {
			reservations = []models.GPUReservation{}
		}
		return c.JSON(reservations)
	}

	reservations, err := h.store.ListGPUReservations(c.UserContext())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to list reservations")
	}
	if reservations == nil {
		reservations = []models.GPUReservation{}
	}
	return c.JSON(reservations)
}

// GetReservation gets a single GPU reservation by ID.
// All authenticated users may view any reservation.
func (h *GPUHandler) GetReservation(c *fiber.Ctx) error {
	if _, uerr := h.getCallerUser(c); uerr != nil {
		return uerr
	}

	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid reservation ID")
	}

	reservation, err := h.store.GetGPUReservation(c.UserContext(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if reservation == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
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

	existing, err := h.store.GetGPUReservation(c.UserContext(), id)
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

	// Apply partial updates with validation (#6959, #6960, #6962)
	if input.Title != nil {
		if strings.TrimSpace(*input.Title) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Title must not be empty")
		}
		existing.Title = *input.Title
	}
	if input.Description != nil {
		existing.Description = *input.Description
	}
	if input.Cluster != nil {
		if strings.TrimSpace(*input.Cluster) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Cluster must not be empty")
		}
		existing.Cluster = *input.Cluster
	}
	if input.Namespace != nil {
		if strings.TrimSpace(*input.Namespace) == "" {
			return fiber.NewError(fiber.StatusBadRequest, "Namespace must not be empty")
		}
		existing.Namespace = *input.Namespace
	}
	if input.GPUCount != nil {
		if *input.GPUCount < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "GPU count must be at least 1")
		}
		if *input.GPUCount > maxGPUCountWithoutCapacity {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("GPU count must not exceed %d", maxGPUCountWithoutCapacity))
		}
		existing.GPUCount = *input.GPUCount
	}
	if input.GPUType != nil {
		existing.GPUType = *input.GPUType
		// Legacy singular write clears any previously-stored multi list
		// so the two fields cannot drift out of sync. If the caller
		// also sent GPUTypes, the block below re-overwrites with the
		// authoritative list.
		existing.GPUTypes = nil
	}
	if input.GPUTypes != nil {
		// Copy-by-value so later caller mutations of the input
		// slice cannot retroactively change the stored reservation.
		copied := make([]string, len(*input.GPUTypes))
		copy(copied, *input.GPUTypes)
		existing.GPUTypes = copied
	}
	// Normalize after any type-related write so GPUType and GPUTypes
	// stay in lock-step before the store call.
	existing.NormalizeGPUTypes()
	if input.StartDate != nil {
		if _, err := time.Parse(time.RFC3339, *input.StartDate); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Start date must be RFC 3339 format (e.g. 2024-01-15T09:00:00Z)")
		}
		existing.StartDate = *input.StartDate
	}
	if input.DurationHours != nil {
		if *input.DurationHours < minDurationHours {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("Duration must be at least %d hour(s)", minDurationHours))
		}
		existing.DurationHours = *input.DurationHours
	}
	if input.Notes != nil {
		existing.Notes = *input.Notes
	}
	if input.Status != nil {
		newStatus := *input.Status
		if !newStatus.IsValid() {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("Invalid status %q; must be one of: pending, active, completed, cancelled", newStatus))
		}
		if !existing.Status.CanTransitionTo(newStatus) {
			return fiber.NewError(fiber.StatusBadRequest,
				fmt.Sprintf("Cannot transition from %q to %q", existing.Status, newStatus))
		}
		existing.Status = newStatus
	}
	if input.QuotaName != nil {
		existing.QuotaName = *input.QuotaName
	}
	if input.QuotaEnforced != nil {
		existing.QuotaEnforced = *input.QuotaEnforced
	}

	// Re-validate capacity whenever the cluster, GPU count, or status changes —
	// not just when GPUCount is provided (#5423). Uses atomic
	// UpdateGPUReservationWithCapacity to eliminate the TOCTOU race (#6957).
	clusterChanged := input.Cluster != nil
	countChanged := input.GPUCount != nil
	statusChanged := input.Status != nil
	if clusterChanged || countChanged || statusChanged {
		capacity := 0
		if h.clusterCapacity != nil {
			capacity = h.clusterCapacity(c.Context(), existing.Cluster)
		}
		// Descriptive pre-check for a nicer error message.
		if err := h.checkOverAllocationWithCapacity(c.Context(), existing.Cluster, existing.GPUCount, &existing.ID, capacity); err != nil {
			return err
		}
		// Atomic capacity-checked update (#6957).
		if err := h.store.UpdateGPUReservationWithCapacity(c.UserContext(), existing, capacity); err != nil {
			if errors.Is(err, store.ErrGPUReservationNotFound) {
				return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
			}
			if errors.Is(err, store.ErrGPUQuotaExceeded) {
				return fiber.NewError(fiber.StatusConflict,
					"requested GPUs exceed available capacity")
			}
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to update reservation")
		}
		// #9890: persist audit entry after successful mutation.
		audit.Log(c, audit.ActionUpdateGPUReservation, "gpu_reservation", existing.ID.String(),
			fmt.Sprintf("cluster=%s namespace=%s gpus=%d status=%s", existing.Cluster, existing.Namespace, existing.GPUCount, existing.Status))
		return c.JSON(existing)
	}

	if err := h.store.UpdateGPUReservation(c.UserContext(), existing); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to update reservation")
	}

	// #9890: persist audit entry after successful mutation.
	audit.Log(c, audit.ActionUpdateGPUReservation, "gpu_reservation", existing.ID.String(),
		fmt.Sprintf("cluster=%s namespace=%s gpus=%d status=%s", existing.Cluster, existing.Namespace, existing.GPUCount, existing.Status))

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

	existing, err := h.store.GetGPUReservation(c.UserContext(), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if existing == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
	}

	if authErr := requireOwnerOrAdmin(c, user, existing.UserID); authErr != nil {
		return authErr
	}

	if err := h.store.DeleteGPUReservation(c.UserContext(), id); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to delete reservation")
	}

	// #9890: persist audit entry after successful mutation.
	audit.Log(c, audit.ActionDeleteGPUReservation, "gpu_reservation", existing.ID.String(),
		fmt.Sprintf("cluster=%s namespace=%s gpus=%d", existing.Cluster, existing.Namespace, existing.GPUCount))

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
	reservation, err := h.store.GetGPUReservation(c.UserContext(), parsedID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get reservation")
	}
	if reservation == nil {
		return fiber.NewError(fiber.StatusNotFound, "Reservation not found")
	}
	if authErr := requireOwnerOrAdmin(c, user, reservation.UserID); authErr != nil {
		return authErr
	}

	limit := c.QueryInt("limit", store.DefaultSnapshotQueryLimit)
	// Clamp to upper bound to prevent unbounded row requests (#7023).
	if limit <= 0 || limit > maxSnapshotQueryLimit {
		limit = store.DefaultSnapshotQueryLimit
	}
	snapshots, err := h.store.GetUtilizationSnapshots(c.UserContext(), id, limit)
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
	// #6605: reject oversized fan-outs at the API boundary as a DoS
	// guard. The store now batches IN clauses internally (#6888), but
	// we still cap the API to avoid unbounded work.
	if len(ids) > bulkUtilizationsMaxIDs {
		return fiber.NewError(fiber.StatusBadRequest,
			fmt.Sprintf("too many reservation ids: %d (max %d)", len(ids), bulkUtilizationsMaxIDs))
	}
	// Parse and trim all IDs up front.
	parsedIDs := make([]uuid.UUID, 0, len(ids))
	trimmedIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		parsedID, err := uuid.Parse(trimmed)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Invalid reservation ID format")
		}
		parsedIDs = append(parsedIDs, parsedID)
		trimmedIDs = append(trimmedIDs, trimmed)
	}

	// Non-admin: batch-fetch reservations and verify ownership in one query
	// instead of N sequential round-trips (#6963).
	if user.Role != models.UserRoleAdmin {
		reservations, err := h.store.GetGPUReservationsByIDs(c.UserContext(), parsedIDs)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "Failed to verify reservation ownership")
		}
		for _, pid := range parsedIDs {
			reservation, ok := reservations[pid]
			if !ok || reservation == nil {
				return fiber.NewError(fiber.StatusNotFound, fmt.Sprintf("Reservation not found: %s", pid.String()))
			}
			if reservation.UserID != user.ID {
				return fiber.NewError(fiber.StatusForbidden, "Not authorized — owner or admin access required")
			}
		}
	}

	result, err := h.store.GetBulkUtilizationSnapshots(c.UserContext(), trimmedIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to get utilization data")
	}

	return c.JSON(result)
}

// checkOverAllocationWithCapacity verifies that the requested GPU count does
// not exceed the already-resolved cluster capacity. The capacity parameter
// must be fetched once by the caller and reused to avoid inconsistencies from
// multiple fetches (#6958). excludeID is used on updates to exclude the
// current reservation from the "already reserved" tally.
func (h *GPUHandler) checkOverAllocationWithCapacity(ctx context.Context, cluster string, gpuCount int, excludeID *uuid.UUID, capacity int) error {
	if capacity <= 0 {
		// No capacity data — skip the pre-check. The authoritative check
		// is inside the atomic SQL statement.
		return nil
	}

	reserved, err := h.store.GetClusterReservedGPUCount(ctx, cluster, excludeID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to check cluster GPU usage")
	}

	if reserved+gpuCount > capacity {
		return fiber.NewError(fiber.StatusConflict,
			"requested GPUs exceed available capacity")
	}

	return nil
}

// provisionOnCluster creates the namespace (if it doesn't already exist) and a
// ResourceQuota enforcing the GPU limit on the target cluster. This runs
// synchronously during reservation creation so the caller gets an immediate
// success/failure signal instead of a deferred "pending" state.
func (h *GPUHandler) provisionOnCluster(ctx context.Context, r *models.GPUReservation) error {
	provCtx, cancel := context.WithTimeout(ctx, provisionTimeoutSeconds*time.Second)
	defer cancel()

	nsLabels := map[string]string{
		reservationNSLabel:             "true",
		"app.kubernetes.io/managed-by": "kubestellar-console",
	}
	_, err := h.k8sClient.CreateNamespace(provCtx, r.Cluster, r.Namespace, nsLabels)
	if err != nil && !apierrors.IsAlreadyExists(err) {
		return fmt.Errorf("create namespace %q: %w", r.Namespace, err)
	}

	quotaName := r.QuotaName
	if quotaName == "" {
		quotaName = fmt.Sprintf("gpu-reservation-%s", r.Namespace)
	}

	quotaSpec := k8s.ResourceQuotaSpec{
		Name:      quotaName,
		Namespace: r.Namespace,
		Hard: map[string]string{
			"nvidia.com/gpu": fmt.Sprintf("%d", r.GPUCount),
		},
		Labels: map[string]string{
			reservationNSLabel:             "true",
			"app.kubernetes.io/managed-by": "kubestellar-console",
		},
		Annotations: map[string]string{
			"kubestellar.io/reservation-id": r.ID.String(),
			"kubestellar.io/reserved-by":    r.UserName,
		},
	}

	if _, err := h.k8sClient.CreateOrUpdateResourceQuota(provCtx, r.Cluster, quotaSpec); err != nil {
		return fmt.Errorf("create ResourceQuota %q in %q: %w", quotaName, r.Namespace, err)
	}

	r.QuotaName = quotaName
	r.QuotaEnforced = true
	return nil
}

// cleanupProvisionedResources is a best-effort rollback when the DB insert
// fails after k8s resources were already created. Prevents orphaned
// namespaces/quotas when the store rejects the reservation (e.g. TOCTOU
// quota race).
func (h *GPUHandler) cleanupProvisionedResources(ctx context.Context, r *models.GPUReservation) {
	if h.k8sClient == nil {
		return
	}
	cleanupCtx, cancel := context.WithTimeout(ctx, provisionTimeoutSeconds*time.Second)
	defer cancel()

	if r.QuotaName != "" {
		if err := h.k8sClient.DeleteResourceQuota(cleanupCtx, r.Cluster, r.Namespace, r.QuotaName); err != nil {
			slog.Warn("[gpu] cleanup: failed to delete ResourceQuota",
				"cluster", r.Cluster, "namespace", r.Namespace,
				"quota", r.QuotaName, "error", err)
		}
	}
}
