package changecontrol

import "time"

// ChangeType classifies the kind of mutation tracked.
type ChangeType string

const (
	ChangeDeployment  ChangeType = "deployment"
	ChangeConfigMap   ChangeType = "configmap"
	ChangeSecret      ChangeType = "secret"
	ChangeRBAC        ChangeType = "rbac"
	ChangeNetPolicy   ChangeType = "network-policy"
	ChangeHelmRelease ChangeType = "helm-release"
	ChangeCRD         ChangeType = "crd"
	ChangeNamespace   ChangeType = "namespace"
)

// Severity of a policy violation.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityHigh     Severity = "high"
	SeverityMedium   Severity = "medium"
	SeverityLow      Severity = "low"
)

// ApprovalStatus tracks whether a change was properly approved.
type ApprovalStatus string

const (
	ApprovalApproved    ApprovalStatus = "approved"
	ApprovalPending     ApprovalStatus = "pending"
	ApprovalRejected    ApprovalStatus = "rejected"
	ApprovalEmergency   ApprovalStatus = "emergency"
	ApprovalUnapproved  ApprovalStatus = "unapproved"
)

// ChangeRecord represents a single tracked change event.
type ChangeRecord struct {
	ID             string         `json:"id"`
	Timestamp      time.Time      `json:"timestamp"`
	Cluster        string         `json:"cluster"`
	Namespace      string         `json:"namespace"`
	ResourceKind   string         `json:"resource_kind"`
	ResourceName   string         `json:"resource_name"`
	ChangeType     ChangeType     `json:"change_type"`
	Actor          string         `json:"actor"`
	ApprovalStatus ApprovalStatus `json:"approval_status"`
	ApprovedBy     string         `json:"approved_by,omitempty"`
	TicketRef      string         `json:"ticket_ref,omitempty"`
	Description    string         `json:"description"`
	DiffSummary    string         `json:"diff_summary,omitempty"`
	RiskScore      int            `json:"risk_score"`
}

// PolicyViolation flags a change that doesn't comply with change-control policies.
type PolicyViolation struct {
	ID           string    `json:"id"`
	ChangeID     string    `json:"change_id"`
	Policy       string    `json:"policy"`
	Severity     Severity  `json:"severity"`
	Description  string    `json:"description"`
	DetectedAt   time.Time `json:"detected_at"`
	Acknowledged bool      `json:"acknowledged"`
}

// ChangePolicy defines a rule that governs permitted change patterns.
type ChangePolicy struct {
	ID                 string       `json:"id"`
	Name               string       `json:"name"`
	Description        string       `json:"description"`
	Scope              string       `json:"scope"`
	RequiresApproval   bool         `json:"requires_approval"`
	RequiresTicket     bool         `json:"requires_ticket"`
	AllowedWindows     []Window     `json:"allowed_windows,omitempty"`
	BlockedChangeTypes []ChangeType `json:"blocked_change_types,omitempty"`
	Severity           Severity     `json:"severity"`
}

// Window describes a permitted time-of-day range for changes.
type Window struct {
	DayOfWeek string `json:"day_of_week"`
	StartHour int    `json:"start_hour"`
	EndHour   int    `json:"end_hour"`
}

// AuditSummary aggregates change-control metrics.
type AuditSummary struct {
	TotalChanges      int            `json:"total_changes"`
	ApprovedChanges   int            `json:"approved_changes"`
	UnapprovedChanges int            `json:"unapproved_changes"`
	EmergencyChanges  int            `json:"emergency_changes"`
	PolicyViolations  int            `json:"policy_violations"`
	RiskScore         int            `json:"risk_score"`
	ByCluster         map[string]int `json:"by_cluster"`
	ByType            map[string]int `json:"by_type"`
	ByActor           map[string]int `json:"by_actor"`
}
