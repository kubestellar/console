package store

import (
	"time"

	"github.com/kubestellar/console/pkg/stellar"
)

// UserRewards captures the persisted gamification state for a single user
// (issue #6011). Prior to this table the balance lived only in localStorage
// and was lost whenever the browser cache was cleared. user_id is a free-form
// string so both real user UUIDs and the shared "demo-user" dev-mode bucket
// can be used interchangeably.
type UserRewards struct {
	UserID           string
	Coins            int
	Points           int
	Level            int
	BonusPoints      int
	LastDailyBonusAt *time.Time
	UpdatedAt        time.Time
}

// UserTokenUsage captures the persisted per-user token-usage state that
// backs the token budget widget (issue #6020 and follow-up to #6011).
// Prior to this table the totals lived only in localStorage, so clearing
// the browser cache or switching devices lost the running totals and the
// agent-session restart marker.
//
// TotalTokens is the current-day running sum attributed to the user across
// all categories. TokensByCategory breaks the total out per category
// (missions, diagnose, insights, predictions, other) and is stored as
// JSON so new categories can be added without a schema migration.
// LastAgentSessionID is the most recent kc-agent session marker the
// server has observed for this user; a change in this marker on the
// next delta request signals an agent restart and the server treats the
// incoming total as a new baseline instead of accumulating it.
type UserTokenUsage struct {
	UserID             string
	TotalTokens        int64
	TokensByCategory   map[string]int64
	LastAgentSessionID string
	UpdatedAt          time.Time
}

// Stellar domain types — canonical definitions live in pkg/stellar.
// These aliases maintain backwards compatibility for existing code.
type (
	StellarPreferences     = stellar.Preferences
	StellarMission         = stellar.Mission
	StellarExecution       = stellar.Execution
	StellarMemoryEntry     = stellar.MemoryEntry
	StellarAction          = stellar.Action
	StellarNotification    = stellar.Notification
	StellarTask            = stellar.Task
	StellarObservation     = stellar.Observation
	StellarWatch           = stellar.Watch
	StellarProviderConfig  = stellar.ProviderConfig
	StellarActivity        = stellar.Activity
	StellarSolve           = stellar.Solve
	StellarAuditEntry      = stellar.AuditEntry
)

// KBQueryGap represents one row in the kb_query_gaps table.
type KBQueryGap struct {
	Path     string    `json:"path"`
	HitCount int       `json:"hitCount"`
	LastSeen time.Time `json:"lastSeen"`
}

// AuditEntry represents a single row in the audit_log table (#8670 Phase 3).
type AuditEntry struct {
	ID        int64  `json:"id"`
	Timestamp string `json:"timestamp"`
	UserID    string `json:"user_id"`
	Action    string `json:"action"`
	Detail    string `json:"detail,omitempty"`
}

// ClusterEvent represents a single Kubernetes event recorded from a cluster.
type ClusterEvent struct {
	ID                 string `json:"id"`
	ClusterName        string `json:"cluster_name"`
	Namespace          string `json:"namespace"`
	EventType          string `json:"event_type"`
	Reason             string `json:"reason"`
	Message            string `json:"message,omitempty"`
	InvolvedObjectKind string `json:"involved_object_kind,omitempty"`
	InvolvedObjectName string `json:"involved_object_name,omitempty"`
	EventUID           string `json:"event_uid"`
	EventCount         int32  `json:"event_count"`
	FirstSeen          string `json:"first_seen"`
	LastSeen           string `json:"last_seen"`
	RecordedAt         string `json:"recorded_at,omitempty"`
}

// TimelineFilter controls which events QueryTimeline returns.
type TimelineFilter struct {
	Cluster   string
	Namespace string
	Since     string // ISO 8601
	Until     string // ISO 8601
	Kind      string // involved_object_kind
	Limit     int
}
