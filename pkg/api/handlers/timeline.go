package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

// eventPollInterval is how often the collector polls clusters for events.
const eventPollInterval = 60 * time.Second

// eventRetentionSweepInterval is how often the retention sweep runs.
const eventRetentionSweepInterval = 1 * time.Hour

// defaultEventRetentionDays is the fallback when KSC_EVENT_RETENTION_DAYS is
// unset or invalid.
const defaultEventRetentionDays = 7

// clusterListTimeout caps the HealthyClusters call in the background
// collector so a hung API server cannot block the event poll loop.
const clusterListTimeout = 15 * time.Second

// eventCollectTimeout is the per-cluster fetch timeout.
const eventCollectTimeout = 15 * time.Second

// eventsPerClusterLimit caps the number of events fetched per cluster per poll.
const eventsPerClusterLimit = 200

// timelineDefaultLimit is the default limit for the GET /api/timeline endpoint.
const timelineDefaultLimit = 100

// timelineMaxLimit is the hard upper bound for timeline query results.
const timelineMaxLimit = 1000

// demoTimelineSpanHours defines how far back demo events extend.
const demoTimelineSpanHours = 24

// ---------------------------------------------------------------------------
// TimelineHandler
// ---------------------------------------------------------------------------

// TimelineHandler serves the GET /api/timeline endpoint and owns the
// background event journal collector goroutine.
type TimelineHandler struct {
	store     store.Store
	k8sClient *k8s.MultiClusterClient
}

// NewTimelineHandler creates a TimelineHandler.
func NewTimelineHandler(s store.Store, k8sClient *k8s.MultiClusterClient) *TimelineHandler {
	return &TimelineHandler{store: s, k8sClient: k8sClient}
}

// GetTimeline handles GET /api/timeline.
// Query params: cluster, namespace, since, until, kind, limit.
func (h *TimelineHandler) GetTimeline(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(demoTimelineEvents())
	}

	filter := store.TimelineFilter{
		Cluster:   c.Query("cluster"),
		Namespace: c.Query("namespace"),
		Since:     c.Query("since"),
		Until:     c.Query("until"),
		Kind:      c.Query("kind"),
	}

	if limitStr := c.Query("limit"); limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			filter.Limit = v
		}
	}
	if filter.Limit <= 0 {
		filter.Limit = timelineDefaultLimit
	}
	if filter.Limit > timelineMaxLimit {
		filter.Limit = timelineMaxLimit
	}

	events, err := h.store.QueryTimeline(c.Context(), filter)
	if err != nil {
		slog.Error("[Timeline] query failed", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to query timeline")
	}
	return c.JSON(events)
}

// ---------------------------------------------------------------------------
// Background collector
// ---------------------------------------------------------------------------

// StartEventCollector launches the background goroutine that polls clusters
// for events and writes them to the store. It stops when done is closed.
func (h *TimelineHandler) StartEventCollector(done <-chan struct{}) {
	if h.k8sClient == nil {
		slog.Info("[Timeline] no k8s client — event collector disabled")
		return
	}
	go h.runCollector(done)
}

func (h *TimelineHandler) runCollector(done <-chan struct{}) {
	slog.Info("[Timeline] event collector started",
		"poll_interval", eventPollInterval,
		"retention_days", retentionDays())

	pollTicker := time.NewTicker(eventPollInterval)
	defer pollTicker.Stop()

	sweepTicker := time.NewTicker(eventRetentionSweepInterval)
	defer sweepTicker.Stop()

	// Run an initial collection immediately.
	h.collectAll()

	for {
		select {
		case <-done:
			slog.Info("[Timeline] event collector stopping")
			return
		case <-pollTicker.C:
			h.collectAll()
		case <-sweepTicker.C:
			h.sweepOld()
		}
	}
}

func (h *TimelineHandler) collectAll() {
	ctx, cancel := context.WithTimeout(context.Background(), clusterListTimeout)
	defer cancel()
	healthy, _, err := h.k8sClient.HealthyClusters(ctx)
	if err != nil {
		slog.Error("[Timeline] failed to list clusters", "error", err)
		return
	}

	var wg sync.WaitGroup
	for _, ci := range healthy {
		wg.Add(1)
		cluster := ci
		safego.GoWith("timeline/"+cluster.Name, func() {
			defer wg.Done()
			h.collectCluster(cluster)
		})
	}
	wg.Wait()
}

func (h *TimelineHandler) collectCluster(ci k8s.ClusterInfo) {
	ctx, cancel := context.WithTimeout(context.Background(), eventCollectTimeout)
	defer cancel()

	events, err := h.k8sClient.GetEvents(ctx, ci.Name, "", eventsPerClusterLimit)
	if err != nil {
		slog.Warn("[Timeline] collect failed",
			"cluster", ci.Name, "error", err)
		return
	}

	var inserted int
	for _, ev := range events {
		kind, name := parseObject(ev.Object)
		ce := store.ClusterEvent{
			ID:                 uuid.NewString(),
			ClusterName:        ci.Name,
			Namespace:          ev.Namespace,
			EventType:          ev.Type,
			Reason:             ev.Reason,
			Message:            ev.Message,
			InvolvedObjectKind: kind,
			InvolvedObjectName: name,
			EventUID:           fmt.Sprintf("%s/%s", ci.Name, ev.Object+"/"+ev.Reason+"/"+ev.Namespace),
			EventCount:         ev.Count,
			FirstSeen:          ev.FirstSeen,
			LastSeen:           ev.LastSeen,
		}
		if ce.FirstSeen == "" {
			ce.FirstSeen = time.Now().UTC().Format(time.RFC3339)
		}
		if ce.LastSeen == "" {
			ce.LastSeen = ce.FirstSeen
		}

		if err := h.store.InsertOrUpdateEvent(ctx, ce); err != nil {
			slog.Warn("[Timeline] upsert failed",
				"cluster", ci.Name, "error", err)
			continue
		}
		inserted++
	}
	if inserted > 0 {
		slog.Debug("[Timeline] collected events",
			"cluster", ci.Name, "count", inserted)
	}
}

// parseObject splits "Kind/Name" into its parts.
func parseObject(obj string) (kind, name string) {
	idx := strings.IndexByte(obj, '/')
	if idx < 0 {
		return obj, ""
	}
	return obj[:idx], obj[idx+1:]
}

func (h *TimelineHandler) sweepOld() {
	ctx, cancel := context.WithTimeout(context.Background(), eventCollectTimeout)
	defer cancel()
	deleted, err := h.store.SweepOldEvents(ctx, retentionDays())
	if err != nil {
		slog.Error("[Timeline] sweep failed", "error", err)
		return
	}
	if deleted > 0 {
		slog.Info("[Timeline] swept old events", "deleted", deleted)
	}
}

func retentionDays() int {
	if v := os.Getenv("KSC_EVENT_RETENTION_DAYS"); v != "" {
		if days, err := strconv.Atoi(v); err == nil && days > 0 {
			return days
		}
	}
	return defaultEventRetentionDays
}

// ---------------------------------------------------------------------------
// Demo mode data
// ---------------------------------------------------------------------------

func demoTimelineEvents() []store.ClusterEvent {
	now := time.Now().UTC()
	clusters := []string{"kind-ks1", "kind-ks2", "gke-prod-us-east1"}
	reasons := []struct {
		reason  string
		evType  string
		kind    string
		name    string
		message string
	}{
		{"ScalingReplicaSet", "Normal", "Deployment", "nginx-ingress", "Scaled up replica set nginx-ingress-7f8b6c to 3"},
		{"SuccessfulCreate", "Normal", "ReplicaSet", "api-server-5d9f8a", "Created pod: api-server-5d9f8a-xk92m"},
		{"Killing", "Normal", "Pod", "worker-batch-j29sl", "Stopping container worker"},
		{"FailedScheduling", "Warning", "Pod", "gpu-train-abc12", "0/4 nodes are available: insufficient nvidia.com/gpu"},
		{"Pulling", "Normal", "Pod", "frontend-v2-lm84n", "Pulling image \"ghcr.io/kubestellar/frontend:v2.1.0\""},
		{"Pulled", "Normal", "Pod", "frontend-v2-lm84n", "Successfully pulled image in 3.2s"},
		{"Started", "Normal", "Pod", "monitoring-agent-qr7x", "Started container prometheus-exporter"},
	}

	events := make([]store.ClusterEvent, 0, len(clusters)*len(reasons))
	for ci, cluster := range clusters {
		for ri, r := range reasons {
			minutesAgo := (ci*len(reasons) + ri) * 47 // spread events over demo window
			if minutesAgo > demoTimelineSpanHours*60 {
				minutesAgo = demoTimelineSpanHours * 60
			}
			t := now.Add(-time.Duration(minutesAgo) * time.Minute)
			events = append(events, store.ClusterEvent{
				ID:                 uuid.NewString(),
				ClusterName:        cluster,
				Namespace:          "default",
				EventType:          r.evType,
				Reason:             r.reason,
				Message:            r.message,
				InvolvedObjectKind: r.kind,
				InvolvedObjectName: r.name,
				EventUID:           fmt.Sprintf("demo-%s-%s-%d", cluster, r.reason, ri),
				EventCount:         1,
				FirstSeen:          t.Format(time.RFC3339),
				LastSeen:           t.Format(time.RFC3339),
				RecordedAt:         t.Format(time.RFC3339),
			})
		}
	}
	return events
}
