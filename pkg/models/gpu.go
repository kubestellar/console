package models

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// ReservationStatus represents the status of a GPU reservation
type ReservationStatus string

const (
	ReservationStatusPending   ReservationStatus = "pending"
	ReservationStatusActive    ReservationStatus = "active"
	ReservationStatusCompleted ReservationStatus = "completed"
	ReservationStatusCancelled ReservationStatus = "cancelled"
)

// validStatuses enumerates the allowed reservation status values.
var validStatuses = map[ReservationStatus]bool{
	ReservationStatusPending:   true,
	ReservationStatusActive:    true,
	ReservationStatusCompleted: true,
	ReservationStatusCancelled: true,
}

// allowedTransitions defines the legal state-transition graph for reservation
// status. The key is the current status; the value set contains the statuses
// it may transition to.
var allowedTransitions = map[ReservationStatus]map[ReservationStatus]bool{
	ReservationStatusPending:   {ReservationStatusActive: true, ReservationStatusCancelled: true},
	ReservationStatusActive:    {ReservationStatusCompleted: true, ReservationStatusCancelled: true},
	ReservationStatusCompleted: {}, // terminal
	ReservationStatusCancelled: {}, // terminal
}

// IsValidStatus returns true when s is one of the four recognised statuses.
func (s ReservationStatus) IsValid() bool {
	return validStatuses[s]
}

// CanTransitionTo returns true when transitioning from s to target is allowed
// by the state-transition graph.  Idempotent (same-to-same) transitions are
// always permitted so that harmless retry/refresh calls do not fail (#7361).
func (s ReservationStatus) CanTransitionTo(target ReservationStatus) bool {
	if s == target {
		return true
	}
	allowed, ok := allowedTransitions[s]
	if !ok {
		return false
	}
	return allowed[target]
}

// GPUReservation represents a GPU reservation submitted by a user.
//
// GPUType (singular) is the legacy single-type field kept for
// backwards compatibility with existing rows and external consumers.
// GPUTypes (plural) is the authoritative list of acceptable GPU types for
// a reservation — an empty list means "any GPU is acceptable", a single
// entry behaves exactly like the old single-type reservation, and two
// or more entries implement the multi-type-preference feature
// (Mike Spreitzer).
//
// Serialization & migration rules:
//   - On write, GPUType mirrors GPUTypes[0] (or "" when GPUTypes is empty)
//     so pre-multitype readers still see a meaningful value.
//   - On read from persistent storage, if GPUTypes is empty but GPUType
//     is set, GPUTypes is synthesized as []string{GPUType}. This keeps
//     existing rows usable without a destructive migration.
type GPUReservation struct {
	ID            uuid.UUID         `json:"id"`
	UserID        uuid.UUID         `json:"user_id"`
	UserName      string            `json:"user_name"`
	Title         string            `json:"title"`
	Description   string            `json:"description"`
	Cluster       string            `json:"cluster"`
	Namespace     string            `json:"namespace"`
	GPUCount      int               `json:"gpu_count"`
	GPUType       string            `json:"gpu_type"`  // legacy single-type (mirrors GPUTypes[0]).
	GPUTypes      []string          `json:"gpu_types"` // multi-type: acceptable GPU types.
	StartDate     string            `json:"start_date"`
	DurationHours int               `json:"duration_hours"`
	Notes         string            `json:"notes"`
	Status        ReservationStatus `json:"status"`
	QuotaName     string            `json:"quota_name,omitempty"`
	QuotaEnforced bool              `json:"quota_enforced"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     *time.Time        `json:"updated_at,omitempty"`
}

// NormalizeGPUTypes reconciles the legacy single-type field (GPUType) with
// the multi-type field (GPUTypes) added for gpu-multitype. It is idempotent and
// safe to call on any GPUReservation value regardless of whether the
// caller populated one, both, or neither field:
//
//   - If GPUTypes is non-empty, GPUType is set to GPUTypes[0] so legacy
//     consumers keep working.
//   - If GPUTypes is empty but GPUType is non-empty, GPUTypes is seeded
//     with the single legacy value.
//   - Duplicate and empty-string entries are removed while preserving
//     first-seen order so the "primary" type stays stable.
func (r *GPUReservation) NormalizeGPUTypes() {
	if len(r.GPUTypes) == 0 && r.GPUType != "" {
		r.GPUTypes = []string{r.GPUType}
	}
	if len(r.GPUTypes) == 0 {
		r.GPUType = ""
		return
	}
	seen := make(map[string]bool, len(r.GPUTypes))
	deduped := make([]string, 0, len(r.GPUTypes))
	for _, t := range r.GPUTypes {
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		deduped = append(deduped, t)
	}
	r.GPUTypes = deduped
	if len(r.GPUTypes) > 0 {
		r.GPUType = r.GPUTypes[0]
	} else {
		r.GPUType = ""
	}
}

// MatchesNodeGPUType returns true when a node advertising the given GPU
// type satisfies this reservation's type preference. An empty GPUTypes
// list is treated as "any type is acceptable" — this preserves the
// original single-type behaviour for reservations that never specified
// a type. When GPUTypes is populated, the node type must match at
// least one entry (case-insensitive substring match, mirroring how the
// frontend renders type labels like "NVIDIA A100-SXM4-80GB").
func (r *GPUReservation) MatchesNodeGPUType(nodeGPUType string) bool {
	if len(r.GPUTypes) == 0 {
		return true
	}
	needle := strings.ToLower(nodeGPUType)
	for _, t := range r.GPUTypes {
		if t == "" {
			continue
		}
		hay := strings.ToLower(t)
		if hay == needle || strings.Contains(needle, hay) || strings.Contains(hay, needle) {
			return true
		}
	}
	return false
}

// CreateGPUReservationInput is the input for creating a GPU reservation.
//
// Both GPUType (legacy single) and GPUTypes (multi-type) are accepted
// so existing API clients continue to work unchanged. If both are set,
// GPUTypes takes precedence; if only GPUType is set, it is promoted to
// a one-element GPUTypes. See NormalizeGPUTypes for the canonical
// reconciliation rule.
type CreateGPUReservationInput struct {
	Title          string   `json:"title" validate:"required,min=3,max=200"`
	Description    string   `json:"description" validate:"max=2000"`
	Cluster        string   `json:"cluster" validate:"required"`
	Namespace      string   `json:"namespace" validate:"required"`
	GPUCount       int      `json:"gpu_count" validate:"required,min=1"`
	GPUType        string   `json:"gpu_type"`
	GPUTypes       []string `json:"gpu_types"`
	StartDate      string   `json:"start_date" validate:"required"`
	DurationHours  int      `json:"duration_hours" validate:"min=1"`
	Notes          string   `json:"notes" validate:"max=2000"`
	QuotaName      string   `json:"quota_name"`
	QuotaEnforced  bool     `json:"quota_enforced"`
	MaxClusterGPUs int      `json:"max_cluster_gpus"`
}

// GPUUtilizationSnapshot records a point-in-time GPU usage measurement for a reservation
type GPUUtilizationSnapshot struct {
	ID                   string    `json:"id"`
	ReservationID        string    `json:"reservation_id"`
	Timestamp            time.Time `json:"timestamp"`
	GPUUtilizationPct    float64   `json:"gpu_utilization_pct"`
	MemoryUtilizationPct float64   `json:"memory_utilization_pct"`
	ActiveGPUCount       int       `json:"active_gpu_count"`
	TotalGPUCount        int       `json:"total_gpu_count"`
}

// UpdateGPUReservationInput is the input for updating a GPU reservation.
//
// GPUTypes is a pointer to a slice so the handler can distinguish
// "caller did not send this field" (nil) from "caller explicitly sent
// an empty list meaning any-type" (non-nil but empty). Both GPUType and
// GPUTypes are accepted; when both are supplied, GPUTypes takes
// precedence. See NormalizeGPUTypes.
type UpdateGPUReservationInput struct {
	Title          *string            `json:"title,omitempty"`
	Description    *string            `json:"description,omitempty"`
	Cluster        *string            `json:"cluster,omitempty"`
	Namespace      *string            `json:"namespace,omitempty"`
	GPUCount       *int               `json:"gpu_count,omitempty"`
	GPUType        *string            `json:"gpu_type,omitempty"`
	GPUTypes       *[]string          `json:"gpu_types,omitempty"`
	StartDate      *string            `json:"start_date,omitempty"`
	DurationHours  *int               `json:"duration_hours,omitempty"`
	Notes          *string            `json:"notes,omitempty"`
	Status         *ReservationStatus `json:"status,omitempty"`
	QuotaName      *string            `json:"quota_name,omitempty"`
	QuotaEnforced  *bool              `json:"quota_enforced,omitempty"`
	MaxClusterGPUs *int               `json:"max_cluster_gpus,omitempty"`
}
