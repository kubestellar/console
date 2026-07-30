package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Dashboard represents a user's dashboard configuration
type Dashboard struct {
	ID        uuid.UUID       `json:"id"`
	UserID    uuid.UUID       `json:"user_id"`
	Name      string          `json:"name"`
	Layout    json.RawMessage `json:"layout,omitempty"`
	IsDefault bool            `json:"is_default"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt *time.Time      `json:"updated_at,omitempty"`
}

// DashboardWithCards includes the dashboard and its cards
type DashboardWithCards struct {
	Dashboard
	Cards []Card `json:"cards"`
}
