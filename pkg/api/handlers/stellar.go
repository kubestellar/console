package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
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

	QueryTimeline(ctx context.Context, filter store.TimelineFilter) ([]store.ClusterEvent, error)
}

// StellarHandler exposes persistence and operational APIs for the Stellar assistant.
type StellarHandler struct {
	store            StellarStore
	k8sClient        *k8s.MultiClusterClient
	providerRegistry *providers.Registry
}

func NewStellarHandler(s StellarStore, k8sClient *k8s.MultiClusterClient) *StellarHandler {
	return &StellarHandler{
		store:            s,
		k8sClient:        k8sClient,
		providerRegistry: providers.NewRegistry(),
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
	actionID := strings.TrimSpace(c.Params("id"))
	if actionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	if err := h.store.ApproveStellarAction(c.UserContext(), userID, actionID, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to approve action"})
	}
	_ = h.processDueActions(c.UserContext(), userID)
	item, err := h.store.GetStellarAction(c.UserContext(), userID, actionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load action"})
	}
	if item == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "action not found"})
	}
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

	provider, model := h.resolveProviderAndModel(c.UserContext(), "", "")
	if provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}
	response, err := provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       model,
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

func (h *StellarHandler) Ask(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	var body quickAskRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON body"})
	}
	body.Prompt = strings.TrimSpace(body.Prompt)
	body.Cluster = strings.TrimSpace(body.Cluster)
	body.Provider = strings.TrimSpace(body.Provider)
	body.Model = strings.TrimSpace(body.Model)
	if body.Prompt == "" || len(body.Prompt) > stellarMaxPromptLength {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "prompt is required and must be <= 5000 chars"})
	}

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
	contextString := buildLLMContext(state, memories, body.Cluster)

	provider, model := h.resolveProviderAndModel(c.UserContext(), body.Provider, body.Model)
	if provider == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "no AI provider configured"})
	}

	startTime := time.Now()
	generated, err := provider.Generate(c.UserContext(), providers.GenerateRequest{
		Model:       model,
		MaxTokens:   800,
		Temperature: 0.3,
		Messages: []providers.Message{
			{Role: "system", Content: prompts.QuickAsk},
			{Role: "user", Content: "Current cluster state:\n" + contextString + "\n\nQuestion: " + body.Prompt},
		},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "AI provider error: " + err.Error()})
	}
	now := time.Now().UTC()
	durationMs := int(time.Since(startTime).Milliseconds())
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
	})

	return c.JSON(fiber.Map{
		"answer":      generated.Content,
		"executionId": execution.ID,
		"provider":    generated.Provider,
		"model":       generated.Model,
		"tokens":      generated.TokensInput + generated.TokensOutput,
		"durationMs":  durationMs,
		"state":       state,
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

func (h *StellarHandler) Stream(c *fiber.Ctx) error {
	userID := resolveStellarUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not authenticated"})
	}
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(stellarStreamInterval)
		defer ticker.Stop()
		lastSentID := ""
		send := func() bool {
			_ = h.syncTimelineNotifications(context.Background(), userID)
			items, err := h.store.ListStellarNotifications(context.Background(), userID, 30, false)
			if err != nil {
				return writeSSE(w, "error", fiber.Map{"message": "failed to load notifications"}) == nil
			}
			if len(items) > 0 && items[0].ID != lastSentID {
				lastSentID = items[0].ID
				if writeSSE(w, "notifications", fiber.Map{"items": items}) != nil {
					return false
				}
			}
			state, err := h.buildState(context.Background(), userID)
			if err != nil {
				return writeSSE(w, "error", fiber.Map{"message": "failed to build state"}) == nil
			}
			return writeSSE(w, "state", state) == nil
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

func firstOrUnknown(items []string) string {
	if len(items) == 0 {
		return "unknown"
	}
	return items[0]
}

func (h *StellarHandler) resolveProviderAndModel(ctx context.Context, preferredProvider, preferredModel string) (providers.Provider, string) {
	if h.providerRegistry == nil {
		h.providerRegistry = providers.NewRegistry()
	}
	provider, model := h.providerRegistry.GetDefault()
	if preferredProvider != "" {
		if resolved, err := h.providerRegistry.Get(preferredProvider); err == nil && resolved.IsAvailable(ctx) {
			provider = resolved
		}
	}
	if provider != nil && !provider.IsAvailable(ctx) {
		if fallback, fallbackModel := h.providerRegistry.GetDefault(); fallback != nil && fallback.IsAvailable(ctx) {
			provider = fallback
			model = fallbackModel
		}
	}
	if preferredModel != "" {
		model = preferredModel
	}
	return provider, model
}

func buildLLMContext(state *StellarOperationalState, memories []store.StellarMemoryEntry, cluster string) string {
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
	if len(memories) > 0 {
		sb.WriteString("\nOperational memory:\n")
		for _, memory := range memories {
			sb.WriteString(fmt.Sprintf("  [%s] %s\n", memory.CreatedAt.UTC().Format("Jan 02 15:04"), memory.Summary))
		}
	}
	return sb.String()
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
