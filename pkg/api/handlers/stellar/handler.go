package stellar

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
	"k8s.io/client-go/kubernetes"
)

const (
	stellarDefaultProviderPolicy  = "auto"
	stellarDefaultExecutionMode   = "hybrid"
	stellarDefaultTimezone        = "UTC"
	stellarDefaultMemoryScope     = "user"
	stellarDefaultTriggerType     = "manual"
	stellarDefaultListLimit       = 50
	stellarMaxListLimit           = 200
	stellarMaxNameLength          = 120
	stellarMaxGoalLength          = 5000
	stellarMaxScheduleLength      = 128
	stellarMaxToolsPerMission     = 32
	stellarMaxToolNameLength      = 64
	stellarMaxPromptLength        = 5000
	stellarMaxProviderBaseURLLen  = 2048
	stellarDigestLookbackHours    = 24
	stellarRecentEventLookbackMin = 10
	stellarStreamInterval         = 10 * time.Second
	stellarWatchInactivityTimeout = 30 * time.Minute
	stellarSystemUserID           = "system"

	stellarOllamaAllowedCIDRsEnv = "STELLAR_OLLAMA_ALLOWED_CIDRS"

	providerDNSTimeout = 5 * time.Second
)

var stellarAllowedExecutionModes = map[string]bool{
	"local-only": true,
	"cloud-only": true,
	"hybrid":     true,
}

var stellarAllowedTriggerTypes = map[string]bool{
	"manual":             true,
	"cron":               true,
	"kubernetes-event":   true,
	"prometheus-alert":   true,
	"github-webhook":     true,
	"api":                true,
	"chained-completion": true,
}

type OperationalState struct {
	GeneratedAt      time.Time            `json:"generatedAt"`
	ClustersWatching []string             `json:"clustersWatching"`
	EventCounts      map[string]int       `json:"eventCounts"`
	RecentEvents     []store.ClusterEvent `json:"recentEvents"`
	UnreadAlerts     int                  `json:"unreadAlerts"`
	ActiveMissionIDs []string             `json:"activeMissionIds"`
	PendingActionIDs []string             `json:"pendingActionIds"`
}

type Digest struct {
	GeneratedAt        time.Time `json:"generatedAt"`
	WindowHours        int       `json:"windowHours"`
	OverallHealth      string    `json:"overallHealth"`
	Incidents          []string  `json:"incidents"`
	Changes            []string  `json:"changes"`
	RecommendedActions []string  `json:"recommendedActions"`
}

// Store is the storage contract used by Handler.
type Store interface {
	// GetUser retrieves a user by ID for authorization checks (#16709).
	GetUser(ctx context.Context, userID uuid.UUID) (*models.User, error)

	GetStellarPreferences(ctx context.Context, userID string) (*store.StellarPreferences, error)
	UpdateStellarPreferences(ctx context.Context, preferences *store.StellarPreferences) error

	ListStellarMissions(ctx context.Context, userID string, limit, offset int) ([]store.StellarMission, error)
	GetStellarMission(ctx context.Context, userID string, missionID string) (*store.StellarMission, error)
	CreateStellarMission(ctx context.Context, mission *store.StellarMission) error
	UpdateStellarMission(ctx context.Context, mission *store.StellarMission) error
	DeleteStellarMission(ctx context.Context, userID string, missionID string) error

	ListStellarExecutions(ctx context.Context, userID, missionID, status string, limit, offset int) ([]store.StellarExecution, error)
	GetStellarExecution(ctx context.Context, userID, executionID string) (*store.StellarExecution, error)
	CreateStellarExecution(ctx context.Context, execution *store.StellarExecution) error

	ListStellarActions(ctx context.Context, userID, status string, limit, offset int) ([]store.StellarAction, error)
	GetStellarAction(ctx context.Context, userID, actionID string) (*store.StellarAction, error)
	CreateStellarAction(ctx context.Context, action *store.StellarAction) error
	ApproveStellarAction(ctx context.Context, userID, actionID, approvedBy string) error
	RejectStellarAction(ctx context.Context, userID, actionID, rejectedBy, reason string) error
	DeleteStellarAction(ctx context.Context, userID, actionID string) error
	CompleteDueStellarActions(ctx context.Context, now time.Time) ([]store.StellarAction, error)
	GetDueApprovedStellarActions(ctx context.Context, now time.Time, limit int) ([]store.StellarAction, error)
	UpdateStellarActionStatus(ctx context.Context, actionID, status, outcome, rejectReason string) error

	ListStellarMemoryEntries(ctx context.Context, userID, cluster, category string, limit, offset int) ([]store.StellarMemoryEntry, error)
	SearchStellarMemoryEntries(ctx context.Context, userID, query string, limit int) ([]store.StellarMemoryEntry, error)
	CreateStellarMemoryEntry(ctx context.Context, entry *store.StellarMemoryEntry) error
	DeleteStellarMemoryEntry(ctx context.Context, userID, entryID string) error

	ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error)
	GetStellarNotification(ctx context.Context, userID, notificationID string) (*store.StellarNotification, error)
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	GetLatestEventBatchTimestamp(ctx context.Context) (*time.Time, error)
	UpdateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	MarkStellarNotificationRead(ctx context.Context, userID, notificationID string) error
	CountUnreadStellarNotifications(ctx context.Context, userID string) (int, error)
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
	ListStellarUserIDs(ctx context.Context) ([]string, error)

	CreateTask(ctx context.Context, task *store.StellarTask) (string, error)
	GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error)
	UpdateTaskStatus(ctx context.Context, id, status, userID string) error
	GetTasksForCluster(ctx context.Context, cluster string, limit int) ([]store.StellarTask, error)
	GetOverdueOpenTasks(ctx context.Context, asOf time.Time) ([]store.StellarTask, error)

	CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error)
	GetRecentObservations(ctx context.Context, cluster string, limit int) ([]store.StellarObservation, error)
	GetUnshownObservations(ctx context.Context, userID string) ([]store.StellarObservation, error)
	MarkObservationShown(ctx context.Context, userID, observationID string) error

	GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]store.StellarWatch, error)
	GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	TouchWatch(ctx context.Context, id, lastUpdate string, ts time.Time) error
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate, userID string) error
	ResolveWatch(ctx context.Context, id, userID string) error
	SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error
	GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error)

	QueryTimeline(ctx context.Context, filter store.TimelineFilter) ([]store.ClusterEvent, error)

	ActionCompletedByIdempotencyKey(ctx context.Context, key string) bool
	IncrementRetry(ctx context.Context, id string) error
	PruneOldNotifications(ctx context.Context, retentionDays int) (int64, error)
	PruneOldExecutions(ctx context.Context, retentionDays int) (int64, error)
	PruneExpiredMemory(ctx context.Context) (int64, error)

	// Sprint 5
	GetNotificationsSince(ctx context.Context, since time.Time) ([]store.StellarNotification, error)
	GetUserNotificationsSince(ctx context.Context, userID string, since time.Time) ([]store.StellarNotification, error)
	GetExecutionsSince(ctx context.Context, since time.Time) ([]store.StellarExecution, error)
	UpsertUserLastSeen(ctx context.Context, userID string) error
	GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error)
	SetUserLastDigest(ctx context.Context, userID string) error
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error)
	SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error
	GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]store.StellarWatch, error)
	ListStellarAuditLog(ctx context.Context, userID string, limit int) ([]store.StellarAuditEntry, error)

	// Event pipeline — recurring detection and async narration enrichment
	CountRecentEventsForResource(ctx context.Context, cluster, namespace, name string, window time.Duration) (int64, error)
	UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error
}

// stellarK8sClient defines the narrow subset of k8s.MultiClusterClient used by the Stellar Handler.
type stellarK8sClient interface {
	DeduplicatedClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	GetWarningEvents(ctx context.Context, contextName, namespace string, limit int) ([]k8s.Event, error)
	GetClient(contextName string) (kubernetes.Interface, error)
}

// Handler exposes persistence and operational APIs for the Stellar assistant.
type Handler struct {
	store            Store
	userStore        store.Store // for admin role checks on sensitive endpoints
	k8sClient        stellarK8sClient
	providerRegistry *providers.Registry
	broadcaster      SSEBroadcaster
	sseClients       map[string]stellarSSEClient
	sseClientsMu     sync.RWMutex
}

func NewHandler(s Store, k8sClient *k8s.MultiClusterClient, opts ...HandlerOption) *Handler {
	h := &Handler{
		store:            s,
		k8sClient:        k8sClient,
		providerRegistry: providers.NewRegistry(),
	}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

// HandlerOption configures optional dependencies for Handler.
type HandlerOption func(*Handler)

// WithUserStore sets the user store for admin role checks on sensitive endpoints.
func WithUserStore(us store.Store) HandlerOption {
	return func(h *Handler) {
		h.userStore = us
	}
}

func (h *Handler) SetProviderRegistry(reg *providers.Registry) {
	if reg != nil {
		h.providerRegistry = reg
	}
}

func (h *Handler) SetBroadcaster(b SSEBroadcaster) {
	h.broadcaster = b
}

// SetUserStore wires user role lookups for authorization checks on mutating
// endpoints (e.g., IngestEvent #16709). Optional — if unset, role checks are
// skipped for backward compatibility in tests.
func (h *Handler) SetUserStore(us store.Store) {
	h.userStore = us
}
