package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// CardType represents the type of dashboard card
type CardType string

const (
	CardTypeClusterHealth      CardType = "cluster_health"
	CardTypeAppStatus          CardType = "app_status"
	CardTypeEventStream        CardType = "event_stream"
	CardTypeDeploymentProgress CardType = "deployment_progress"
	CardTypePodIssues          CardType = "pod_issues"
	CardTypeDeploymentIssues   CardType = "deployment_issues"
	CardTypeTopPods            CardType = "top_pods"
	CardTypeResourceCapacity   CardType = "resource_capacity"
	CardTypeGitOpsDrift        CardType = "gitops_drift"
	CardTypeSecurityIssues     CardType = "security_issues"
	CardTypeRBACOverview       CardType = "rbac_overview"
	CardTypePolicyViolations   CardType = "policy_violations"
	CardTypeUpgradeStatus      CardType = "upgrade_status"
	CardTypeNamespaceAnalysis  CardType = "namespace_analysis"
)

// CardPosition represents the position and size of a card in the grid
type CardPosition struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// Card represents a dashboard card
type Card struct {
	ID          uuid.UUID       `json:"id"`
	DashboardID uuid.UUID       `json:"dashboard_id"`
	CardType    CardType        `json:"card_type"`
	Config      json.RawMessage `json:"config,omitempty"`
	Position    CardPosition    `json:"position"`
	LastSummary string          `json:"last_summary,omitempty"`
	LastFocus   *time.Time      `json:"last_focus,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// CardHistory stores swapped-out cards for reference
type CardHistory struct {
	ID             uuid.UUID       `json:"id"`
	UserID         uuid.UUID       `json:"user_id"`
	OriginalCardID *uuid.UUID      `json:"original_card_id,omitempty"`
	CardType       CardType        `json:"card_type"`
	Config         json.RawMessage `json:"config,omitempty"`
	SwappedOutAt   time.Time       `json:"swapped_out_at"`
	Reason         string          `json:"reason,omitempty"`
}

// PendingSwap represents a scheduled card swap
type PendingSwap struct {
	ID            uuid.UUID       `json:"id"`
	UserID        uuid.UUID       `json:"user_id"`
	CardID        uuid.UUID       `json:"card_id"`
	NewCardType   CardType        `json:"new_card_type"`
	NewCardConfig json.RawMessage `json:"new_card_config,omitempty"`
	Reason        string          `json:"reason,omitempty"`
	SwapAt        time.Time       `json:"swap_at"`
	Status        SwapStatus      `json:"status"`
	CreatedAt     time.Time       `json:"created_at"`
}

// SwapStatus represents the status of a pending swap
type SwapStatus string

const (
	SwapStatusPending   SwapStatus = "pending"
	SwapStatusSnoozed   SwapStatus = "snoozed"
	SwapStatusCompleted SwapStatus = "completed"
	SwapStatusCancelled SwapStatus = "cancelled"
)

// UserEvent tracks user behavior for Claude analysis
type UserEvent struct {
	ID        uuid.UUID       `json:"id"`
	UserID    uuid.UUID       `json:"user_id"`
	EventType EventType       `json:"event_type"`
	CardID    *uuid.UUID      `json:"card_id,omitempty"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// EventType represents the type of user event
type EventType string

const (
	EventTypeCardFocus  EventType = "card_focus"
	EventTypeCardExpand EventType = "card_expand"
	EventTypeCardAction EventType = "card_action"
	EventTypeCardHover  EventType = "card_hover"
	EventTypePageView   EventType = "page_view"
)

// CardTypeInfo provides metadata about a card type
type CardTypeInfo struct {
	Type        CardType `json:"type"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	KlaudeTool  string   `json:"klaude_tool"` // Which klaude tool powers this card
}

// GetCardTypes returns information about all available card types
func GetCardTypes() []CardTypeInfo {
	return []CardTypeInfo{
		{CardTypeClusterHealth, "Cluster Health", "Availability graph per cluster", "heart", "get_cluster_health"},
		{CardTypeAppStatus, "App Status", "Multi-cluster app health", "app-window", "get_app_status"},
		{CardTypeEventStream, "Event Stream", "Live event feed", "activity", "get_events"},
		{CardTypeDeploymentProgress, "Deployment Progress", "Deployment rollout status", "rocket", "get_app_status"},
		{CardTypePodIssues, "Pod Issues", "CrashLoopBackOff, OOMKilled, etc.", "alert-triangle", "find_pod_issues"},
		{CardTypeDeploymentIssues, "Deployment Issues", "Stuck rollouts, unavailable", "alert-circle", "find_deployment_issues"},
		{CardTypeTopPods, "Top Pods", "Top 10 by CPU/memory/restarts", "bar-chart-2", "get_pods"},
		{CardTypeResourceCapacity, "Resource Capacity", "CPU/memory/GPU utilization", "cpu", "list_cluster_capabilities"},
		{CardTypeGitOpsDrift, "GitOps Drift", "Clusters out of sync with git", "git-branch", "detect_drift"},
		{CardTypeSecurityIssues, "Security Issues", "Privileged, root, host network", "shield-alert", "check_security_issues"},
		{CardTypeRBACOverview, "RBAC Overview", "Permission summary", "key", "get_roles"},
		{CardTypePolicyViolations, "Policy Violations", "OPA Gatekeeper violations", "file-warning", "list_ownership_violations"},
		{CardTypeUpgradeStatus, "Upgrade Status", "Cluster upgrade progress", "download", "get_upgrade_status"},
		{CardTypeNamespaceAnalysis, "Namespace Analysis", "Deep dive into namespace", "folder", "analyze_namespace"},
	}
}
