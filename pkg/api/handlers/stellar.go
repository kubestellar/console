package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/safego"
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
	stellarMaxProviderBaseURLLen  = 2048
	stellarDigestLookbackHours    = 24
	stellarRecentEventLookbackMin = 10
	stellarStreamInterval         = 10 * time.Second
	stellarWatchInactivityTimeout = 30 * time.Minute

	stellarOllamaAllowedCIDRsEnv = "STELLAR_OLLAMA_ALLOWED_CIDRS"
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
	GetExecutionsSince(ctx context.Context, since time.Time) ([]store.StellarExecution, error)
	UpsertUserLastSeen(ctx context.Context, userID string) error
	GetUserLastSeen(ctx context.Context, userID string) (*time.Time, error)
	SetUserLastDigest(ctx context.Context, userID string) error
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error)
	SnoozeWatch(ctx context.Context, id, userID string, until time.Time) error
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
	safego.GoWith("stellar-due-task-reminder", func() { h.dueTaskReminderLoop(ctx) })
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
	validatedBaseURL, err := validateStellarProviderBaseURL(cfg.Provider, baseURL)
	if err != nil {
		return nil, err
	}
	var p providers.Provider
	switch cfg.Provider {
	case "ollama":
		p = providers.NewOllama(validatedBaseURL)
	case "anthropic":
		p = providers.NewAnthropicProvider(rawKey)
	default:
		p = providers.NewOpenAICompat(validatedBaseURL, rawKey, cfg.Provider)
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
