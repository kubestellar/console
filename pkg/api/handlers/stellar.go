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
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/prompts"
	"github.com/kubestellar/console/pkg/stellar/providers"
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
}

// StellarHandler exposes persistence and operational APIs for the Stellar assistant.
type StellarHandler struct {
	store            StellarStore
	k8sClient        *k8s.MultiClusterClient
	providerRegistry *providers.Registry
	broadcaster      SSEBroadcaster
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

type quickAskRequest struct {
	Prompt   string `json:"prompt"`
	Cluster  string `json:"cluster"`
	Provider string `json:"provider"`
	Model    string `json:"model"`
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

	startTime := time.Now()
	generated, err := resolved.Provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       resolved.Model,
		MaxTokens:   800,
		Temperature: 0.3,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.QuickAsk},
			{Role: "user", Content: "Current cluster state:\n" + contextString + "\n\nQuestion: " + body.Prompt},
		},
	})
	fallbackUsed := false
	fallbackReason := ""
	durationMs := int(time.Since(startTime).Milliseconds())
	if err != nil {
		fallbackName := os.Getenv("STELLAR_FALLBACK_PROVIDER")
		if fallbackName != "" && fallbackName != resolved.Provider.Name() {
			if fp, ok := h.providerRegistry.GetGlobal(fallbackName); ok {
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
		for range ticker.C {
			if !send() {
				return
			}
		}
	})
	return nil
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
		_ = writeSSE(w, "catchup", map[string]string{
			"summary": sb.String(),
			"kind":    "summary",
		})
		return
	}

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
