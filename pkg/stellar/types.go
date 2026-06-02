package stellar

import "time"

// Preferences captures per-user assistant behavior and routing defaults.
// This is the persistence anchor for "sticky assistant" behavior across
// reconnects/restarts.
type Preferences struct {
	UserID          string    `json:"userId"`
	DefaultProvider string    `json:"defaultProvider"`
	ExecutionMode   string    `json:"executionMode"`
	Timezone        string    `json:"timezone"`
	ProactiveMode   bool      `json:"proactiveMode"`
	PinnedClusters  []string  `json:"pinnedClusters"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// Mission stores a user-owned long-running or scheduled assistant task.
type Mission struct {
	ID             string     `json:"id"`
	UserID         string     `json:"userId"`
	Name           string     `json:"name"`
	Goal           string     `json:"goal"`
	Schedule       string     `json:"schedule"`
	TriggerType    string     `json:"triggerType"`
	ProviderPolicy string     `json:"providerPolicy"`
	MemoryScope    string     `json:"memoryScope"`
	Enabled        bool       `json:"enabled"`
	ToolBindings   []string   `json:"toolBindings"`
	LastRunAt      *time.Time `json:"lastRunAt,omitempty"`
	NextRunAt      *time.Time `json:"nextRunAt,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// Execution captures one mission run (manual, scheduled, or event-driven).
type Execution struct {
	ID            string     `json:"id"`
	MissionID     string     `json:"missionId"`
	UserID        string     `json:"userId"`
	TriggerType   string     `json:"triggerType"`
	TriggerData   string     `json:"triggerData"`
	Status        string     `json:"status"`
	RawInput      string     `json:"rawInput,omitempty"`
	EnrichedInput string     `json:"enrichedInput,omitempty"`
	Output        string     `json:"output,omitempty"`
	ActionsTaken  string     `json:"actionsTaken,omitempty"`
	TokensInput   int        `json:"tokensInput"`
	TokensOutput  int        `json:"tokensOutput"`
	Provider      string     `json:"provider,omitempty"`
	Model         string     `json:"model,omitempty"`
	DurationMs    int        `json:"durationMs"`
	StartedAt     time.Time  `json:"startedAt"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
}

// MemoryEntry stores long-term memory for the assistant.
type MemoryEntry struct {
	ID          string     `json:"id"`
	UserID      string     `json:"userId"`
	Cluster     string     `json:"cluster"`
	Namespace   string     `json:"namespace,omitempty"`
	Category    string     `json:"category"`
	Summary     string     `json:"summary"`
	RawContent  string     `json:"rawContent,omitempty"`
	Tags        []string   `json:"tags"`
	Importance  int        `json:"importance"`
	IncidentID  string     `json:"incidentId,omitempty"`
	Embedding   []byte     `json:"-"`
	MissionID   string     `json:"missionId,omitempty"`
	ExecutionID string     `json:"executionId,omitempty"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// Action represents a pending/scheduled cluster action.
type Action struct {
	ID              string     `json:"id"`
	UserID          string     `json:"userId"`
	Description     string     `json:"description"`
	ActionType      string     `json:"actionType"`
	Parameters      string     `json:"parameters"`
	Cluster         string     `json:"cluster"`
	Namespace       string     `json:"namespace,omitempty"`
	ScheduledAt     *time.Time `json:"scheduledAt,omitempty"`
	CronExpr        string     `json:"cronExpr,omitempty"`
	Status          string     `json:"status"`
	StartedAt       *time.Time `json:"startedAt,omitempty"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
	ApprovedBy      string     `json:"approvedBy,omitempty"`
	ApprovedAt      *time.Time `json:"approvedAt,omitempty"`
	RejectedBy      string     `json:"rejectedBy,omitempty"`
	RejectedAt      *time.Time `json:"rejectedAt,omitempty"`
	RejectionReason string     `json:"rejectionReason,omitempty"`
	ExecutedAt      *time.Time `json:"executedAt,omitempty"`
	Outcome         string     `json:"outcome,omitempty"`
	RejectReason    string     `json:"rejectReason,omitempty"`
	RetryCount      int        `json:"retryCount"`
	MaxRetries      int        `json:"maxRetries"`
	AuditLog        string     `json:"auditLog,omitempty"`
	IdempotencyKey  string     `json:"idempotencyKey,omitempty"`
	ConfirmToken    string     `json:"confirmToken,omitempty"`
	CreatedBy       string     `json:"createdBy"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// Notification is an item shown in the persistent Stellar feed.
type Notification struct {
	ID                   string     `json:"id"`
	UserID               string     `json:"userId"`
	Type                 string     `json:"type"`
	Severity             string     `json:"severity"`
	Title                string     `json:"title"`
	Body                 string     `json:"body"`
	Cluster              string     `json:"cluster,omitempty"`
	Namespace            string     `json:"namespace,omitempty"`
	MissionID            string     `json:"missionId,omitempty"`
	ActionID             string     `json:"actionId,omitempty"`
	DedupeKey            string     `json:"dedupeKey,omitempty"`
	Status               string     `json:"status,omitempty"`
	Read                 bool       `json:"read"`
	ReadAt               *time.Time `json:"readAt,omitempty"`
	CreatedAt            time.Time  `json:"createdAt"`
	BatchTimestamp       *time.Time `json:"batchTimestamp,omitempty"`
	UpdatedAt            *time.Time `json:"updatedAt,omitempty"`
	RootCause            string     `json:"rootCause,omitempty"`
	AffectedResource     string     `json:"affectedResource,omitempty"`
	ErrorMessage         string     `json:"errorMessage,omitempty"`
	ResolutionNote       string     `json:"resolutionNote,omitempty"`
	DismissalReason      string     `json:"dismissalReason,omitempty"`
	InvestigationSummary string     `json:"investigationSummary,omitempty"`
	AutoResolutionStatus string     `json:"autoResolutionStatus,omitempty"`
	AutoResolutionDetail string     `json:"autoResolutionDetail,omitempty"`
}

// Task represents durable operator work tracked by Stellar.
type Task struct {
	ID          string     `json:"id"`
	SessionID   string     `json:"sessionId"`
	UserID      string     `json:"userId"`
	Cluster     string     `json:"cluster"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"` // open|in_progress|blocked|done|dismissed
	Priority    int        `json:"priority"`
	Source      string     `json:"source"` // user|stellar|watcher|scheduler
	ParentID    string     `json:"parentId,omitempty"`
	DueAt       *time.Time `json:"dueAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	ContextJSON string     `json:"contextJson"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// Observation is Stellar's internal observation journal entry.
type Observation struct {
	ID          string    `json:"id"`
	Cluster     string    `json:"cluster"`
	Kind        string    `json:"kind"` // noticed|suggested|acted|reminded|escalated
	Summary     string    `json:"summary"`
	Detail      string    `json:"detail"`
	Reasoning   string    `json:"reasoning,omitempty"` // why Stellar flagged this
	RefType     string    `json:"refType,omitempty"`
	RefID       string    `json:"refId,omitempty"`
	ShownToUser bool      `json:"shownToUser"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Watch represents a resource that Stellar is actively monitoring.
type Watch struct {
	ID           string     `json:"id"`
	UserID       string     `json:"userId"`
	Cluster      string     `json:"cluster"`
	Namespace    string     `json:"namespace"`
	ResourceKind string     `json:"resourceKind"`
	ResourceName string     `json:"resourceName"`
	Reason       string     `json:"reason"`
	Status       string     `json:"status"` // active|resolved|dismissed
	LastEventAt  *time.Time `json:"lastEventAt,omitempty"`
	LastChecked  *time.Time `json:"lastChecked,omitempty"`
	LastUpdate   string     `json:"lastUpdate"`
	ResolvedAt   *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// ProviderConfig holds user-specific AI provider configuration.
type ProviderConfig struct {
	ID          string     `json:"id"`
	UserID      string     `json:"userId"`
	Provider    string     `json:"provider"`
	DisplayName string     `json:"displayName"`
	BaseURL     string     `json:"baseUrl"`
	Model       string     `json:"model"`
	APIKeyEnc   []byte     `json:"-"`
	APIKeyMask  string     `json:"apiKeyMask,omitempty"`
	IsDefault   bool       `json:"isDefault"`
	IsActive    bool       `json:"isActive"`
	LastTested  *time.Time `json:"lastTested,omitempty"`
	LastLatency int        `json:"lastLatency"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// Activity is one entry in Stellar's first-person activity log.
// Kinds: "evaluated", "decided_solve", "decided_skip", "auto_fixed",
// "auto_fix_failed", "solve_started", "solve_progress", "solve_resolved",
// "solve_escalated", "solve_exhausted", "approval_superseded", "approval_bumped".
type Activity struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Ts        time.Time `json:"ts"`
	Kind      string    `json:"kind"`
	EventID   string    `json:"eventId,omitempty"`
	SolveID   string    `json:"solveId,omitempty"`
	Cluster   string    `json:"cluster,omitempty"`
	Namespace string    `json:"namespace,omitempty"`
	Workload  string    `json:"workload,omitempty"`
	Title     string    `json:"title"`
	Detail    string    `json:"detail,omitempty"`
	Severity  string    `json:"severity"`
}

// Solve tracks one end-to-end Solve attempt initiated by Stellar.
// Status transitions: running → resolved | resolved_monitored | escalated | exhausted.
// resolved_monitored means action completed but durability validation is pending.
type Solve struct {
	ID           string     `json:"id"`
	EventID      string     `json:"eventId"`
	UserID       string     `json:"userId"`
	Cluster      string     `json:"cluster"`
	Namespace    string     `json:"namespace"`
	Workload     string     `json:"workload"`
	Status       string     `json:"status"`
	ActionsTaken int        `json:"actionsTaken"`
	LimitHit     string     `json:"limitHit,omitempty"`
	Summary      string     `json:"summary"`
	Error        string     `json:"error,omitempty"`
	StartedAt    time.Time  `json:"startedAt"`
	EndedAt      *time.Time `json:"endedAt,omitempty"`
	// NextRecheckAt is set when status is resolved_monitored, scheduling the
	// next durability validation check.
	NextRecheckAt *time.Time `json:"nextRecheckAt,omitempty"`
}

// AuditEntry records security-sensitive Stellar operations.
type AuditEntry struct {
	ID         string    `json:"id"`
	Ts         time.Time `json:"ts"`
	UserID     string    `json:"userId"`
	Action     string    `json:"action"`
	EntityType string    `json:"entityType"`
	EntityID   string    `json:"entityId"`
	Cluster    string    `json:"cluster"`
	Detail     string    `json:"detail"`
}
