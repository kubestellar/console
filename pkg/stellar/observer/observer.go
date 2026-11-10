package observer

import (
	"context"
	"log/slog"
	"strings"
	"time"

	consolemetrics "github.com/kubestellar/console/pkg/api/metrics"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

const (
	defaultObserverInterval = 60 * time.Second
	observerRecentLimit     = 5
	observerMaxRecentFlags  = 3
)

type ObserverStore interface {
	ListStellarUserIDs(ctx context.Context) ([]string, error)
	GetOpenTasks(ctx context.Context, userID string) ([]store.StellarTask, error)
	ListStellarNotifications(ctx context.Context, userID string, limit int, unreadOnly bool) ([]store.StellarNotification, error)
	GetRecentObservations(ctx context.Context, cluster string, limit int) ([]store.StellarObservation, error)
	CreateObservation(ctx context.Context, obs *store.StellarObservation) (string, error)
	GetRecentMemoryEntries(ctx context.Context, userID, cluster string, limit int) ([]store.StellarMemoryEntry, error)
	GetActiveWatchesForCluster(ctx context.Context, cluster string) ([]store.StellarWatch, error)
	GetActiveWatches(ctx context.Context, userID string) ([]store.StellarWatch, error)
	UpdateWatchStatus(ctx context.Context, id, status, lastUpdate string) error
	ResolveWatch(ctx context.Context, id string) error
	SetWatchLastChecked(ctx context.Context, id string, ts time.Time) error
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error

	// Proactive observation (Task 6)
	GetNotificationsSince(ctx context.Context, since time.Time) ([]store.StellarNotification, error)
	GetWatchByResource(ctx context.Context, userID, cluster, namespace, kind, name string) (*store.StellarWatch, error)
	CreateWatch(ctx context.Context, w *store.StellarWatch) (string, error)
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
}

type K8sClient interface {
	ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error)
	GetDeployments(ctx context.Context, cluster, namespace string) ([]k8s.Deployment, error)
	GetPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error)
	GetNodes(ctx context.Context, cluster string) ([]k8s.NodeInfo, error)
}

type Observer struct {
	store    ObserverStore
	client   K8sClient
	registry *providers.Registry
	interval time.Duration
}

func New(st ObserverStore, client K8sClient, registry *providers.Registry, interval time.Duration) *Observer {
	if interval <= 0 {
		interval = defaultObserverInterval
	}
	if registry == nil {
		registry = providers.NewRegistry()
	}
	return &Observer{
		store:    st,
		client:   client,
		registry: registry,
		interval: interval,
	}
}

func (o *Observer) Start(ctx context.Context) {
	slog.Info("stellar/observer: started", "interval", o.interval.String())
	ticker := time.NewTicker(o.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.observe(ctx)
		}
	}
}

func (o *Observer) observe(ctx context.Context) {
	if isQuietWindow() {
		slog.Debug("stellar/observer: quiet window active, skipping")
		return
	}
	cycleStart := time.Now()
	userIDs, err := o.store.ListStellarUserIDs(ctx)
	if err != nil {
		slog.Warn("stellar/observer: failed to list users", "error", err)
		consolemetrics.RecordStellarObserverError(consolemetrics.StellarObserverErrorListUsers)
		return
	}

	// Log cluster count for visibility
	clusterCount := 0
	eventCount := 0
	watchCount := 0
	if o.client != nil {
		if clusters, clErr := o.client.ListClusters(ctx); clErr == nil {
			clusterCount = len(clusters)
			// Count recent events across all clusters
			for _, cluster := range clusters {
				if events, evErr := o.client.GetWarningEvents(ctx, cluster.Name, "", 10); evErr == nil {
					eventCount += len(events)
				}
			}
		}
	}

	for _, userID := range userIDs {
		if strings.TrimSpace(userID) == "" {
			continue
		}
		// Count watches for this user
		if watches, _ := o.store.GetActiveWatches(ctx, userID); watches != nil {
			watchCount += len(watches)
		}
		o.observeUser(ctx, userID)
	}

	// Log tick with real data
	slog.Info("stellar/observer: tick", "clusters", clusterCount, "events", eventCount, "watches", watchCount, "decision", "→ NOTHING")

	// Pass 2: follow through on active watches
	o.followThroughWatches(ctx)

	// Pass 3: proactive — auto-watch critical/recurring resources
	o.evaluateRecentCriticalEvents(ctx, userIDs)

	// Pass 4: proactive — generate cross-cutting nudges from recent events
	o.generateNudges(ctx, userIDs)

	consolemetrics.RecordStellarObserverCycle(time.Since(cycleStart))
}
