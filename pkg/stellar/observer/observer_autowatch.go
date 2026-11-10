package observer

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	consolemetrics "github.com/kubestellar/console/pkg/api/metrics"
	"github.com/kubestellar/console/pkg/store"
)

// observerProactiveLookback is the time window for auto-watch analysis.
const observerProactiveLookback = 1 * time.Hour
const observerRecurringThreshold = 3

type resourceEvents struct {
	Cluster   string
	Namespace string
	Title     string
	Severity  string
	UserID    string
	Events    []store.StellarNotification
}

// evaluateRecentCriticalEvents scans events from the last hour and auto-creates
// watches for critical or recurring resources that aren't already watched.
func (o *Observer) evaluateRecentCriticalEvents(ctx context.Context, userIDs []string) {
	since := time.Now().Add(-observerProactiveLookback)
	notifications, err := o.store.GetNotificationsSince(ctx, since)
	if err != nil {
		slog.Warn("stellar/observer: failed to fetch recent notifications", "error", err)
		return
	}
	if len(notifications) == 0 {
		return
	}

	resourceMap := make(map[string]*resourceEvents)
	for _, n := range notifications {
		if n.Type != "event" && n.Type != "Event" {
			continue
		}
		key := fmt.Sprintf("%s|%s|%s|%s", n.UserID, n.Cluster, n.Namespace, n.Title)
		entry, ok := resourceMap[key]
		if !ok {
			entry = &resourceEvents{
				Cluster:   n.Cluster,
				Namespace: n.Namespace,
				Title:     n.Title,
				Severity:  n.Severity,
				UserID:    n.UserID,
			}
			resourceMap[key] = entry
		}
		entry.Events = append(entry.Events, n)
		// Track highest severity seen
		if severityRank(n.Severity) < severityRank(entry.Severity) {
			entry.Severity = n.Severity
		}
	}

	for _, res := range resourceMap {
		isCritical := res.Severity == "critical"
		isRecurring := len(res.Events) >= observerRecurringThreshold
		if !isCritical && !isRecurring {
			continue
		}

		kind, name := parseResourceFromEvents(res.Events, res.Title)
		if name == "" {
			continue
		}

		// Skip if already watched
		existing, _ := o.store.GetWatchByResource(ctx, res.UserID, res.Cluster, res.Namespace, kind, name)
		if existing != nil {
			continue
		}

		reason := fmt.Sprintf("Auto-watched: %d events, severity %s", len(res.Events), res.Severity)
		watch := &store.StellarWatch{
			UserID:       res.UserID,
			Cluster:      res.Cluster,
			Namespace:    res.Namespace,
			ResourceKind: kind,
			ResourceName: name,
			Reason:       reason,
			Status:       "active",
		}
		if _, err := o.store.CreateWatch(ctx, watch); err != nil {
			slog.Warn("stellar/observer: failed to create auto-watch", "error", err)
			continue
		}
		consolemetrics.RecordStellarObserverAutoWatchCreated()
		slog.Info("stellar/observer: auto-watch created",
			"cluster", res.Cluster, "namespace", res.Namespace, "name", name, "reason", reason)
	}
}

// severityRank returns 0 for critical, 1 for warning, 2 for info, 3 for unknown.
func severityRank(s string) int {
	switch s {
	case "critical":
		return 0
	case "warning":
		return 1
	case "info":
		return 2
	default:
		return 3
	}
}

// parseResourceFromEvents extracts the resource kind and name from a notification's title or body.
// Falls back to a default Pod kind when the title carries only a name.
func parseResourceFromEvents(events []store.StellarNotification, title string) (string, string) {
	// Try to derive kind/name from dedupeKey first (format: "ev:cluster:ns:name:reason")
	for _, n := range events {
		if n.DedupeKey == "" {
			continue
		}
		parts := strings.Split(n.DedupeKey, ":")
		offset := 0
		if parts[0] == "ev" {
			offset = 1
		}
		if len(parts) >= offset+3 {
			name := parts[offset+2]
			if name != "" {
				return "Pod", name
			}
		}
	}
	// Fallback: parse "Reason — namespace/name" from title
	if idx := strings.Index(title, "—"); idx > 0 {
		rest := strings.TrimSpace(title[idx+len("—"):])
		if slashIdx := strings.Index(rest, "/"); slashIdx > 0 {
			return "Pod", strings.TrimSpace(rest[slashIdx+1:])
		}
	}
	return "", ""
}
