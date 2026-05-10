package watcher

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

const bootstrapWindow = 5 * time.Minute

type Store interface {
	CreateStellarNotification(ctx context.Context, notification *store.StellarNotification) error
	NotificationExistsByDedup(ctx context.Context, userID, dedupeKey string) (bool, error)
	ListStellarUserIDs(ctx context.Context) ([]string, error)
}

type K8sClient interface {
	DeduplicatedClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error)
	GetPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error)
}

type Watcher struct {
	store     Store
	k8sClient K8sClient
	interval  time.Duration
	lastSeen  map[string]time.Time
}

func New(store Store, client K8sClient, interval time.Duration) *Watcher {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	return &Watcher{
		store:     store,
		k8sClient: client,
		interval:  interval,
		lastSeen:  make(map[string]time.Time),
	}
}

func (w *Watcher) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	slog.Info("stellar/watcher: started", "interval", w.interval.String())
	w.poll(ctx)
	for {
		select {
		case <-ctx.Done():
			slog.Info("stellar/watcher: stopped")
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *Watcher) poll(ctx context.Context) {
	if w.k8sClient == nil || w.store == nil {
		return
	}
	clusters, err := w.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		clusters, err = w.k8sClient.ListClusters(ctx)
		if err != nil {
			slog.Warn("stellar/watcher: list clusters failed", "error", err)
			return
		}
	}
	userIDs, err := w.store.ListStellarUserIDs(ctx)
	if err != nil {
		slog.Warn("stellar/watcher: list user ids failed", "error", err)
		return
	}
	if len(userIDs) == 0 {
		return
	}
	for _, cluster := range clusters {
		w.pollCluster(ctx, cluster.Name, userIDs)
	}
}

func (w *Watcher) pollCluster(ctx context.Context, clusterName string, userIDs []string) {
	cutoff := w.lastSeen[clusterName]
	if cutoff.IsZero() {
		cutoff = time.Now().UTC().Add(-bootstrapWindow)
	}

	events, err := w.k8sClient.GetWarningEvents(ctx, clusterName, "", 100)
	if err != nil {
		slog.Warn("stellar/watcher: warning events failed", "cluster", clusterName, "error", err)
	} else {
		for _, ev := range events {
			ts := parseEventTimestamp(ev.LastSeen)
			if !ts.After(cutoff) {
				continue
			}
			objectKind, objectName := splitObjectRef(ev.Object)
			dedupeKey := fmt.Sprintf("ev:%s:%s:%s:%s", clusterName, ev.Namespace, objectName, ev.Reason)
			severity := "warning"
			if isCriticalReason(ev.Reason) {
				severity = "critical"
			}
			narration := fmt.Sprintf(
				"I noticed %s on %s/%s in cluster %s. Reason: %s. This has occurred %d time(s) — last seen %s ago.",
				ev.Reason,
				ev.Namespace,
				objectName,
				clusterName,
				truncate(ev.Message, 120),
				ev.Count,
				time.Since(ts).Round(time.Minute),
			)
			for _, userID := range userIDs {
				exists, dedupeErr := w.store.NotificationExistsByDedup(ctx, userID, dedupeKey)
				if dedupeErr != nil {
					continue
				}
				if exists {
					continue
				}
				_ = w.store.CreateStellarNotification(ctx, &store.StellarNotification{
					UserID:    userID,
					Type:      "Event",
					Severity:  severity,
					Title:     fmt.Sprintf("%s — %s/%s (%s)", ev.Reason, ev.Namespace, objectName, objectKind),
					Body:      narration,
					Cluster:   clusterName,
					Namespace: ev.Namespace,
					DedupeKey: dedupeKey,
				})
			}
			if ts.After(w.lastSeen[clusterName]) {
				w.lastSeen[clusterName] = ts
			}
		}
	}

	pods, err := w.k8sClient.GetPods(ctx, clusterName, "")
	if err != nil {
		return
	}
	for _, pod := range pods {
		for _, c := range pod.Containers {
			if c.Reason != "CrashLoopBackOff" {
				continue
			}
			dedupeKey := fmt.Sprintf("crash:%s:%s:%s:%s", clusterName, pod.Namespace, pod.Name, c.Name)
			body := fmt.Sprintf(
				"I'm seeing %s (container: %s) in CrashLoopBackOff on cluster %s. It has restarted %d times. Want me to pull the last 100 lines of logs?",
				pod.Namespace+"/"+pod.Name,
				c.Name,
				clusterName,
				pod.Restarts,
			)
			for _, userID := range userIDs {
				exists, dedupeErr := w.store.NotificationExistsByDedup(ctx, userID, dedupeKey)
				if dedupeErr != nil || exists {
					continue
				}
				_ = w.store.CreateStellarNotification(ctx, &store.StellarNotification{
					UserID:    userID,
					Type:      "Event",
					Severity:  "critical",
					Title:     fmt.Sprintf("CrashLoopBackOff — %s/%s", pod.Namespace, pod.Name),
					Body:      body,
					Cluster:   clusterName,
					Namespace: pod.Namespace,
					DedupeKey: dedupeKey,
				})
			}
		}
	}
}

func splitObjectRef(object string) (kind, name string) {
	parts := strings.SplitN(strings.TrimSpace(object), "/", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	if len(parts) == 1 {
		return "Object", parts[0]
	}
	return "Object", "unknown"
}

func parseEventTimestamp(value string) time.Time {
	ts, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return time.Now().UTC()
	}
	return ts
}

func isCriticalReason(reason string) bool {
	criticals := []string{"OOM", "BackOff", "Failed", "FailedMount", "Evicted", "NodeNotReady"}
	for _, critical := range criticals {
		if strings.Contains(reason, critical) {
			return true
		}
	}
	return false
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max] + "..."
}
