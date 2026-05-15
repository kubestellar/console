package watcher

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

const bootstrapWindow = 5 * time.Minute

type K8sClient interface {
	ListClusters(ctx context.Context) ([]k8s.ClusterInfo, error)
	GetWarningEvents(ctx context.Context, cluster, namespace string, limit int) ([]k8s.Event, error)
	GetPods(ctx context.Context, cluster, namespace string) ([]k8s.PodInfo, error)
}

type Watcher struct {
	store       NotificationStore
	client      K8sClient
	interval    time.Duration
	mu          sync.Mutex
	lastSeen    map[string]time.Time
	broadcaster Broadcaster
}

func New(store NotificationStore, client K8sClient, interval time.Duration, broadcaster ...Broadcaster) *Watcher {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	var b Broadcaster
	if len(broadcaster) > 0 {
		b = broadcaster[0]
	}
	return &Watcher{
		store:       store,
		client:      client,
		interval:    interval,
		lastSeen:    make(map[string]time.Time),
		broadcaster: b,
	}
}

func (w *Watcher) Start(ctx context.Context) {
	slog.Info("stellar/watcher: starting", "interval", w.interval.String())
	defer slog.Info("stellar/watcher: stopped")
	for {
		func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("stellar/watcher: recovered from panic", "error", r)
				}
			}()
			w.runLoop(ctx)
		}()
		if ctx.Err() != nil {
			return
		}
		slog.Warn("stellar/watcher: restarting after panic")
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func (w *Watcher) runLoop(ctx context.Context) {
	w.poll(ctx)
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *Watcher) poll(ctx context.Context) {
	if isQuietWindow() {
		slog.Debug("stellar/watcher: quiet window active, skipping poll")
		return
	}
	if w.client == nil || w.store == nil {
		return
	}
	pollCtx, cancel := context.WithTimeout(ctx, w.interval/2)
	defer cancel()
	clusters, err := w.client.ListClusters(pollCtx)
	if err != nil {
		slog.Warn("stellar/watcher: list clusters failed", "error", err)
		return
	}

	start := time.Now()
	newNotifs := 0
	var countMu sync.Mutex
	sem := make(chan struct{}, 5)
	var wg sync.WaitGroup
	for _, c := range clusters {
		wg.Add(1)
		sem <- struct{}{}
		go func(name string) {
			defer wg.Done()
			defer func() { <-sem }()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("stellar/watcher: pollCluster panicked", "cluster", name, "recover", r)
				}
			}()
			added := w.pollCluster(pollCtx, name)
			countMu.Lock()
			newNotifs += added
			countMu.Unlock()
		}(c.Name)
	}
	wg.Wait()
	slog.Info("stellar/watcher: poll complete", "clusters", len(clusters), "new_notifs", newNotifs, "duration_ms", int(time.Since(start).Milliseconds()))
}

func (w *Watcher) pollCluster(ctx context.Context, cluster string) int {
	userIDs, err := w.store.ListStellarUserIDs(ctx)
	if err != nil || len(userIDs) == 0 {
		return 0
	}
	w.mu.Lock()
	cutoff := w.lastSeen[cluster]
	if cutoff.IsZero() {
		cutoff = time.Now().UTC().Add(-bootstrapWindow)
		w.lastSeen[cluster] = cutoff
	}
	w.mu.Unlock()

	newCount := 0
	events, err := w.client.GetWarningEvents(ctx, cluster, "", 100)
	if err == nil {
		for _, ev := range events {
			ts := parseEventTimestamp(ev.LastSeen)
			if !ts.After(cutoff) {
				continue
			}
			resource := splitEventObjectName(ev.Object)
			dedup := DedupKeyEvent(cluster, ev.Namespace, resource, ev.Reason)
			severity := InferSeverity(ev.Reason, ev.Type)
			body := NarrateEvent(cluster, ev.Namespace, resource, ev.Reason, ev.Message, int(ev.Count), time.Since(ts))
			for _, userID := range userIDs {
				exists, dedupeErr := w.store.NotificationExistsByDedup(ctx, userID, dedup)
				if dedupeErr != nil || exists {
					continue
				}
				notif := &store.StellarNotification{
					UserID:    userID,
					Type:      "event",
					Severity:  severity,
					Title:     ev.Reason + " — " + ev.Namespace + "/" + resource,
					Body:      body,
					Cluster:   cluster,
					Namespace: ev.Namespace,
					DedupeKey: dedup,
				}
				if createErr := w.store.CreateStellarNotification(ctx, notif); createErr == nil {
					newCount++
					if severity == "critical" {
						_ = w.store.CreateStellarMemoryEntry(ctx, &store.StellarMemoryEntry{
							UserID:     userID,
							Cluster:    cluster,
							Namespace:  ev.Namespace,
							Category:   "incident",
							Summary:    notif.Title + " — " + truncate(notif.Body, 180),
							Importance: 8,
							IncidentID: notif.ID,
							ExpiresAt:  ptr(time.Now().AddDate(0, 0, 90)),
						})
						// Auto-watch on recurrence
						recentMems, _ := w.store.GetRecentMemoryEntries(ctx, userID, cluster, 20)
						recurrenceCount := 0
						for _, m := range recentMems {
							if strings.Contains(m.Summary, resource) && strings.Contains(m.Summary, ev.Reason) {
								recurrenceCount++
							}
						}
						if recurrenceCount >= 2 {
							_, _ = w.store.CreateWatch(ctx, &store.StellarWatch{
								UserID:       userID,
								Cluster:      cluster,
								Namespace:    ev.Namespace,
								ResourceKind: strings.Split(ev.Object, "/")[0],
								ResourceName: resource,
								Reason:       fmt.Sprintf("Auto-watch: %s has recurred %d times", ev.Reason, recurrenceCount+1),
								Status:       "active",
							})
						}
					}
					if w.broadcaster != nil {
						w.broadcaster.Broadcast(SSEEvent{Type: "notification", Data: notif})
					}
				}
			}
			w.mu.Lock()
			if ts.After(w.lastSeen[cluster]) {
				w.lastSeen[cluster] = ts
			}
			w.mu.Unlock()
		}
	}

	pods, err := w.client.GetPods(ctx, cluster, "")
	if err != nil {
		return newCount
	}
	for _, pod := range pods {
		for _, c := range pod.Containers {
			if c.Reason != "CrashLoopBackOff" {
				continue
			}
			dedup := DedupKeyCrash(cluster, pod.Namespace, pod.Name, c.Name)
			body := "I'm seeing " + pod.Namespace + "/" + pod.Name + " in CrashLoopBackOff on cluster " + cluster + "."
			for _, userID := range userIDs {
				exists, dedupeErr := w.store.NotificationExistsByDedup(ctx, userID, dedup)
				if dedupeErr != nil || exists {
					continue
				}
				notif := &store.StellarNotification{
					UserID:    userID,
					Type:      "event",
					Severity:  "critical",
					Title:     "CrashLoopBackOff — " + pod.Namespace + "/" + pod.Name,
					Body:      body,
					Cluster:   cluster,
					Namespace: pod.Namespace,
					DedupeKey: dedup,
				}
				if createErr := w.store.CreateStellarNotification(ctx, notif); createErr == nil {
					newCount++
					if w.broadcaster != nil {
						w.broadcaster.Broadcast(SSEEvent{Type: "notification", Data: notif})
					}
				}
			}
		}
	}
	return newCount
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

func parseEventTimestamp(value string) time.Time {
	ts, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return time.Now().UTC()
	}
	return ts
}

func truncate(v string, max int) string {
	if len(v) <= max {
		return v
	}
	return v[:max] + "..."
}

func ptr[T any](v T) *T { return &v }

// isQuietWindow returns true if the current time falls within the configured
// quiet window (STELLAR_QUIET_START / STELLAR_QUIET_END env vars, 24h format).
func isQuietWindow() bool {
	start := os.Getenv("STELLAR_QUIET_START")
	end := os.Getenv("STELLAR_QUIET_END")
	if start == "" || end == "" {
		return false
	}
	now := time.Now().Format("15:04")
	if start < end {
		return now >= start && now < end
	}
	return now >= start || now < end
}
