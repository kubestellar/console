package models

import (
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
// by the state-transition graph.
func (s ReservationStatus) CanTransitionTo(target ReservationStatus) bool {
	allowed, ok := allowedTransitions[s]
	if !ok {
		return false
	}
	return allowed[target]
}

// GPUReservation represents a GPU reservation submitted by a user
type GPUReservation struct {
	ID            uuid.UUID         `json:"id"`
	UserID        uuid.UUID         `json:"user_id"`
	UserName      string            `json:"user_name"`
	Title         string            `json:"title"`
	Description   string            `json:"description"`
	Cluster       string            `json:"cluster"`
	Namespace     string            `json:"namespace"`
	GPUCount      int               `json:"gpu_count"`
	GPUType       string            `json:"gpu_type"`
	StartDate     string            `json:"start_date"`
	DurationHours int               `json:"duration_hours"`
	Notes         string            `json:"notes"`
	Status        ReservationStatus `json:"status"`
	QuotaName     string            `json:"quota_name,omitempty"`
	QuotaEnforced bool              `json:"quota_enforced"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     *time.Time        `json:"updated_at,omitempty"`
}

// CreateGPUReservationInput is the input for creating a GPU reservation
type CreateGPUReservationInput struct {
	Title          string `json:"title" validate:"required,min=3,max=200"`
	Description    string `json:"description" validate:"max=2000"`
	Cluster        string `json:"cluster" validate:"required"`
	Namespace      string `json:"namespace" validate:"required"`
	GPUCount       int    `json:"gpu_count" validate:"required,min=1"`
	GPUType        string `json:"gpu_type"`
	StartDate      string `json:"start_date" validate:"required"`
	DurationHours  int    `json:"duration_hours" validate:"min=1"`
	Notes          string `json:"notes" validate:"max=2000"`
	QuotaName      string `json:"quota_name"`
	QuotaEnforced  bool   `json:"quota_enforced"`
	MaxClusterGPUs int    `json:"max_cluster_gpus"`
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

// UpdateGPUReservationInput is the input for updating a GPU reservation
type UpdateGPUReservationInput struct {
	Title          *string            `json:"title,omitempty"`
	Description    *string            `json:"description,omitempty"`
	Cluster        *string            `json:"cluster,omitempty"`
	Namespace      *string            `json:"namespace,omitempty"`
	GPUCount       *int               `json:"gpu_count,omitempty"`
	GPUType        *string            `json:"gpu_type,omitempty"`
	StartDate      *string            `json:"start_date,omitempty"`
	DurationHours  *int               `json:"duration_hours,omitempty"`
	Notes          *string            `json:"notes,omitempty"`
	Status         *ReservationStatus `json:"status,omitempty"`
	QuotaName      *string            `json:"quota_name,omitempty"`
	QuotaEnforced  *bool              `json:"quota_enforced,omitempty"`
	MaxClusterGPUs *int               `json:"max_cluster_gpus,omitempty"`
}
