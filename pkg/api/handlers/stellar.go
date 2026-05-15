package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/stellar/scheduler"
	"github.com/kubestellar/console/pkg/store"
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
	stellarDigestLookbackHours    = 24
	stellarRecentEventLookbackMin = 10
	stellarStreamInterval         = 10 * time.Second
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

type StellarOperationalState struct {
	GeneratedAt      time.Time            `json:"generatedAt"`
	ClustersWatching []string             `json:"clustersWatching"`
	EventCounts      map[string]int       `json:"eventCounts"`
	RecentEvents     []store.ClusterEvent `json:"recentEvents"`
	UnreadAlerts     int                  `json:"unreadAlerts"`
	ActiveMissionIDs []string             `json:"activeMissionIds"`
	PendingActionIDs []string             `json:"pendingActionIds"`
}

type StellarDigest struct {
	GeneratedAt        time.Time `json:"generatedAt"`
	WindowHours        int       `json:"windowHours"`
	OverallHealth      string    `json:"overallHealth"`
	Incidents          []string  `json:"incidents"`
	Changes            []string  `json:"changes"`
	RecommendedActions []string  `json:"recommendedActions"`
}

// StellarStore is the storage contract used by StellarHandler.
type StellarStore interface {
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
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
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
	GetUnshownObservations(ctx context.Context) ([]store.StellarObservation, error)
	MarkObservationShown(ctx context.Context, id string) error

	GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]store.StellarWatch, error)
	GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate string) error
	ResolveWatch(ctx context.Context, id string) error
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
	GetExecutionsSince(ctx context.Context, since time.Time) ([]store.StellarExecution, error)
	UpsertUserLastSeen(ctx context.Context, userID string) error
	GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error)
	SetUserLastDigest(ctx context.Context, userID string) error
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error)
	SnoozeWatch(ctx context.Context, id string, until time.Time) error
	GetWatchesSince(ctx context.Context, userID string, since time.Time, status string) ([]store.StellarWatch, error)
	ListStellarAuditLog(ctx context.Context, limit int) ([]store.StellarAuditEntry, error)

	// Event pipeline — recurring detection and async narration enrichment
	CountRecentEventsForResource(ctx context.Context, cluster, namespace, name string, window time.Duration) (int64, error)
	UpdateNotificationBody(ctx context.Context, dedupeKey, newBody string) error
}

// StellarHandler exposes persistence and operational APIs for the Stellar assistant.
type StellarHandler struct {
	store            StellarStore
	k8sClient        *k8s.MultiClusterClient
	providerRegistry *providers.Registry
	broadcaster      SSEBroadcaster
	sseClients       map[string]chan SSEEvent
	sseClientsMu     sync.RWMutex
}

func (h *StellarHandler) registerSSEClient(connID string, ch chan SSEEvent) {
	h.sseClientsMu.Lock()
	defer h.sseClientsMu.Unlock()
	if h.sseClients == nil {
		h.sseClients = make(map[string]chan SSEEvent)
	}
	h.sseClients[connID] = ch
}

func (h *StellarHandler) unregisterSSEClient(connID string) {
	h.sseClientsMu.Lock()
	defer h.sseClientsMu.Unlock()
	delete(h.sseClients, connID)
}

func (h *StellarHandler) broadcastToClients(event SSEEvent) {
	h.sseClientsMu.RLock()
	defer h.sseClientsMu.RUnlock()
	for _, ch := range h.sseClients {
		select {
		case ch <- event:
		default: // client too slow, skip
		}
	}
}

func (h *StellarHandler) Broadcast(event SSEEvent) {
	h.broadcastToClients(event)
}

type SSEBroadcaster interface {
	Broadcast(event SSEEvent)
}

type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func NewStellarHandler(s StellarStore, k8sClient *k8s.MultiClusterClient) *StellarHandler {
	return &StellarHandler{
		store:            s,
		k8sClient:        k8sClient,
		providerRegistry: providers.NewRegistry(),
	}
}

func (h *StellarHandler) SetProviderRegistry(reg *providers.Registry) {
	if reg != nil {
		h.providerRegistry = reg
	}
}

func (h *StellarHandler) SetBroadcaster(b SSEBroadcaster) {
	h.broadcaster = b
}

// StartBackgroundWorkers launches long-running goroutines owned by the handler.
// Currently just the due-task reminder loop; future workers (digest generator,
// scheduled mission firer) belong here too. Safe to call multiple times — each
// call spawns a new ticker, but the dedup-key gate prevents duplicate notifs.
func (h *StellarHandler) StartBackgroundWorkers(ctx context.Context) {
	go h.dueTaskReminderLoop(ctx)
}

// dueTaskReminderLoop scans for tasks whose due_at has passed and fires a
// one-time reminder notification per task. "Stellar follows the schedule" —
// when a recommended task's deadline arrives, the user gets a toast and the
// task surfaces in the events column.
func (h *StellarHandler) dueTaskReminderLoop(ctx context.Context) {
	const tickInterval = 30 * time.Second
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	// Tick once on start so a freshly-restarted server catches up immediately.
	h.fireDueTaskReminders(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.fireDueTaskReminders(ctx)
		}
	}
}

func (h *StellarHandler) fireDueTaskReminders(ctx context.Context) {
	tasks, err := h.store.GetOverdueOpenTasks(ctx, time.Now().UTC())
	if err != nil {
		slog.Warn("stellar: GetOverdueOpenTasks failed", "error", err)
		return
	}
	for _, t := range tasks {
		dedupeKey := fmt.Sprintf("task-due:%s", t.ID)
		// CreateStellarNotification dedupes by DedupeKey — re-firing is cheap and idempotent.
		body := t.Description
		if body == "" {
			body = "This task is now due. Open Stellar to run it, or reschedule."
		}
		dueNotif := &store.StellarNotification{
			UserID:    t.UserID,
			Type:      "event",
			Severity:  "warning",
			Title:     fmt.Sprintf("⏰ Task due: %s", t.Title),
			Body:      body,
			Cluster:   t.Cluster,
			DedupeKey: dedupeKey,
		}
		_ = h.store.CreateStellarNotification(ctx, dueNotif)
		h.broadcastToClients(SSEEvent{Type: "notification", Data: dueNotif})
		if h.broadcaster != nil {
			h.broadcaster.Broadcast(SSEEvent{Type: "task_due", Data: map[string]string{
				"taskId": t.ID,
				"title":  t.Title,
			}})
		}
	}
}

func (h *StellarHandler) GetPreferences(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	prefs, err := h.store.GetStellarPreferences(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load preferences"})
	}
	return c.JSON(prefs)
}

type putStellarPreferencesRequest struct {
	DefaultProvider string   `json:"defaultProvider"`
	ExecutionMode   string   `json:"executionMode"`
	Timezone        string   `json:"timezone"`
	ProactiveMode   bool     `json:"proactiveMode"`
	PinnedClusters  []string `json:"pinnedClusters"`
}

func (h *StellarHandler) UpdatePreferences(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	var body putStellarPreferencesRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.DefaultProvider = strings.TrimSpace(body.DefaultProvider)
	if body.DefaultProvider == "" {
		body.DefaultProvider = stellarDefaultProviderPolicy
	}
	body.ExecutionMode = strings.TrimSpace(body.ExecutionMode)
	if body.ExecutionMode == "" {
		body.ExecutionMode = stellarDefaultExecutionMode
	}
	if !stellarAllowedExecutionModes[body.ExecutionMode] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid executionMode"})
	}
	body.Timezone = strings.TrimSpace(body.Timezone)
	if body.Timezone == "" {
		body.Timezone = stellarDefaultTimezone
	}

	pinned := make([]string, 0, len(body.PinnedClusters))
	for _, cluster := range body.PinnedClusters {
		cluster = strings.TrimSpace(cluster)
		if cluster != "" {
			pinned = append(pinned, cluster)
		}
	}

	if err := h.store.UpdateStellarPreferences(c.UserContext(), &store.StellarPreferences{
		UserID:          userID,
		DefaultProvider: body.DefaultProvider,
		ExecutionMode:   body.ExecutionMode,
		Timezone:        body.Timezone,
		ProactiveMode:   body.ProactiveMode,
		PinnedClusters:  pinned,
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save preferences"})
	}
	updated, err := h.store.GetStellarPreferences(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload preferences"})
	}
	return c.JSON(updated)
}

func (h *StellarHandler) ListMissions(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	limit := readListLimit(c)
	offset := readListOffset(c)
	missions, err := h.store.ListStellarMissions(c.UserContext(), userID, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load missions"})
	}
	return c.JSON(fiber.Map{"items": missions, "limit": limit})
}

func (h *StellarHandler) GetMission(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	missionID := strings.TrimSpace(c.Params("id"))
	if missionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	mission, err := h.store.GetStellarMission(c.UserContext(), userID, missionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load mission"})
	}
	if mission == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "mission not found"})
	}
	return c.JSON(mission)
}

type upsertStellarMissionRequest struct {
	Name           string   `json:"name"`
	Goal           string   `json:"goal"`
	Schedule       string   `json:"schedule"`
	TriggerType    string   `json:"triggerType"`
	ProviderPolicy string   `json:"providerPolicy"`
	MemoryScope    string   `json:"memoryScope"`
	Enabled        bool     `json:"enabled"`
	ToolBindings   []string `json:"toolBindings"`
}

func (h *StellarHandler) CreateMission(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	mission, err := parseMissionPayload(c)
	if err != nil {
		return err
	}
	mission.UserID = userID
	if err := h.store.CreateStellarMission(c.UserContext(), mission); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create mission"})
	}
	created, err := h.store.GetStellarMission(c.UserContext(), userID, mission.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload mission"})
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *StellarHandler) UpdateMission(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	missionID := strings.TrimSpace(c.Params("id"))
	if missionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	existing, err := h.store.GetStellarMission(c.UserContext(), userID, missionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load mission"})
	}
	if existing == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "mission not found"})
	}

	mission, parseErr := parseMissionPayload(c)
	if parseErr != nil {
		return parseErr
	}
	mission.ID = missionID
	mission.UserID = userID
	mission.CreatedAt = existing.CreatedAt
	mission.LastRunAt = existing.LastRunAt
	mission.NextRunAt = existing.NextRunAt

	if err := h.store.UpdateStellarMission(c.UserContext(), mission); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update mission"})
	}
	updated, err := h.store.GetStellarMission(c.UserContext(), userID, missionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload mission"})
	}
	return c.JSON(updated)
}

func (h *StellarHandler) DeleteMission(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	missionID := strings.TrimSpace(c.Params("id"))
	if missionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.DeleteStellarMission(c.UserContext(), userID, missionID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete mission"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) ListExecutions(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	limit := readListLimit(c)
	offset := readListOffset(c)
	missionID := strings.TrimSpace(c.Query("mission_id"))
	status := strings.TrimSpace(c.Query("status"))
	items, err := h.store.ListStellarExecutions(c.UserContext(), userID, missionID, status, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load executions"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) GetExecution(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	executionID := strings.TrimSpace(c.Params("id"))
	if executionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	item, err := h.store.GetStellarExecution(c.UserContext(), userID, executionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load execution"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "execution not found"})
	}
	return c.JSON(item)
}

type createStellarActionRequest struct {
	Description string         `json:"description"`
	ActionType  string         `json:"actionType"`
	Parameters  map[string]any `json:"parameters"`
	Cluster     string         `json:"cluster"`
	Namespace   string         `json:"namespace"`
	ScheduledAt string         `json:"scheduledAt"`
	CronExpr    string         `json:"cronExpr"`
}

func (h *StellarHandler) ListActions(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	_ = h.processDueActions(c.UserContext(), userID)
	limit := readListLimit(c)
	offset := readListOffset(c)
	status := strings.TrimSpace(c.Query("status"))
	items, err := h.store.ListStellarActions(c.UserContext(), userID, status, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load actions"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) GetAction(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
	return c.JSON(item)
}

func (h *StellarHandler) CreateAction(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body createStellarActionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Description = strings.TrimSpace(body.Description)
	body.ActionType = strings.TrimSpace(body.ActionType)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.CronExpr = strings.TrimSpace(body.CronExpr)
	if body.Description == "" || body.ActionType == "" || body.Cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "description, actionType, and cluster are required"})
	}
	parametersJSON, err := json.Marshal(body.Parameters)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parameters"})
	}
	var scheduledAt *time.Time
	if strings.TrimSpace(body.ScheduledAt) != "" {
		parsed, parseErr := time.Parse(time.RFC3339, body.ScheduledAt)
		if parseErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "scheduledAt must be RFC3339"})
		}
		scheduledAt = &parsed
	}
	action := &store.StellarAction{
		UserID:      userID,
		Description: body.Description,
		ActionType:  body.ActionType,
		Parameters:  string(parametersJSON),
		Cluster:     body.Cluster,
		Namespace:   body.Namespace,
		ScheduledAt: scheduledAt,
		CronExpr:    body.CronExpr,
		Status:      "pending_approval",
		CreatedBy:   userID,
	}
	if err := h.store.CreateStellarAction(c.UserContext(), action); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create action"})
	}
	_ = h.store.CreateStellarNotification(c.UserContext(), &store.StellarNotification{
		UserID:    userID,
		Type:      "ActionRequired",
		Severity:  "warning",
		Title:     "Action requires approval",
		Body:      fmt.Sprintf("%s on %s is waiting for confirmation.", body.ActionType, body.Cluster),
		Cluster:   body.Cluster,
		Namespace: body.Namespace,
		ActionID:  action.ID,
	})
	created, err := h.store.GetStellarAction(c.UserContext(), userID, action.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reload action"})
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (h *StellarHandler) ApproveAction(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	if s, ok := h.store.(store.Store); ok {
		if err := requireEditorOrAdmin(c, s); err != nil {
			return err
		}
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to approve action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
	if item.Status != "pending_approval" {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "action is not pending approval"})
	}
	var req struct {
		ConfirmToken string `json:"confirmToken"`
	}
	_ = c.BodyParser(&req)
	destructive := isDestructiveAction(item.ActionType)
	if destructive {
		if req.ConfirmToken == "" || req.ConfirmToken != item.ConfirmToken {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "confirm_token required for destructive action"})
		}
		if item.CreatedBy == userID {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "cannot self-approve destructive actions"})
		}
	}
	if err := h.store.ApproveStellarAction(c.UserContext(), userID, actionID, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to approve action"})
	}
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "approve_action",
			EntityType: "action",
			EntityID:   actionID,
			Cluster:    item.Cluster,
			Detail:     fmt.Sprintf(`{"confirmToken":"%s"}`, req.ConfirmToken),
		})
	}
	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{
			Type: "action_updated",
			Data: map[string]string{"id": actionID, "status": "approved"},
		})
	}
	_ = h.processDueActions(c.UserContext(), userID)
	item, _ = h.store.GetStellarAction(c.UserContext(), userID, actionID)
	return c.JSON(item)
}

type rejectActionRequest struct {
	Reason string `json:"reason"`
}

func (h *StellarHandler) RejectAction(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body rejectActionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	if err := h.store.RejectStellarAction(c.UserContext(), userID, actionID, userID, strings.TrimSpace(body.Reason)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to reject action"})
	}
	_ = h.store.CreateStellarNotification(c.UserContext(), &store.StellarNotification{
		UserID:   userID,
		Type:     "MissionUpdate",
		Severity: "info",
		Title:    "Action rejected",
		Body:     "The scheduled action was rejected and will not run.",
		ActionID: actionID,
	})
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
	return c.JSON(item)
}

func (h *StellarHandler) DeleteAction(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.DeleteStellarAction(c.UserContext(), userID, actionID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete action"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// executeActionMaxTimeout is the maximum duration for immediate action dispatch.
const executeActionMaxTimeout = 2 * time.Minute

type executeActionRequest struct {
	ActionType  string         `json:"actionType"`
	Description string         `json:"description"`
	Cluster     string         `json:"cluster"`
	Namespace   string         `json:"namespace"`
	Name        string         `json:"name"`
	Parameters  map[string]any `json:"parameters"`
	Prompt      string         `json:"prompt"`
}

// knownDispatchableActions lists action types that can be dispatched to K8s directly.
var knownDispatchableActions = map[string]bool{
	"RestartDeployment": true,
	"ScaleDeployment":   true,
	"DeletePod":         true,
	"CordonNode":        true,
}

// ExecuteAction creates and immediately executes a Stellar action.
// For known K8s action types, dispatches directly via the scheduler.
// For "investigate" or unknown types, falls back to an LLM call.
func (h *StellarHandler) ExecuteAction(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body executeActionRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.ActionType = strings.TrimSpace(body.ActionType)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.Name = strings.TrimSpace(body.Name)
	body.Description = strings.TrimSpace(body.Description)
	body.Prompt = strings.TrimSpace(body.Prompt)

	if body.Cluster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster is required"})
	}
	if body.Description == "" && body.Prompt != "" {
		body.Description = body.Prompt
	}
	if body.Description == "" {
		body.Description = fmt.Sprintf("%s on %s/%s", body.ActionType, body.Namespace, body.Name)
	}

	// Merge name/namespace into parameters for dispatch compatibility
	params := body.Parameters
	if params == nil {
		params = map[string]any{}
	}
	if body.Name != "" {
		params["name"] = body.Name
	}
	if body.Namespace != "" {
		params["namespace"] = body.Namespace
	}

	// If it's a dispatchable K8s action and we have a k8s client, execute directly
	if knownDispatchableActions[body.ActionType] && h.k8sClient != nil {
		return h.executeDirectAction(c, userID, body, params)
	}

	// Fall back to LLM-based execution (investigate, scale without params, etc.)
	return h.executeLLMAction(c, userID, body)
}

func (h *StellarHandler) executeDirectAction(c *fiber.Ctx, userID string, body executeActionRequest, params map[string]any) error {
	parametersJSON, err := json.Marshal(params)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid parameters"})
	}

	now := time.Now().UTC()
	action := &store.StellarAction{
		UserID:      userID,
		Description: body.Description,
		ActionType:  body.ActionType,
		Parameters:  string(parametersJSON),
		Cluster:     body.Cluster,
		Namespace:   body.Namespace,
		Status:      "approved",
		CreatedBy:   userID,
		ApprovedBy:  userID,
		ApprovedAt:  &now,
	}
	if err := h.store.CreateStellarAction(c.UserContext(), action); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create action"})
	}

	_ = h.store.UpdateStellarActionStatus(c.UserContext(), action.ID, "running", "", "")

	execCtx, cancel := context.WithTimeout(c.UserContext(), executeActionMaxTimeout)
	defer cancel()

	outcome, dispatchErr := scheduler.Dispatch(execCtx, h.k8sClient, *action)
	startTime := now
	durationMs := int(time.Since(startTime).Milliseconds())

	status := "completed"
	if dispatchErr != nil {
		status = "failed"
		outcome = dispatchErr.Error()
		slog.Error("stellar: action execution failed", "action_id", action.ID, "error", dispatchErr)
	}

	_ = h.store.UpdateStellarActionStatus(c.UserContext(), action.ID, status, outcome, "")

	// Record execution
	completedAt := time.Now().UTC()
	_ = h.store.CreateStellarExecution(c.UserContext(), &store.StellarExecution{
		UserID:      userID,
		MissionID:   "action-execute",
		TriggerType: "stellar-action",
		TriggerData: fmt.Sprintf(`{"actionType":"%s","cluster":"%s"}`, body.ActionType, body.Cluster),
		Status:      status,
		RawInput:    body.Description,
		Output:      outcome,
		DurationMs:  durationMs,
		StartedAt:   startTime,
		CompletedAt: &completedAt,
	})

	// Audit entry
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "execute_action",
			EntityType: "action",
			EntityID:   action.ID,
			Cluster:    body.Cluster,
			Detail:     body.Description,
		})
	}

	// Notification for the result
	notifSeverity := "info"
	notifTitle := "Action completed: " + body.ActionType
	if status == "failed" {
		notifSeverity = "warning"
		notifTitle = "Action failed: " + body.ActionType
	}
	_ = h.store.CreateStellarNotification(c.UserContext(), &store.StellarNotification{
		UserID:    userID,
		Type:      "action",
		Severity:  notifSeverity,
		Title:     notifTitle,
		Body:      outcome,
		Cluster:   body.Cluster,
		Namespace: body.Namespace,
		ActionID:  action.ID,
		DedupeKey: fmt.Sprintf("exec:%s", action.ID),
	})

	// Memory entry
	_ = h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    body.Cluster,
		Namespace:  body.Namespace,
		Category:   "action",
		Summary:    fmt.Sprintf("%s %s: %s", body.ActionType, status, outcome),
		Importance: 7,
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 60)),
	})

	// Broadcast via SSE
	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "action_update", Data: map[string]string{
			"id": action.ID, "status": status, "outcome": outcome,
		}})
	}

	return c.JSON(fiber.Map{
		"id":       action.ID,
		"status":   status,
		"outcome":  outcome,
		"duration": durationMs,
	})
}

func (h *StellarHandler) executeLLMAction(c *fiber.Ctx, userID string, body executeActionRequest) error {
	prompt := body.Prompt
	if prompt == "" {
		prompt = body.Description
	}

	resolved, err := h.resolveProviderAndModel(c.UserContext(), userID, "", "")
	if err != nil || resolved.Provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}

	state, _ := h.buildOperationalState(c.UserContext(), userID, body.Cluster)
	if state == nil {
		state = &StellarOperationalState{
			GeneratedAt:      time.Now().UTC(),
			EventCounts:      map[string]int{"critical": 0, "warning": 0, "info": 0},
			RecentEvents:     []store.ClusterEvent{},
			ClustersWatching: []string{},
		}
	}
	memories, _ := h.store.ListStellarMemoryEntries(c.UserContext(), userID, body.Cluster, "", 5, 0)
	tasks, _ := h.store.GetOpenTasks(c.UserContext(), userID)
	contextString := buildLLMContext(state, memories, tasks, body.Cluster)

	messages := []providers.Message{
		{Role: "system", Content: prompts.MissionExecution},
		{Role: "user", Content: "Current cluster state:\n" + contextString},
		{Role: "assistant", Content: "Got it. What do you need?"},
		{Role: "user", Content: fmt.Sprintf("Cluster: %s\nNamespace: %s\nResource: %s\n\nTask: %s", body.Cluster, body.Namespace, body.Name, prompt)},
	}

	startTime := time.Now()
	generated, genErr := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   500,
		Temperature: 0.2,
		Messages:    messages,
	})
	durationMs := int(time.Since(startTime).Milliseconds())

	if genErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "LLM call failed: " + genErr.Error()})
	}

	completedAt := time.Now().UTC()
	_ = h.store.CreateStellarExecution(c.UserContext(), &store.StellarExecution{
		UserID:       userID,
		MissionID:    "action-execute",
		TriggerType:  "stellar-action",
		TriggerData:  fmt.Sprintf(`{"actionType":"%s","cluster":"%s"}`, body.ActionType, body.Cluster),
		Status:       "completed",
		RawInput:     prompt,
		Output:       generated.Content,
		TokensInput:  generated.TokensInput,
		TokensOutput: generated.TokensOutput,
		Provider:     generated.Provider,
		Model:        generated.Model,
		DurationMs:   durationMs,
		StartedAt:    startTime,
		CompletedAt:  &completedAt,
	})

	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "execute_action",
			EntityType: "mission",
			EntityID:   "llm-action",
			Cluster:    body.Cluster,
			Detail:     prompt,
		})
	}

	return c.JSON(fiber.Map{
		"id":       "llm-" + uuid.New().String()[:8],
		"status":   "completed",
		"outcome":  generated.Content,
		"model":    generated.Model,
		"provider": generated.Provider,
		"duration": durationMs,
	})
}

func (h *StellarHandler) ListMemory(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	limit := readListLimit(c)
	offset := readListOffset(c)
	cluster := strings.TrimSpace(c.Query("cluster"))
	category := strings.TrimSpace(c.Query("category"))
	items, err := h.store.ListStellarMemoryEntries(c.UserContext(), userID, cluster, category, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load memory"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

type searchMemoryRequest struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

func (h *StellarHandler) SearchMemory(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body searchMemoryRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Query = strings.TrimSpace(body.Query)
	if body.Query == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "query is required"})
	}
	limit := body.Limit
	if limit <= 0 {
		limit = 20
	}
	items, err := h.store.SearchStellarMemoryEntries(c.UserContext(), userID, body.Query, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to search memory"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) DeleteMemory(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	entryID := strings.TrimSpace(c.Params("id"))
	if entryID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.DeleteStellarMemoryEntry(c.UserContext(), userID, entryID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete memory entry"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) GetState(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	_ = h.syncTimelineNotifications(c.UserContext(), userID)
	state, err := h.buildState(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to build state"})
	}
	return c.JSON(state)
}

func (h *StellarHandler) GetDigest(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	since := time.Now().UTC().Add(-stellarDigestLookbackHours * time.Hour)
	executions, execErr := h.store.ListStellarExecutions(c.UserContext(), userID, "", "", 500, 0)
	if execErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load executions"})
	}
	notifications, notifErr := h.store.ListStellarNotifications(c.UserContext(), userID, 500, false)
	if notifErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load notifications"})
	}

	var summary strings.Builder
	summary.WriteString(fmt.Sprintf("Period: last 24 hours (since %s UTC)\n\n", since.Format("2006-01-02 15:04")))
	filteredNotifications := make([]store.StellarNotification, 0)
	for _, notification := range notifications {
		if notification.CreatedAt.Before(since) {
			continue
		}
		filteredNotifications = append(filteredNotifications, notification)
	}
	if len(filteredNotifications) == 0 {
		summary.WriteString("No notable events logged.\n")
	} else {
		summary.WriteString("Events logged:\n")
		for _, notification := range filteredNotifications {
			summary.WriteString(fmt.Sprintf("  [%s] %s: %s\n", notification.Severity, notification.Title, notification.Body))
		}
	}

	executionCount := 0
	for _, execution := range executions {
		if execution.StartedAt.Before(since) {
			continue
		}
		executionCount++
	}
	if executionCount > 0 {
		summary.WriteString(fmt.Sprintf("\n%d mission executions ran.\n", executionCount))
	}

	resolved, err := h.resolveProviderAndModel(c.UserContext(), userID, "", "")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "provider resolution failed: " + err.Error()})
	}
	if resolved.Provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}
	response, err := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   600,
		Temperature: 0.4,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.Digest},
			{Role: "user", Content: summary.String()},
		},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "digest generation failed: " + err.Error()})
	}
	_ = h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    "",
		Category:   "digest",
		Summary:    truncateString(response.Content, 300),
		Tags:       []string{"digest"},
		Importance: 5,
		ExpiresAt:  ptr(time.Now().AddDate(0, 0, 30)),
	})

	return c.JSON(fiber.Map{
		"digest":      response.Content,
		"model":       response.Model,
		"provider":    response.Provider,
		"generatedAt": time.Now().UTC(),
	})
}

// stellarMaxHistoryTurns caps how many conversation turns are sent to the LLM.
const stellarMaxHistoryTurns = 10

type quickAskRequest struct {
	Prompt   string              `json:"prompt"`
	Cluster  string              `json:"cluster"`
	Provider string              `json:"provider"`
	Model    string              `json:"model"`
	History  []providers.Message  `json:"history"`
}

type watchSuggestion struct {
	Cluster      string
	Namespace    string
	ResourceKind string
	ResourceName string
	Reason       string
}

func parseWatchLine(content string) (string, *watchSuggestion) {
	idx := strings.Index(content, "\nWATCH:")
	if idx == -1 {
		return content, nil
	}
	line := strings.TrimSpace(content[idx+7:])
	// line format: "prod-a/payments/Deployment/payment-worker — monitoring recovery"
	parts := strings.SplitN(line, " — ", 2)
	reason := ""
	if len(parts) == 2 {
		reason = strings.TrimSpace(parts[1])
	}
	segments := strings.SplitN(strings.TrimSpace(parts[0]), "/", 4)
	if len(segments) != 4 {
		return strings.TrimSpace(content[:idx]), nil // malformed, strip line, no watch
	}
	return strings.TrimSpace(content[:idx]), &watchSuggestion{
		Cluster:      segments[0],
		Namespace:    segments[1],
		ResourceKind: segments[2],
		ResourceName: segments[3],
		Reason:       reason,
	}
}

func (h *StellarHandler) Ask(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body quickAskRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Prompt = sanitizePromptInput(body.Prompt)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Provider = strings.TrimSpace(body.Provider)
	body.Model = strings.TrimSpace(body.Model)
	if body.Prompt == "" || len(body.Prompt) > stellarMaxPromptLength {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "prompt is required and must be <= 5000 chars"})
	}

	userCfg, _ := h.resolveUserProvider(c.UserContext(), userID)
	resolved := h.providerRegistry.Resolve(body.Provider, body.Model, userCfg)

	state, err := h.buildOperationalState(c.UserContext(), userID, body.Cluster)
	if err != nil {
		slog.Warn("stellar: could not build operational state", "error", err)
		state = &StellarOperationalState{
			GeneratedAt:      time.Now().UTC(),
			EventCounts:      map[string]int{"critical": 0, "warning": 0, "info": 0},
			RecentEvents:     []store.ClusterEvent{},
			ClustersWatching: []string{},
		}
	}
	memories, _ := h.store.ListStellarMemoryEntries(c.UserContext(), userID, body.Cluster, "", 5, 0)
	tasks, _ := h.store.GetOpenTasks(c.UserContext(), userID)
	contextString := buildLLMContext(state, memories, tasks, body.Cluster)

	if resolved.Provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}

	// Build message chain: system prompt → context → history → current question
	messages := []providers.Message{
		{Role: "system", Content: prompts.QuickAsk},
		{Role: "user", Content: "Current cluster state:\n" + contextString},
		{Role: "assistant", Content: "Got it. What do you need?"},
	}
	// Inject conversation history (capped to prevent token budget blowout)
	history := body.History
	if len(history) > stellarMaxHistoryTurns {
		history = history[len(history)-stellarMaxHistoryTurns:]
	}
	for _, msg := range history {
		role := strings.TrimSpace(msg.Role)
		if role != "user" && role != "assistant" {
			continue // skip invalid roles
		}
		messages = append(messages, providers.Message{Role: role, Content: msg.Content})
	}
	// Current user question always goes last
	messages = append(messages, providers.Message{Role: "user", Content: body.Prompt})

	startTime := time.Now()
	generated, err := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   800,
		Temperature: 0.3,
		Messages:    messages,
	})
	fallbackUsed := false
	fallbackReason := ""
	durationMs := int(time.Since(startTime).Milliseconds())
	if err != nil {
		fallbackName := os.Getenv("STELLAR_FALLBACK_PROVIDER")
		if fallbackName != "" && fallbackName != resolved.Provider.Name() {
			if fp, ok := h.providerRegistry.GetGlobal(fallbackName); ok && fp != nil {
				fallbackUsed = true
				fallbackReason = fmt.Sprintf("%s failed after %dms: %s. Falling back to %s.", resolved.Provider.Name(), durationMs, err.Error(), fallbackName)
				startTime = time.Now()
				generated, err = fp.Generate(c.UserContext(), providers.GenerateRequest{
					Model:       resolved.Model,
					MaxTokens:   800,
					Temperature: 0.3,
					Messages: []providers.Message{
						{Role: "system", Content: prompts.QuickAsk},
						{Role: "user", Content: "Current cluster state:\n" + contextString + "\n\nQuestion: " + body.Prompt},
					},
				})
				durationMs = int(time.Since(startTime).Milliseconds())
			}
		}
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI provider error: " + err.Error()})
	}
	if generated == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI provider returned empty response"})
	}

	// Parse WATCH: line from LLM response before persisting
	cleanContent, watch := parseWatchLine(generated.Content)
	generated.Content = cleanContent

	var watchCreated bool
	var watchID string
	if watch != nil {
		// Q2: Deduplication — don't create a duplicate active watch for the same resource
		existing, _ := h.store.GetWatchByResource(c.UserContext(), userID, watch.Cluster, watch.Namespace, watch.ResourceKind, watch.ResourceName)
		if existing != nil {
			watchCreated = true
			watchID = existing.ID
		} else {
			id, wErr := h.store.CreateWatch(c.UserContext(), &store.StellarWatch{
				UserID:       userID,
				Cluster:      watch.Cluster,
				Namespace:    watch.Namespace,
				ResourceKind: watch.ResourceKind,
				ResourceName: watch.ResourceName,
				Reason:       watch.Reason,
			})
			if wErr == nil {
				watchCreated = true
				watchID = id
				if h.broadcaster != nil {
					h.broadcaster.Broadcast(SSEEvent{Type: "watch_created", Data: map[string]string{
						"id": id, "cluster": watch.Cluster,
					}})
				}
			}
		}
	}

	now := time.Now().UTC()
	execution := &store.StellarExecution{
		UserID:       userID,
		MissionID:    "quick-ask",
		TriggerType:  "manual",
		TriggerData:  "{}",
		Status:       "completed",
		RawInput:     body.Prompt,
		Output:       generated.Content,
		TokensInput:  generated.TokensInput,
		TokensOutput: generated.TokensOutput,
		Provider:     generated.Provider,
		Model:        generated.Model,
		DurationMs:   durationMs,
		StartedAt:    now,
		CompletedAt:  &now,
	}
	_ = h.store.CreateStellarExecution(c.UserContext(), execution)
	_ = h.store.CreateStellarMemoryEntry(c.UserContext(), &store.StellarMemoryEntry{
		UserID:     userID,
		Cluster:    firstOrUnknown(state.ClustersWatching),
		Category:   "quick-ask",
		Summary:    summarizeQuickAsk(body.Prompt, generated.Content),
		RawContent: generated.Content,
		Tags:       []string{"quick-ask"},
		Importance: 3,
		ExpiresAt:  ptr(now.AddDate(0, 0, 7)),
	})
	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(c.UserContext(), &store.StellarAuditEntry{
			UserID:     userID,
			Action:     "ask",
			EntityType: "execution",
			EntityID:   execution.ID,
			Cluster:    body.Cluster,
			Detail:     fmt.Sprintf(`{"provider":"%s","model":"%s"}`, generated.Provider, generated.Model),
		})
	}

	return c.JSON(fiber.Map{
		"answer":         generated.Content,
		"executionId":    execution.ID,
		"provider":       generated.Provider,
		"model":          generated.Model,
		"providerSource": resolved.Source,
		"tokens":         generated.TokensInput + generated.TokensOutput,
		"durationMs":     durationMs,
		"fallbackUsed":   fallbackUsed,
		"fallbackReason": fallbackReason,
		"watchCreated":   watchCreated,
		"watchId":        watchID,
		"state":          state,
	})
}

func (h *StellarHandler) ListNotifications(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	_ = h.syncTimelineNotifications(c.UserContext(), userID)
	limit := readListLimit(c)
	unreadOnly := strings.EqualFold(strings.TrimSpace(c.Query("unread")), "true")
	items, err := h.store.ListStellarNotifications(c.UserContext(), userID, limit, unreadOnly)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load notifications"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) MarkNotificationRead(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	notificationID := strings.TrimSpace(c.Params("id"))
	if notificationID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.MarkStellarNotificationRead(c.UserContext(), userID, notificationID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to mark notification read"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) ListTasks(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	items, err := h.store.GetOpenTasks(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load tasks"})
	}
	return c.JSON(fiber.Map{"items": items})
}

func (h *StellarHandler) CreateTask(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body struct {
		SessionID   string `json:"sessionId"`
		Cluster     string `json:"cluster"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    int    `json:"priority"`
		Source      string `json:"source"`
		ParentID    string `json:"parentId"`
		DueAt       string `json:"dueAt"`
		ContextJSON string `json:"contextJson"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "title is required"})
	}
	if body.Priority < 1 || body.Priority > 10 {
		body.Priority = 5
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		source = "user"
	}
	var dueAt *time.Time
	if raw := strings.TrimSpace(body.DueAt); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "dueAt must be RFC3339"})
		}
		dueAt = &parsed
	}
	contextJSON := strings.TrimSpace(body.ContextJSON)
	if contextJSON == "" {
		contextJSON = "{}"
	}
	task := &store.StellarTask{
		SessionID:   strings.TrimSpace(body.SessionID),
		UserID:      userID,
		Cluster:     strings.TrimSpace(body.Cluster),
		Title:       body.Title,
		Description: strings.TrimSpace(body.Description),
		Status:      "open",
		Priority:    body.Priority,
		Source:      source,
		ParentID:    strings.TrimSpace(body.ParentID),
		DueAt:       dueAt,
		ContextJSON: contextJSON,
	}
	id, err := h.store.CreateTask(c.UserContext(), task)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create task"})
	}
	task.ID = id
	return c.Status(fiber.StatusCreated).JSON(task)
}

func (h *StellarHandler) UpdateTaskStatus(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	taskID := strings.TrimSpace(c.Params("id"))
	if taskID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	status := strings.TrimSpace(strings.ToLower(body.Status))
	switch status {
	case "open", "in_progress", "blocked", "done", "dismissed":
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid status"})
	}
	if err := h.store.UpdateTaskStatus(c.UserContext(), taskID, status, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update task status"})
	}
	items, err := h.store.GetOpenTasks(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"id": taskID, "status": status})
	}
	return c.JSON(fiber.Map{"id": taskID, "status": status, "items": items})
}

func (h *StellarHandler) ListObservations(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	_ = userID
	cluster := strings.TrimSpace(c.Query("cluster"))
	limit := readListLimit(c)
	items, err := h.store.GetRecentObservations(c.UserContext(), cluster, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load observations"})
	}
	return c.JSON(fiber.Map{"items": items, "limit": limit})
}

func (h *StellarHandler) Stream(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}

	// Sprint 5: detect returning user and update last-seen
	lastSeen, _ := h.store.GetUserLastSeen(c.UserContext(), userID)
	awayThreshold := 15 * time.Minute
	isReturning := lastSeen != nil && time.Since(*lastSeen) > awayThreshold
	_ = h.store.UpsertUserLastSeen(c.UserContext(), userID)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		connID := fmt.Sprintf("%s-%d", userID, time.Now().UnixNano())
		clientCh := make(chan SSEEvent, 32)
		h.registerSSEClient(connID, clientCh)
		defer h.unregisterSSEClient(connID)

		// Send initial batch of unread notifications and state
		initialNotifs, err := h.store.ListStellarNotifications(context.Background(), userID, 50, true)
		if err == nil && len(initialNotifs) > 0 {
			for i := len(initialNotifs) - 1; i >= 0; i-- {
				_ = writeSSE(w, "notification", initialNotifs[i])
			}
			state, err := h.buildState(context.Background(), userID)
			if err == nil && state != nil {
				_ = writeSSE(w, "state", fiber.Map{
					"clustersWatching":   state.ClustersWatching,
					"unreadCount":        state.UnreadAlerts,
					"pendingActionCount": len(state.PendingActionIDs),
				})
			}
		}
		_ = w.Flush()

		// If returning after a gap, push catch-up summary after stream establishes
		if isReturning && lastSeen != nil {
			go h.pushCatchUpSummary(context.Background(), w, userID, *lastSeen)
		}

		ticker := time.NewTicker(stellarStreamInterval)
		defer ticker.Stop()
		lastSentID := ""
		send := func() bool {
			_ = h.syncTimelineNotifications(context.Background(), userID)
			// Stream only unread notifications so dismissed/read items do not
			// get re-sent to clients after "dismiss" or "clear all".
			items, err := h.store.ListStellarNotifications(context.Background(), userID, 30, true)
			if err != nil {
				return writeSSE(w, "error", fiber.Map{"message": "failed to load notifications"}) == nil
			}
			if len(items) > 0 && items[0].ID != lastSentID {
				lastSentID = items[0].ID
				if writeSSE(w, "notification", items[0]) != nil {
					return false
				}
			}
			observations, err := h.store.GetUnshownObservations(context.Background())
			if err == nil && len(observations) > 0 {
				next := observations[0]
				payload := fiber.Map{
					"id":      next.ID,
					"summary": next.Summary,
				}
				if suggest := extractObservationSuggest(next.Detail); suggest != "" {
					payload["suggest"] = suggest
				}
				if writeSSE(w, "observation", payload) != nil {
					return false
				}
				_ = h.store.MarkObservationShown(context.Background(), next.ID)
			}
			state, err := h.buildState(context.Background(), userID)
			if err != nil {
				return writeSSE(w, "error", fiber.Map{"message": "failed to build state"}) == nil
			}
			if writeSSE(w, "state", fiber.Map{
				"clustersWatching":   state.ClustersWatching,
				"unreadCount":        state.UnreadAlerts,
				"pendingActionCount": len(state.PendingActionIDs),
			}) != nil {
				return false
			}
			// Push current active watches so the frontend stays in sync
			activeWatches, _ := h.store.GetActiveWatches(context.Background(), userID)
			if writeSSE(w, "watches", activeWatches) != nil {
				return false
			}
			return writeSSE(w, "heartbeat", fiber.Map{"ts": time.Now().UTC().Format(time.RFC3339)}) == nil
		}
		if !send() {
			return
		}
		for {
			select {
			case <-ticker.C:
				if !send() {
					return
				}
			case event := <-clientCh:
				if writeSSE(w, event.Type, event.Data) != nil {
					return
				}
			}
		}
	})
	return nil
}

// IngestEvent receives k8s events from the agent and forwards them to ProcessEvent.
// This is the HTTP bridge that connects the agent process to Stellar's notification system.
func (h *StellarHandler) IngestEvent(c *fiber.Ctx) error {
	var event IncomingEvent
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid event"})
	}
	
	// Validate required fields
	if event.Cluster == "" || event.Namespace == "" || event.Name == "" || event.Type == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing required fields"})
	}
	
	// Process event asynchronously (non-blocking)
	go h.ProcessEvent(context.Background(), event)
	
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"status": "accepted"})
}

func (h *StellarHandler) ListProviders(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	global := h.providerRegistry.ListProviderInfo(c.UserContext())
	userItems := make([]store.StellarProviderConfig, 0)
	if providerStore, ok := h.store.(interface {
		GetUserProviderConfigs(context.Context, string) ([]store.StellarProviderConfig, error)
	}); ok {
		items, _ := providerStore.GetUserProviderConfigs(c.UserContext(), userID)
		for i := range items {
			if len(items[i].APIKeyEnc) > 0 {
				if raw, err := providers.DecryptAPIKey(items[i].APIKeyEnc); err == nil {
					items[i].APIKeyMask = providers.MaskAPIKey(raw)
				}
			}
		}
		userItems = items
	}
	return c.JSON(fiber.Map{"global": global, "user": userItems})
}

func (h *StellarHandler) CreateProvider(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var req struct {
		Provider    string `json:"provider"`
		DisplayName string `json:"displayName"`
		APIKey      string `json:"apiKey"`
		Model       string `json:"model"`
		BaseURL     string `json:"baseUrl"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	upsert, ok := h.store.(interface {
		UpsertProviderConfig(context.Context, *store.StellarProviderConfig) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	keyEnc := []byte{}
	if strings.TrimSpace(req.APIKey) != "" {
		enc, err := providers.EncryptAPIKey(strings.TrimSpace(req.APIKey))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		keyEnc = enc
	}
	cfg := &store.StellarProviderConfig{
		UserID:      userID,
		Provider:    strings.TrimSpace(req.Provider),
		DisplayName: strings.TrimSpace(req.DisplayName),
		BaseURL:     strings.TrimSpace(req.BaseURL),
		Model:       strings.TrimSpace(req.Model),
		APIKeyEnc:   keyEnc,
		IsActive:    true,
	}
	if err := upsert.UpsertProviderConfig(c.UserContext(), cfg); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save provider"})
	}
	cfg.APIKeyMask = providers.MaskAPIKey(req.APIKey)
	return c.Status(fiber.StatusCreated).JSON(cfg)
}

func (h *StellarHandler) DeleteProvider(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	id := strings.TrimSpace(c.Params("id"))
	del, ok := h.store.(interface {
		DeleteProviderConfig(context.Context, string, string) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	if err := del.DeleteProviderConfig(c.UserContext(), id, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "delete failed"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) SetDefaultProvider(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	id := strings.TrimSpace(c.Params("id"))
	setter, ok := h.store.(interface {
		SetUserDefaultProvider(context.Context, string, string) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	if err := setter.SetUserDefaultProvider(c.UserContext(), userID, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to set default"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) TestProvider(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	id := strings.TrimSpace(c.Params("id"))
	providerStore, ok := h.store.(interface {
		GetUserProviderConfigs(context.Context, string) ([]store.StellarProviderConfig, error)
		UpdateProviderLatency(context.Context, string, int) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	configs, err := providerStore.GetUserProviderConfigs(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load provider config"})
	}
	var cfg *store.StellarProviderConfig
	for i := range configs {
		if configs[i].ID == id {
			cfg = &configs[i]
			break
		}
	}
	if cfg == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "provider not found"})
	}
	rawKey := ""
	if len(cfg.APIKeyEnc) > 0 {
		rawKey, err = providers.DecryptAPIKey(cfg.APIKeyEnc)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid encrypted API key"})
		}
	}
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = providers.ProviderDefaults[cfg.Provider].BaseURL
	}
	var p providers.Provider
	if cfg.Provider == "anthropic" {
		p = providers.NewAnthropicProvider(rawKey)
	} else if cfg.Provider == "ollama" {
		p = providers.NewOllama(baseURL)
	} else {
		p = providers.NewOpenAICompat(baseURL, rawKey, cfg.Provider)
	}
	testCtx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
	defer cancel()
	health := p.Health(testCtx)
	_ = providerStore.UpdateProviderLatency(c.UserContext(), cfg.ID, health.LatencyMs)
	return c.JSON(fiber.Map{"available": health.Available, "latencyMs": health.LatencyMs, "error": health.Error})
}

func (h *StellarHandler) processDueActions(ctx context.Context, userID string) error {
	completed, err := h.store.CompleteDueStellarActions(ctx, time.Now().UTC())
	if err != nil {
		return err
	}
	for _, action := range completed {
		if action.UserID != userID {
			continue
		}
		_ = h.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    action.UserID,
			Type:      "MissionUpdate",
			Severity:  "info",
			Title:     "Scheduled action completed",
			Body:      action.Outcome,
			Cluster:   action.Cluster,
			Namespace: action.Namespace,
			ActionID:  action.ID,
			DedupeKey: fmt.Sprintf("action-complete:%s", action.ID),
		})
	}
	return nil
}

func (h *StellarHandler) syncTimelineNotifications(ctx context.Context, userID string) error {
	since := time.Now().UTC().Add(-stellarRecentEventLookbackMin * time.Minute).Format(time.RFC3339)
	events, err := h.store.QueryTimeline(ctx, store.TimelineFilter{
		Since: since,
		Limit: 200,
	})
	if err != nil {
		return err
	}
	for _, event := range events {
		severity := "info"
		eventType := strings.ToLower(strings.TrimSpace(event.EventType))
		if eventType == "warning" {
			severity = "warning"
		}
		if strings.Contains(strings.ToLower(event.Reason), "failed") || strings.Contains(strings.ToLower(event.Reason), "crash") {
			severity = "critical"
		}
		if severity == "info" {
			continue
		}
		body := fmt.Sprintf("I noticed %s in %s/%s on %s. %s", event.Reason, event.Namespace, event.InvolvedObjectName, event.ClusterName, event.Message)
		_ = h.store.CreateStellarNotification(ctx, &store.StellarNotification{
			UserID:    userID,
			Type:      "Event",
			Severity:  severity,
			Title:     event.Reason,
			Body:      body,
			Cluster:   event.ClusterName,
			Namespace: event.Namespace,
			DedupeKey: fmt.Sprintf("%s:%s:%s:%s", event.ClusterName, event.Namespace, event.InvolvedObjectName, event.Reason),
		})
	}
	return nil
}

func (h *StellarHandler) buildState(ctx context.Context, userID string) (*StellarOperationalState, error) {
	state, err := h.buildOperationalState(ctx, userID, "")
	if err != nil {
		return nil, err
	}
	unread, err := h.store.CountUnreadStellarNotifications(ctx, userID)
	if err != nil {
		return nil, err
	}
	state.UnreadAlerts = unread
	return state, nil
}

func (h *StellarHandler) buildOperationalState(ctx context.Context, userID, focusCluster string) (*StellarOperationalState, error) {
	state := &StellarOperationalState{
		GeneratedAt:      time.Now().UTC(),
		ClustersWatching: []string{},
		EventCounts:      map[string]int{"critical": 0, "warning": 0, "info": 0},
		RecentEvents:     []store.ClusterEvent{},
		ActiveMissionIDs: []string{},
		PendingActionIDs: []string{},
	}
	if h.k8sClient != nil {
		clusters, err := h.k8sClient.DeduplicatedClusters(ctx)
		if err != nil {
			clusters, err = h.k8sClient.ListClusters(ctx)
		}
		if err == nil {
			for _, cluster := range clusters {
				state.ClustersWatching = append(state.ClustersWatching, cluster.Name)
				if focusCluster != "" && focusCluster != cluster.Name {
					continue
				}
				events, eventErr := h.k8sClient.GetWarningEvents(ctx, cluster.Name, "", 50)
				if eventErr != nil {
					continue
				}
				for _, event := range events {
					severity := "warning"
					if isCriticalReason(event.Reason) {
						severity = "critical"
					}
					state.EventCounts[severity]++
					state.RecentEvents = append(state.RecentEvents, store.ClusterEvent{
						ID:                 fmt.Sprintf("%s:%s:%s", cluster.Name, event.Namespace, event.Object),
						ClusterName:        cluster.Name,
						Namespace:          event.Namespace,
						EventType:          event.Type,
						Reason:             event.Reason,
						Message:            event.Message,
						InvolvedObjectKind: splitEventObjectKind(event.Object),
						InvolvedObjectName: splitEventObjectName(event.Object),
						EventCount:         event.Count,
						LastSeen:           event.LastSeen,
						FirstSeen:          event.FirstSeen,
					})
				}
			}
		}
	}
	events, err := h.store.QueryTimeline(ctx, store.TimelineFilter{
		Since: time.Now().UTC().Add(-stellarRecentEventLookbackMin * time.Minute).Format(time.RFC3339),
		Limit: 100,
	})
	if err == nil && len(state.RecentEvents) == 0 {
		state.RecentEvents = events
	}
	missions, err := h.store.ListStellarMissions(ctx, userID, 200, 0)
	if err != nil {
		return nil, err
	}
	for _, mission := range missions {
		if mission.Enabled {
			state.ActiveMissionIDs = append(state.ActiveMissionIDs, mission.ID)
		}
	}
	actions, err := h.store.ListStellarActions(ctx, userID, "pending_approval", 200, 0)
	if err != nil {
		return nil, err
	}
	for _, action := range actions {
		state.PendingActionIDs = append(state.PendingActionIDs, action.ID)
	}
	if len(state.RecentEvents) > 20 {
		sort.Slice(state.RecentEvents, func(i, j int) bool {
			return state.RecentEvents[i].LastSeen > state.RecentEvents[j].LastSeen
		})
		state.RecentEvents = state.RecentEvents[:20]
	}
	return state, nil
}

func (h *StellarHandler) buildDigest(ctx context.Context, userID string) (*StellarDigest, error) {
	since := time.Now().UTC().Add(-stellarDigestLookbackHours * time.Hour).Format(time.RFC3339)
	events, err := h.store.QueryTimeline(ctx, store.TimelineFilter{
		Since: since,
		Limit: 500,
	})
	if err != nil {
		return nil, err
	}
	incidents := make([]string, 0)
	changes := make([]string, 0)
	recommendations := make([]string, 0)
	warnings := 0
	for _, event := range events {
		reason := strings.ToLower(strings.TrimSpace(event.Reason))
		if strings.Contains(reason, "failed") || strings.Contains(reason, "crash") {
			incidents = append(incidents, fmt.Sprintf("%s/%s in %s reported %s", event.Namespace, event.InvolvedObjectName, event.ClusterName, event.Reason))
			warnings++
			continue
		}
		changes = append(changes, fmt.Sprintf("%s in %s (%s)", event.Reason, event.ClusterName, event.InvolvedObjectName))
	}
	if warnings > 0 {
		recommendations = append(recommendations, "Review recent critical and warning events, then run a focused log collection mission.")
	}
	if len(changes) > 0 {
		recommendations = append(recommendations, "Validate rollout status for workloads changed in the last 24 hours.")
	}
	if len(recommendations) == 0 {
		recommendations = append(recommendations, "No major issues detected overnight. Continue with regular health checks.")
	}
	overall := "All watched clusters looked stable in the last 24 hours."
	if warnings > 0 {
		overall = fmt.Sprintf("I detected %d notable incident signals across watched clusters in the last 24 hours.", warnings)
	}
	if len(incidents) > 12 {
		incidents = incidents[:12]
	}
	if len(changes) > 12 {
		changes = changes[:12]
	}
	digest := &StellarDigest{
		GeneratedAt:        time.Now().UTC(),
		WindowHours:        stellarDigestLookbackHours,
		OverallHealth:      overall,
		Incidents:          incidents,
		Changes:            changes,
		RecommendedActions: recommendations,
	}
	_ = h.store.CreateStellarNotification(ctx, &store.StellarNotification{
		UserID:    userID,
		Type:      "Digest",
		Severity:  "info",
		Title:     "Daily Stellar digest",
		Body:      digest.OverallHealth,
		DedupeKey: "digest:" + time.Now().UTC().Format("2006-01-02"),
	})
	return digest, nil
}

func readListLimit(c *fiber.Ctx) int {
	limit := stellarDefaultListLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > stellarMaxListLimit {
		limit = stellarMaxListLimit
	}
	return limit
}

func readListOffset(c *fiber.Ctx) int {
	offset := 0
	if raw := strings.TrimSpace(c.Query("offset")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			offset = v
		}
	}
	return offset
}

func resolveStellarUserID(c *fiber.Ctx) string {
	if id := middleware.GetUserID(c); id != uuid.Nil {
		return id.String()
	}
	if login := middleware.GetGitHubLogin(c); login != "" {
		return login
	}
	return ""
}

func parseMissionPayload(c *fiber.Ctx) (*store.StellarMission, error) {
	var body upsertStellarMissionRequest
	if err := c.BodyParser(&body); err != nil {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid JSON body")
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" || len(body.Name) > stellarMaxNameLength {
		return nil, fiber.NewError(fiber.StatusBadRequest, "name is required and must be <= 120 chars")
	}
	body.Goal = strings.TrimSpace(body.Goal)
	if body.Goal == "" || len(body.Goal) > stellarMaxGoalLength {
		return nil, fiber.NewError(fiber.StatusBadRequest, "goal is required and must be <= 5000 chars")
	}
	body.Schedule = strings.TrimSpace(body.Schedule)
	if len(body.Schedule) > stellarMaxScheduleLength {
		return nil, fiber.NewError(fiber.StatusBadRequest, "schedule must be <= 128 chars")
	}
	body.TriggerType = strings.TrimSpace(body.TriggerType)
	if body.TriggerType == "" {
		body.TriggerType = stellarDefaultTriggerType
	}
	if !stellarAllowedTriggerTypes[body.TriggerType] {
		return nil, fiber.NewError(fiber.StatusBadRequest, "invalid triggerType")
	}
	body.ProviderPolicy = strings.TrimSpace(body.ProviderPolicy)
	if body.ProviderPolicy == "" {
		body.ProviderPolicy = stellarDefaultProviderPolicy
	}
	body.MemoryScope = strings.TrimSpace(body.MemoryScope)
	if body.MemoryScope == "" {
		body.MemoryScope = stellarDefaultMemoryScope
	}
	if len(body.ToolBindings) > stellarMaxToolsPerMission {
		return nil, fiber.NewError(fiber.StatusBadRequest, "too many toolBindings")
	}
	tools := make([]string, 0, len(body.ToolBindings))
	for _, tool := range body.ToolBindings {
		tool = strings.TrimSpace(tool)
		if tool == "" {
			continue
		}
		if len(tool) > stellarMaxToolNameLength {
			return nil, fiber.NewError(fiber.StatusBadRequest, "tool name too long")
		}
		tools = append(tools, tool)
	}
	return &store.StellarMission{
		Name:           body.Name,
		Goal:           body.Goal,
		Schedule:       body.Schedule,
		TriggerType:    body.TriggerType,
		ProviderPolicy: body.ProviderPolicy,
		MemoryScope:    body.MemoryScope,
		Enabled:        body.Enabled,
		ToolBindings:   tools,
	}, nil
}

func writeSSE(w *bufio.Writer, event string, data interface{}) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload); err != nil {
		return err
	}
	return w.Flush()
}

func estimateTokens(text string) int {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) == 0 {
		return 0
	}
	// Approximation that is deterministic and cheap: ~4 chars/token.
	return len(runes)/4 + 1
}

func buildQuickAskResponse(prompt, cluster string, state *StellarOperationalState) string {
	lowerPrompt := strings.ToLower(prompt)
	if strings.Contains(lowerPrompt, "pending") && strings.Contains(lowerPrompt, "action") {
		return fmt.Sprintf("I currently have %d action(s) pending approval. I can walk you through each one before you confirm.", len(state.PendingActionIDs))
	}
	if strings.Contains(lowerPrompt, "mission") {
		return fmt.Sprintf("I’m tracking %d active mission(s) right now. %d alert(s) are still unread in the live feed.", len(state.ActiveMissionIDs), state.UnreadAlerts)
	}
	clusterSummary := "all watched clusters"
	if cluster != "" {
		clusterSummary = cluster
	}
	return fmt.Sprintf("I checked %s. In the recent window I saw %d critical, %d warning, and %d info events. If you want, I can open the most relevant incidents next.",
		clusterSummary,
		state.EventCounts["critical"],
		state.EventCounts["warning"],
		state.EventCounts["info"])
}

func summarizeQuickAsk(prompt, answer string) string {
	prompt = strings.TrimSpace(prompt)
	answer = strings.TrimSpace(answer)
	if len(prompt) > 120 {
		prompt = prompt[:120] + "..."
	}
	if len(answer) > 220 {
		answer = answer[:220] + "..."
	}
	return fmt.Sprintf("Q: %s | A: %s", prompt, answer)
}

func extractObservationSuggest(detail string) string {
	raw := strings.TrimSpace(detail)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToUpper(raw), "SUGGEST:") {
		return strings.TrimSpace(raw[len("SUGGEST:"):])
	}
	return ""
}

func firstOrUnknown(items []string) string {
	if len(items) == 0 {
		return "unknown"
	}
	return items[0]
}

func (h *StellarHandler) resolveProviderAndModel(ctx context.Context, userID, preferredProvider, preferredModel string) (providers.ResolvedProvider, error) {
	if h.providerRegistry == nil {
		h.providerRegistry = providers.NewRegistry()
	}
	userCfg, err := h.resolveUserProvider(ctx, userID)
	if err != nil {
		return providers.ResolvedProvider{}, err
	}
	return h.providerRegistry.Resolve(preferredProvider, preferredModel, userCfg), nil
}

func (h *StellarHandler) resolveUserProvider(ctx context.Context, userID string) (*providers.ResolvedUserProvider, error) {
	providerStore, ok := h.store.(interface {
		GetUserDefaultProvider(context.Context, string) (*store.StellarProviderConfig, error)
	})
	if !ok {
		return nil, nil
	}
	cfg, err := providerStore.GetUserDefaultProvider(ctx, userID)
	if err != nil || cfg == nil {
		return nil, err
	}
	rawKey := ""
	if len(cfg.APIKeyEnc) > 0 {
		rawKey, err = providers.DecryptAPIKey(cfg.APIKeyEnc)
		if err != nil {
			return nil, err
		}
	}
	def := providers.ProviderDefaults[cfg.Provider]
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = def.BaseURL
	}
	var p providers.Provider
	switch cfg.Provider {
	case "ollama":
		p = providers.NewOllama(baseURL)
	case "anthropic":
		p = providers.NewAnthropicProvider(rawKey)
	default:
		p = providers.NewOpenAICompat(baseURL, rawKey, cfg.Provider)
	}
	model := cfg.Model
	if model == "" {
		model = def.DefaultModel
	}
	return &providers.ResolvedUserProvider{Provider: p, Model: model, ConfigID: cfg.ID}, nil
}

func buildLLMContext(state *StellarOperationalState, memories []store.StellarMemoryEntry, tasks []store.StellarTask, cluster string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Time: %s UTC\n", state.GeneratedAt.UTC().Format("2006-01-02 15:04")))
	sb.WriteString(fmt.Sprintf("Clusters: %s\n", strings.Join(state.ClustersWatching, ", ")))
	if cluster != "" {
		sb.WriteString(fmt.Sprintf("Focus: %s\n", cluster))
	}
	sb.WriteString(fmt.Sprintf("\nAlerts — critical: %d  warning: %d  info: %d\n",
		state.EventCounts["critical"],
		state.EventCounts["warning"],
		state.EventCounts["info"],
	))
	if len(state.RecentEvents) > 0 {
		sb.WriteString("\nRecent warning events:\n")
		for _, event := range state.RecentEvents {
			eventTime, _ := time.Parse(time.RFC3339, event.LastSeen)
			age := "unknown"
			if !eventTime.IsZero() {
				age = time.Since(eventTime).Round(time.Minute).String()
			}
			sb.WriteString(fmt.Sprintf(
				"  [%s] %s/%s (%s) — %s — %s ago (×%d)\n",
				strings.ToUpper(inferSeverity(event.EventType, event.Reason)),
				event.Namespace,
				event.InvolvedObjectName,
				event.InvolvedObjectKind,
				event.Message,
				age,
				event.EventCount,
			))
		}
	}
	if len(tasks) > 0 {
		sb.WriteString("\nOpen tasks:\n")
		taskCount := minInt(len(tasks), 3)
		for i := 0; i < taskCount; i++ {
			t := tasks[i]
			sb.WriteString(fmt.Sprintf("  [%s] %s\n", priorityLabel(t.Priority), t.Title))
		}
	}
	if len(memories) > 0 {
		sb.WriteString("\nOperational memory:\n")
		scored := scoreAndSortMemories(memories)
		memoryCount := minInt(len(scored), 5)
		for i := 0; i < memoryCount; i++ {
			memory := scored[i]
			sb.WriteString(fmt.Sprintf("  [%s] %s\n", memory.CreatedAt.UTC().Format("Jan 02 15:04"), memory.Summary))
		}
	}
	return sb.String()
}

func scoreAndSortMemories(memories []store.StellarMemoryEntry) []store.StellarMemoryEntry {
	scored := make([]store.StellarMemoryEntry, 0, len(memories))
	scored = append(scored, memories...)
	sort.Slice(scored, func(i, j int) bool {
		iScore := memoryScore(scored[i])
		jScore := memoryScore(scored[j])
		if iScore == jScore {
			return scored[i].CreatedAt.After(scored[j].CreatedAt)
		}
		return iScore > jScore
	})
	return scored
}

func memoryScore(memory store.StellarMemoryEntry) float64 {
	hours := time.Since(memory.CreatedAt).Hours()
	return float64(memory.Importance*10) - hours
}

func priorityLabel(priority int) string {
	switch {
	case priority <= 3:
		return "HIGH"
	case priority <= 6:
		return "MED"
	default:
		return "LOW"
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func splitEventObjectKind(object string) string {
	parts := strings.SplitN(strings.TrimSpace(object), "/", 2)
	if len(parts) == 2 {
		return parts[0]
	}
	return "Object"
}

func splitEventObjectName(object string) string {
	parts := strings.SplitN(strings.TrimSpace(object), "/", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "unknown"
}

func inferSeverity(eventType, reason string) string {
	if strings.EqualFold(strings.TrimSpace(eventType), "warning") {
		if isCriticalReason(reason) {
			return "critical"
		}
		return "warning"
	}
	return "info"
}

func isCriticalReason(reason string) bool {
	criticals := []string{"OOM", "BackOff", "Failed", "FailedMount", "Evicted", "NodeNotReady", "CrashLoopBackOff"}
	for _, candidate := range criticals {
		if strings.Contains(reason, candidate) {
			return true
		}
	}
	return false
}

func isDestructiveAction(t string) bool {
	return t == "DeleteCluster" || t == "DeletePod" || t == "CordonNode"
}

func sanitizePromptInput(s string) string {
	s = strings.ReplaceAll(s, "```", "'''")
	s = strings.ReplaceAll(s, "<system>", "")
	s = strings.ReplaceAll(s, "</system>", "")
	s = strings.ReplaceAll(s, "[INST]", "")
	s = strings.ReplaceAll(s, "[/INST]", "")
	if len(s) > 2000 {
		s = s[:2000]
	}
	return strings.TrimSpace(s)
}

func ptr[T any](v T) *T { return &v }

func truncateString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}


// Watch handlers
func (h *StellarHandler) ListWatches(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	watches, err := h.store.(interface {
		GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	}).GetActiveWatches(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load watches"})
	}
	return c.JSON(fiber.Map{"items": watches})
}

type createWatchRequest struct {
	Cluster      string `json:"cluster"`
	Namespace    string `json:"namespace"`
	ResourceKind string `json:"resourceKind"`
	ResourceName string `json:"resourceName"`
	Reason       string `json:"reason"`
}

func (h *StellarHandler) CreateWatch(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body createWatchRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Namespace = strings.TrimSpace(body.Namespace)
	body.ResourceKind = strings.TrimSpace(body.ResourceKind)
	body.ResourceName = strings.TrimSpace(body.ResourceName)
	body.Reason = strings.TrimSpace(body.Reason)
	if body.Cluster == "" || body.ResourceKind == "" || body.ResourceName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cluster, resourceKind, and resourceName are required"})
	}
	watch := &store.StellarWatch{
		UserID:       userID,
		Cluster:      body.Cluster,
		Namespace:    body.Namespace,
		ResourceKind: body.ResourceKind,
		ResourceName: body.ResourceName,
		Reason:       body.Reason,
		Status:       "active",
	}
	id, err := h.store.(interface {
		CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	}).CreateWatch(c.UserContext(), watch)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create watch"})
	}
	watch.ID = id
	return c.Status(fiber.StatusCreated).JSON(watch)
}

func (h *StellarHandler) ResolveWatch(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.(interface {
		ResolveWatch(ctx context.Context, id string) error
	}).ResolveWatch(c.UserContext(), watchID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to resolve watch"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) DismissWatch(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.(interface {
		UpdateWatchStatus(ctx context.Context, id, status, lastUpdate string) error
	}).UpdateWatchStatus(c.UserContext(), watchID, "dismissed", ""); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to dismiss watch"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// ─── Sprint 5: Snooze watch ───────────────────────────────────────────────────

func (h *StellarHandler) SnoozeWatch(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	watchID := strings.TrimSpace(c.Params("id"))
	if watchID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body struct {
		Minutes int `json:"minutes"`
	}
	if err := c.BodyParser(&body); err != nil || body.Minutes <= 0 {
		body.Minutes = 60
	}
	until := time.Now().Add(time.Duration(body.Minutes) * time.Minute)
	if err := h.store.SnoozeWatch(c.UserContext(), watchID, until); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to snooze watch"})
	}
	return c.JSON(fiber.Map{"id": watchID, "snoozedUntil": until.UTC().Format(time.RFC3339)})
}

// ─── Sprint 5: Audit log ──────────────────────────────────────────────────────

func (h *StellarHandler) ListAuditLog(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	limit := readListLimit(c)
	entries, err := h.store.ListStellarAuditLog(c.UserContext(), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load audit log"})
	}
	return c.JSON(fiber.Map{"items": entries})
}

// ─── Observability: Health endpoint ───────────────────────────────────────────

// Health returns a snapshot of Stellar's operational status so operators can
// verify SSE connectivity, provider availability, and background goroutine health.
func (h *StellarHandler) Health(c *fiber.Ctx) error {
	ctx := c.UserContext()

	h.sseClientsMu.RLock()
	clientCount := len(h.sseClients)
	h.sseClientsMu.RUnlock()

	unread, _ := h.store.CountUnreadStellarNotifications(ctx, "system")
	recentCount, _ := h.store.CountRecentEventsForResource(ctx, "", "", "", 1*time.Hour)

	resolved, resolveErr := h.resolveProviderAndModel(ctx, "system", "", "")
	providerName := ""
	modelName := ""
	providerAvailable := false
	if resolveErr == nil && resolved.Provider != nil {
		providerName = resolved.Provider.Name()
		modelName = resolved.Model
		health := resolved.Provider.Health(ctx)
		providerAvailable = health.Available
	}

	return c.JSON(fiber.Map{
		"status":              "ok",
		"sseClientsConnected": clientCount,
		"unreadNotifications": unread,
		"eventsLastHour":      recentCount,
		"provider":            providerName,
		"model":               modelName,
		"providerAvailable":   providerAvailable,
		"ts":                  time.Now().UTC(),
	})
}

// ─── Sprint 5: Catch-up summary ───────────────────────────────────────────────

func (h *StellarHandler) pushCatchUpSummary(ctx context.Context, w *bufio.Writer, userID string, since time.Time) {
	// Give SSE stream 2 seconds to establish before pushing
	time.Sleep(2 * time.Second)

	notifications, _ := h.store.GetNotificationsSince(ctx, since)
	resolvedWatches, _ := h.store.GetWatchesSince(ctx, userID, since, "resolved")
	activeWatches, _ := h.store.GetActiveWatches(ctx, userID)
	memories, _ := h.store.GetRecentMemoryEntries(ctx, userID, "", 5)

	if len(notifications) == 0 && len(resolvedWatches) == 0 {
		// Nothing happened — push clean bill of health
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": fmt.Sprintf("All clear while you were away (%s). Nothing notable happened.", formatDuration(time.Since(since))),
			"kind":    "clean",
		})
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("The operator was away for %s (since %s UTC).\n\n",
		formatDuration(time.Since(since)), since.UTC().Format("15:04")))

	if len(notifications) > 0 {
		sb.WriteString(fmt.Sprintf("Events that fired (%d):\n", len(notifications)))
		for _, n := range notifications {
			sb.WriteString(fmt.Sprintf("  [%s] %s: %s\n", n.Severity, n.Title, truncateString(n.Body, 100)))
		}
	}
	if len(resolvedWatches) > 0 {
		sb.WriteString(fmt.Sprintf("\nWatches resolved (%d):\n", len(resolvedWatches)))
		for _, rw := range resolvedWatches {
			sb.WriteString(fmt.Sprintf("  ✓ %s/%s — %s\n", rw.Namespace, rw.ResourceName, rw.LastUpdate))
		}
	}
	if len(activeWatches) > 0 {
		sb.WriteString(fmt.Sprintf("\nStill watching (%d resources).\n", len(activeWatches)))
	}
	_ = memories // available for future enrichment

	resolved, err := h.resolveProviderAndModel(ctx, userID, "", "")
	if err != nil || resolved.Provider == nil {
		// Fallback: push raw summary without LLM
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": sb.String(),
			"kind":    "summary",
		})
		return
	}

	resp, err := resolved.Provider.Generate(ctx, providers.GenerateRequest{
		Model: resolved.Model, MaxTokens: 250, Temperature: 0.3,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.CatchUp},
			{Role: "user", Content: sb.String()},
		},
	})
	if err != nil {
		slog.Warn("stellar: catch-up summary LLM call failed", "error", err)
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": sb.String(),
			"kind":    "summary",
		})
		return
	}

	slog.Info("stellar: catch-up summary generated", "tokens", len(resp.Content), "model", resolved.Model)
	_ = writeSSE(w, "catchup", map[string]string{
		"summary": resp.Content,
		"kind":    "summary",
	})
	_ = h.store.SetUserLastDigest(ctx, userID)
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

// IncomingEvent is the normalized shape Stellar expects from the console's event pipeline.
// The implementing agent maps whatever shape the console uses to this struct.
type IncomingEvent struct {
	Cluster   string
	Namespace string
	Name      string // resource name (pod, deployment, etc.)
	Kind      string // resource kind
	Reason    string // k8s event Reason field
	Message   string // k8s event Message field
	Type      string // "Warning" | "Normal"
	Count     int32
}

// noiseReasons are k8s event reasons that are never worth showing to the user.
var noiseReasons = map[string]bool{
	"Pulling": true, "Pulled": true, "Created": true,
	"Started": true, "Scheduled": true, "SuccessfulCreate": true,
	"ScalingReplicaSet": true, "SuccessfulDelete": true,
	"NoPods": true, "SuccessfulRescale": true,
}

// classifyEvent determines severity and whether the event is noise.
// Pure rule-based — runs in microseconds, no LLM.
func classifyEvent(e IncomingEvent) (severity string, isNoise bool) {
	if noiseReasons[e.Reason] {
		return "", true
	}
	if isCriticalReason(e.Reason) {
		return "critical", false
	}
	if strings.EqualFold(e.Type, "Warning") {
		return "warning", false
	}
	// Normal events that aren't noise are still not worth the sidebar
	return "", true
}

// narrateEventFast generates a rule-based narration — instant, no LLM.
func narrateEventFast(e IncomingEvent, recurring bool, recentCount int64) string {
	recurringStr := ""
	if recurring {
		recurringStr = fmt.Sprintf(" This has happened %d times in the last hour.", recentCount)
	}
	switch e.Reason {
	case "CrashLoopBackOff":
		return fmt.Sprintf("I'm seeing %s/%s crash-looping on %s.%s Want me to pull the logs?",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "OOMKilling", "OOMKilled":
		return fmt.Sprintf("%s/%s was killed on %s — out of memory.%s Consider increasing the memory limit.",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "BackOff":
		return fmt.Sprintf("Container restart back-off for %s/%s on %s.%s",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "Evicted":
		return fmt.Sprintf("%s/%s was evicted from %s.%s Node may be under resource pressure.",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "NodeNotReady":
		return fmt.Sprintf("Node %s in cluster %s is not ready.%s This may affect scheduling.",
			e.Name, e.Cluster, recurringStr)
	case "FailedScheduling":
		return fmt.Sprintf("Cannot schedule %s/%s on %s — insufficient resources or constraints.%s",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	case "FailedMount":
		return fmt.Sprintf("Volume mount failed for %s/%s on %s.%s Check PV/PVC bindings.",
			e.Namespace, e.Name, e.Cluster, recurringStr)
	default:
		return fmt.Sprintf("%s on %s/%s in cluster %s: %s%s",
			e.Reason, e.Namespace, e.Name, e.Cluster, truncateString(e.Message, 120), recurringStr)
	}
}

// ProcessEvent processes an incoming k8s event from the console's event pipeline.
// 5-step pipeline: dedup → classify → recurring check → narrate → store + broadcast.
func (h *StellarHandler) ProcessEvent(ctx context.Context, event IncomingEvent) {
	// STEP 1 — DEDUP: cluster:namespace:name:reason keyed, 5-minute TTL via DB
	dedupKey := fmt.Sprintf("ev:%s:%s:%s:%s",
		event.Cluster, event.Namespace, event.Name, event.Reason)

	exists, _ := h.store.NotificationExistsByDedup(ctx, "system", dedupKey)
	if exists {
		return
	}

	// STEP 2 — EVALUATE: LLM-driven classification with rule-based fallback
	evaluator := stellar.NewStellarEvaluator(h.providerRegistry)
	rawEvent := stellar.RawK8sEvent{
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		Kind:      event.Kind,
		Name:      event.Name,
		Reason:    event.Reason,
		Message:   event.Message,
		Type:      event.Type,
		Count:     event.Count,
	}
	resolved, resolveErr := h.resolveProviderAndModel(ctx, "system", "", "")
	var eval *stellar.EvaluationResult
	if resolveErr != nil || resolved.Provider == nil {
		eval = evaluator.FallbackEvaluate(rawEvent)
	} else {
		eval, _ = evaluator.Evaluate(ctx, rawEvent, resolved)
		if eval == nil {
			eval = evaluator.FallbackEvaluate(rawEvent)
		}
	}
	if !eval.ShouldShow {
		slog.Debug("stellar: filtered event",
			"reason", event.Reason,
			"ns", event.Namespace,
			"name", event.Name,
			"severity", eval.Severity,
			"reasoning", eval.Reasoning)
		return
	}
	severity := eval.Severity

	// STEP 3 — RECURRING CHECK: escalate warnings that repeat 3+ times in 1h
	recentCount, _ := h.store.CountRecentEventsForResource(ctx,
		event.Cluster, event.Namespace, event.Name, 1*time.Hour)
	isRecurring := recentCount >= 3
	if isRecurring && severity == "warning" {
		severity = "critical" // escalate recurring warnings
	}

	// STEP 4 — NARRATE: fast rule-based first, async LLM enrichment second
	body := narrateEventFast(event, isRecurring, recentCount)

	// Build title with recurring prefix
	titlePrefix := ""
	if isRecurring {
		titlePrefix = "↺ Recurring — "
	}
	title := fmt.Sprintf("%s%s — %s/%s", titlePrefix, event.Reason, event.Namespace, event.Name)

	// STEP 5 — STORE + BROADCAST immediately with rule-based narration
	notif := &store.StellarNotification{
		UserID:    "system",
		Type:      "event",
		Severity:  severity,
		Title:     title,
		Body:      body,
		Cluster:   event.Cluster,
		Namespace: event.Namespace,
		DedupeKey: dedupKey,
		Read:      false,
		CreatedAt: time.Now(),
	}

	err := h.store.CreateStellarNotification(ctx, notif)
	if err != nil {
		slog.Error("stellar: ProcessEvent CreateNotification failed", "error", err)
		return
	}

	// Broadcast immediately to all connected SSE clients
	h.broadcastToClients(SSEEvent{Type: "notification", Data: notif})
	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "notification", Data: notif})
	}

	// STEP 5.5 — LOG STELLAR'S ANALYSIS, IN ITS OWN WORDS.
	//
	// For non-critical or non-actionable events, the log gets a single "noticed"
	// row. For critical events, ProcessEvent only writes ROW 1 (critical_event)
	// here — the autonomous loop in autoTriggerSolve owns the rest of the
	// narrative (investigating → root_cause → solving → resolved) so the card
	// progress and log story stay in lockstep.
	recAction := ""
	recReason := ""
	if eval.RecommendedAction != nil {
		recAction = eval.RecommendedAction.Type
		recReason = eval.RecommendedAction.Reasoning
	}
	workload := deploymentNameFromPodName(event.Name)

	if severity == "critical" {
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "critical_event",
			EventID:   notif.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Critical event: %s on %s/%s", event.Reason, event.Namespace, event.Name),
			Detail:    body,
			Severity:  severity,
		})
	} else {
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "evaluated",
			EventID:   notif.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Noticed %s on %s/%s", event.Reason, event.Namespace, event.Name),
			Detail:    body,
			Severity:  severity,
		})
	}
	// For non-critical events, keep the diagnosis row visible so the operator
	// can scan reasoning even when no auto-solve runs.
	if severity != "critical" {
		diagnosisDetail := eval.Reasoning
		if diagnosisDetail == "" {
			diagnosisDetail = fmt.Sprintf("Severity: %s. Recurring: %v (last hour: %d). Message: %s",
				severity, isRecurring, recentCount, truncateString(event.Message, 200))
		}
		if recAction != "" {
			diagnosisDetail = fmt.Sprintf("%s\n\nRecommendation: %s — %s", diagnosisDetail, recAction, recReason)
		}
		h.logActivity(ctx, &store.StellarActivity{
			Kind:      "diagnosed",
			EventID:   notif.ID,
			Cluster:   event.Cluster,
			Namespace: event.Namespace,
			Workload:  workload,
			Title:     fmt.Sprintf("Diagnosed: %s", deriveDiagnosisHeadline(event, severity, isRecurring)),
			Detail:    diagnosisDetail,
			Severity:  severity,
		})
	}

	// STEP 6 — AUTO-TEND.
	// Junior-engineer policy: if the evaluator recommends an action AND this
	// issue isn't already recurring, Stellar just does it. The user finds out
	// via the resulting "Stellar auto-fixed" notification + green success toast.
	// On recurrence the path demotes to pending_approval — if the first fix
	// didn't hold, the human needs to weigh in before Stellar retries.
	// autoExecuteAction internally falls back to queueAutoTendAction for any
	// action type that isn't on the safe-auto allowlist (only RestartDeployment today).
	if eval.RecommendedAction != nil && eval.RecommendedAction.Type != "" {
		if isRecurring {
			h.queueAutoTendAction(ctx, event, eval.RecommendedAction, notif.ID)
		} else if severity != "critical" {
			// Critical events go through autoTriggerSolve below, which owns the
			// full narrative (investigating → restart try → mission if needed).
			// Letting autoExecuteAction run in parallel would split the activity
			// log and double-act on the same workload.
			h.autoExecuteAction(ctx, event, eval.RecommendedAction, notif.ID)
		}
	}

	// STEP 7 — AUTONOMOUS SOLVE (Stellar v2).
	// Every critical event triggers the autonomous solve narrative. We don't
	// gate on RecommendedAction — the AI mission decides what to do from the
	// event context. The narrative drives both the card progress bar and the
	// activity log story (investigating → root_cause → solving → resolved).
	if severity == "critical" {
		h.autoTriggerSolve(ctx, event, notif, eval)
	}

	slog.Info("stellar: ProcessEvent",
		"cluster", event.Cluster,
		"ns", event.Namespace,
		"name", event.Name,
		"reason", event.Reason,
		"severity", severity,
		"recurring", isRecurring,
		"recentCount", recentCount,
		"autoAction", recommendedTypeOrEmpty(eval.RecommendedAction))

	// Async LLM narration — replaces the fast narration when ready
	go func() {
		resolved, resolveErr := h.resolveProviderAndModel(ctx, "system", "", "")
		if resolveErr != nil || resolved.Provider == nil {
			return
		}
		historyNote := ""
		if isRecurring {
			historyNote = fmt.Sprintf("\nThis same resource has had %d events in the last hour.", recentCount)
		}
		resp, genErr := resolved.Provider.Generate(ctx, providers.GenerateRequest{
			Model: resolved.Model, MaxTokens: 120, Temperature: 0.3,
			Messages: []providers.Message{
				{Role: "system", Content: prompts.EventNarration},
				{Role: "user", Content: fmt.Sprintf(
					"Event: %s on %s/%s in cluster %s\nReason: %s\nMessage: %s\nCount: %d%s",
					event.Kind, event.Namespace, event.Name, event.Cluster,
					event.Reason, event.Message, event.Count, historyNote,
				)},
			},
		})
		if genErr == nil && resp.Content != "" {
			if updateErr := h.store.UpdateNotificationBody(ctx, dedupKey, resp.Content); updateErr == nil {
				// Push updated narration to SSE clients so they see the richer body
				h.broadcastToClients(SSEEvent{Type: "notification_update", Data: map[string]string{
					"dedupKey": dedupKey,
					"body":     resp.Content,
				}})
			}
		}
	}()

	// Auto-create watch for critical or recurring events so the user gets follow-up
	if isRecurring || severity == "critical" {
		h.autoCreateWatch(ctx, event)
	}

	// Critical events → persistent memory for future LLM context
	if severity == "critical" {
		_ = h.store.CreateStellarMemoryEntry(ctx, &store.StellarMemoryEntry{
			UserID:     "system",
			Cluster:    event.Cluster,
			Category:   "incident",
			Importance: 8,
			Summary: fmt.Sprintf("%s on %s/%s: %s",
				event.Reason, event.Namespace, event.Name, truncateString(body, 200)),
			ExpiresAt: ptr(time.Now().AddDate(0, 0, 90)),
			CreatedAt: time.Now(),
		})
	}
}

// recommendedTypeOrEmpty returns the recommended action type for log output, or "".
func recommendedTypeOrEmpty(r *stellar.RecommendedAction) string {
	if r == nil {
		return ""
	}
	return r.Type
}

// autoExecuteAction runs the recommended remediation IMMEDIATELY (no user
// approval). Reserved for critical + first-occurrence events — see ProcessEvent
// gate. Records a completed StellarAction, an execution record, an audit entry,
// and a prominent notification telling the user what Stellar just did. If the
// same issue recurs, the caller falls back to queueAutoTendAction so the user
// gets a chance to intervene before Stellar repeats a fix that didn't hold.
func (h *StellarHandler) autoExecuteAction(ctx context.Context, e IncomingEvent, rec *stellar.RecommendedAction, notifID string) {
	if rec.Type != "RestartDeployment" {
		// Only restart is safe to auto-execute today. Scale/Delete etc. always go
		// through approval — wider safety review needed before adding them here.
		h.queueAutoTendAction(ctx, e, rec, notifID)
		return
	}

	idempotencyKey := fmt.Sprintf("auto-exec:%s:%s:%s:%s",
		rec.Type, e.Cluster, e.Namespace, e.Name)
	if h.store.ActionCompletedByIdempotencyKey(ctx, idempotencyKey) {
		return
	}

	params := map[string]any{
		"namespace": e.Namespace,
		"name":      deploymentNameFromPodName(e.Name),
	}
	paramsJSON, _ := json.Marshal(params)

	now := time.Now().UTC()
	action := &store.StellarAction{
		UserID:         "system",
		Description:    fmt.Sprintf("Auto-executed: restart %s/%s (critical %s)", e.Namespace, e.Name, e.Reason),
		ActionType:     rec.Type,
		Parameters:     string(paramsJSON),
		Cluster:        e.Cluster,
		Namespace:      e.Namespace,
		Status:         "approved",
		CreatedBy:      "stellar",
		ApprovedBy:     "stellar-auto",
		ApprovedAt:     &now,
		IdempotencyKey: idempotencyKey,
		MaxRetries:     0,
	}
	if err := h.store.CreateStellarAction(ctx, action); err != nil {
		slog.Warn("stellar: auto-exec CreateAction failed", "error", err)
		return
	}

	_ = h.store.UpdateStellarActionStatus(ctx, action.ID, "running", "", "")

	execCtx, cancel := context.WithTimeout(ctx, executeActionMaxTimeout)
	defer cancel()
	outcome, dispatchErr := scheduler.Dispatch(execCtx, h.k8sClient, *action)
	durationMs := int(time.Since(now).Milliseconds())

	status := "completed"
	if dispatchErr != nil {
		status = "failed"
		outcome = dispatchErr.Error()
		slog.Error("stellar: auto-exec dispatch failed", "action_id", action.ID, "error", dispatchErr)
	}
	_ = h.store.UpdateStellarActionStatus(ctx, action.ID, status, outcome, "")

	completedAt := time.Now().UTC()
	_ = h.store.CreateStellarExecution(ctx, &store.StellarExecution{
		UserID:      "system",
		MissionID:   "auto-tend",
		TriggerType: "auto-execute",
		TriggerData: fmt.Sprintf(`{"actionType":"%s","cluster":"%s","reason":"%s"}`, rec.Type, e.Cluster, e.Reason),
		Status:      status,
		RawInput:    rec.Reasoning,
		Output:      outcome,
		DurationMs:  durationMs,
		StartedAt:   now,
		CompletedAt: &completedAt,
	})

	if auditable, ok := h.store.(interface {
		CreateAuditEntry(context.Context, *store.StellarAuditEntry) error
	}); ok {
		_ = auditable.CreateAuditEntry(ctx, &store.StellarAuditEntry{
			UserID:     "stellar-auto",
			Action:     "auto_execute_action",
			EntityType: "action",
			EntityID:   action.ID,
			Cluster:    e.Cluster,
			Detail:     fmt.Sprintf("%s on %s/%s (critical %s)", rec.Type, e.Namespace, e.Name, e.Reason),
		})
	}

	notifTitle := fmt.Sprintf("Stellar auto-fixed: %s", rec.Type)
	notifSeverity := "info"
	notifBody := fmt.Sprintf("Critical event detected on %s/%s — Stellar executed %s without waiting for approval.\n\n%s\n\nResult: %s\n\nIf this recurs, Stellar will ask for approval before retrying.",
		e.Namespace, e.Name, rec.Type, rec.Reasoning, outcome)
	if status == "failed" {
		notifTitle = fmt.Sprintf("Stellar auto-fix failed: %s", rec.Type)
		notifSeverity = "warning"
	}
	resultNotif := &store.StellarNotification{
		UserID:    "system",
		Type:      "action",
		Severity:  notifSeverity,
		Title:     notifTitle,
		Body:      notifBody,
		Cluster:   e.Cluster,
		Namespace: e.Namespace,
		ActionID:  action.ID,
		DedupeKey: fmt.Sprintf("auto-exec-result:%s", action.ID),
	}
	_ = h.store.CreateStellarNotification(ctx, resultNotif)
	// CRITICAL: broadcast over SSE so the toast bridge sees this live. Without
	// this, the notification is only visible after the frontend refetches state.
	h.broadcastToClients(SSEEvent{Type: "notification", Data: resultNotif})

	// Mirror to the activity log so it shows up in the dedicated Stellar log
	// even when the user is on another page and misses the toast.
	activityKind := "auto_fixed"
	if status == "failed" {
		activityKind = "auto_fix_failed"
	}
	h.logActivity(ctx, &store.StellarActivity{
		Kind:      activityKind,
		Cluster:   e.Cluster,
		Namespace: e.Namespace,
		Workload:  deploymentNameFromPodName(e.Name),
		Title:     notifTitle,
		Detail:    fmt.Sprintf("%s — %s", rec.Type, outcome),
		Severity:  notifSeverity,
	})

	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "action_update", Data: map[string]string{
			"id":     action.ID,
			"status": status,
		}})
	}
	slog.Info("stellar: auto-executed",
		"action_id", action.ID, "type", rec.Type, "status", status,
		"cluster", e.Cluster, "ns", e.Namespace, "name", e.Name)
}

// queueAutoTendAction creates a pending_approval StellarAction so the user can
// one-click execute the evaluator's recommended remediation. Never auto-executes —
// the existing approval card UI gates dispatch.
func (h *StellarHandler) queueAutoTendAction(ctx context.Context, e IncomingEvent, rec *stellar.RecommendedAction, notifID string) {
	// Map K8s event resource → Deployment for restart actions. The event Name is
	// usually a Pod; we derive the deployment via the controller chain in production.
	// For the demo path we accept any Name — dispatch will look up by name in the namespace.
	if rec.Type != "RestartDeployment" {
		// Other action types not yet supported for auto-tend.
		return
	}

	// Skip if a recent pending action for the same resource already exists (dedup).
	idempotencyKey := fmt.Sprintf("auto:%s:%s:%s:%s",
		rec.Type, e.Cluster, e.Namespace, e.Name)
	if h.store.ActionCompletedByIdempotencyKey(ctx, idempotencyKey) {
		return
	}

	params := map[string]any{
		"namespace": e.Namespace,
		"name":      deploymentNameFromPodName(e.Name),
	}
	paramsJSON, _ := json.Marshal(params)

	action := &store.StellarAction{
		UserID:         "system",
		Description:    fmt.Sprintf("Auto-queued: restart %s/%s (reason: %s)", e.Namespace, e.Name, e.Reason),
		ActionType:     rec.Type,
		Parameters:     string(paramsJSON),
		Cluster:        e.Cluster,
		Namespace:      e.Namespace,
		Status:         "pending_approval",
		CreatedBy:      "stellar",
		IdempotencyKey: idempotencyKey,
		MaxRetries:     0,
	}
	if err := h.store.CreateStellarAction(ctx, action); err != nil {
		slog.Warn("stellar: auto-tend CreateAction failed", "error", err)
		return
	}

	// Notify the user so the approval card is visible immediately.
	suggestNotif := &store.StellarNotification{
		UserID:    "system",
		Type:      "ActionRequired",
		Severity:  "warning",
		Title:     "Stellar suggests: " + rec.Type,
		Body:      fmt.Sprintf("%s\n\nClick approve to execute, or reject to ignore.", rec.Reasoning),
		Cluster:   e.Cluster,
		Namespace: e.Namespace,
		ActionID:  action.ID,
		DedupeKey: fmt.Sprintf("auto-suggest:%s", action.ID),
	}
	_ = h.store.CreateStellarNotification(ctx, suggestNotif)
	h.broadcastToClients(SSEEvent{Type: "notification", Data: suggestNotif})

	if h.broadcaster != nil {
		h.broadcaster.Broadcast(SSEEvent{Type: "action_update", Data: map[string]string{
			"id":     action.ID,
			"status": "pending_approval",
		}})
	}
	slog.Info("stellar: auto-tend queued",
		"action_id", action.ID, "type", rec.Type,
		"cluster", e.Cluster, "ns", e.Namespace, "name", e.Name)
}

// deploymentNameFromPodName strips the ReplicaSet+Pod suffixes from a pod name to
// derive the parent Deployment name. E.g. "api-server-7d4c5b9f4-abc12" → "api-server".
// If no suffix pattern is detected, returns the input unchanged.
func deploymentNameFromPodName(podName string) string {
	parts := strings.Split(podName, "-")
	if len(parts) < 3 {
		return podName
	}
	// Last two segments are usually <replicaset-hash>-<pod-suffix>
	last := parts[len(parts)-1]
	prev := parts[len(parts)-2]
	if looksLikeRSHash(prev) && len(last) >= 4 && len(last) <= 6 {
		return strings.Join(parts[:len(parts)-2], "-")
	}
	return podName
}

// deriveDiagnosisHeadline produces a short, human-friendly diagnosis line for
// the activity log's "Diagnosed:" row. Keep this under ~60 chars so it fits in
// the log card without truncation.
func deriveDiagnosisHeadline(event IncomingEvent, severity string, recurring bool) string {
	recurringPrefix := ""
	if recurring {
		recurringPrefix = "recurring "
	}
	switch event.Reason {
	case "CrashLoopBackOff":
		return recurringPrefix + "container exits immediately after start — likely bad command, image, or env"
	case "OOMKilling", "OOMKilled":
		return recurringPrefix + "process exceeded memory limit — bump request/limit or fix leak"
	case "BackOff":
		return recurringPrefix + "kubelet is throttling restarts — root cause is upstream"
	case "Evicted":
		return "node under resource pressure evicted this pod"
	case "NodeNotReady":
		return "node lost — pods on it may need rescheduling"
	case "FailedScheduling":
		return "scheduler can't place this pod — capacity, taints, or affinity"
	case "FailedMount":
		return "volume mount failed — check PV/PVC binding and node access"
	default:
		if severity == "critical" {
			return event.Reason + " — looks actionable"
		}
		return event.Reason + " — noted for context"
	}
}

// looksLikeRSHash returns true if s looks like a Kubernetes ReplicaSet hash
// (5–10 lowercase alphanumerics).
func looksLikeRSHash(s string) bool {
	if len(s) < 5 || len(s) > 10 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
}

// autoCreateWatch creates a standing watch for a resource that has critical or
// recurring events, so the observer goroutine will track it and report recovery.
func (h *StellarHandler) autoCreateWatch(ctx context.Context, e IncomingEvent) {
	existing, _ := h.store.GetWatchByResource(ctx, "system", e.Cluster, e.Namespace, e.Kind, e.Name)
	if existing != nil {
		return // already watching
	}
	id, err := h.store.CreateWatch(ctx, &store.StellarWatch{
		UserID:       "system",
		Cluster:      e.Cluster,
		Namespace:    e.Namespace,
		ResourceKind: e.Kind,
		ResourceName: e.Name,
		Reason:       fmt.Sprintf("Auto-watched: %s event", e.Reason),
	})
	if err == nil {
		slog.Info("stellar: auto-created watch", "id", id, "resource", e.Name, "cluster", e.Cluster)
		h.broadcastToClients(SSEEvent{Type: "watch_created", Data: map[string]string{
			"id": id, "cluster": e.Cluster,
		}})
	}
}

