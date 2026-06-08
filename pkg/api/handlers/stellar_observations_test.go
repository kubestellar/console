package handlers

import (
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

func TestParseWatchLine(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		wantText    string
		wantWatch   *watchSuggestion
	}{
		{
			name:      "no WATCH directive",
			content:   "The deployment is healthy and running normally.",
			wantText:  "The deployment is healthy and running normally.",
			wantWatch: nil,
		},
		{
			name:    "valid WATCH directive with reason",
			content: "The pod is crash-looping.\nWATCH: prod-a/payments/Deployment/payment-worker — monitoring recovery",
			wantText: "The pod is crash-looping.",
			wantWatch: &watchSuggestion{
				Cluster:      "prod-a",
				Namespace:    "payments",
				ResourceKind: "Deployment",
				ResourceName: "payment-worker",
				Reason:       "monitoring recovery",
			},
		},
		{
			name:    "WATCH directive without reason",
			content: "High memory usage detected.\nWATCH: staging/default/Pod/redis-0",
			wantText: "High memory usage detected.",
			wantWatch: &watchSuggestion{
				Cluster:      "staging",
				Namespace:    "default",
				ResourceKind: "Pod",
				ResourceName: "redis-0",
				Reason:       "",
			},
		},
		{
			name:      "malformed WATCH (too few segments)",
			content:   "Something is wrong.\nWATCH: prod/nginx",
			wantText:  "Something is wrong.",
			wantWatch: nil,
		},
		{
			name:      "WATCH not on newline boundary (embedded in text)",
			content:   "Analysis complete. No issues found.",
			wantText:  "Analysis complete. No issues found.",
			wantWatch: nil,
		},
		{
			name:    "multiline content before WATCH",
			content: "Line 1.\nLine 2.\nLine 3.\nWATCH: cluster/ns/StatefulSet/db-0 — high latency",
			wantText: "Line 1.\nLine 2.\nLine 3.",
			wantWatch: &watchSuggestion{
				Cluster:      "cluster",
				Namespace:    "ns",
				ResourceKind: "StatefulSet",
				ResourceName: "db-0",
				Reason:       "high latency",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotText, gotWatch := parseWatchLine(tt.content)
			if gotText != tt.wantText {
				t.Errorf("text = %q, want %q", gotText, tt.wantText)
			}
			if tt.wantWatch == nil {
				if gotWatch != nil {
					t.Errorf("watch = %+v, want nil", gotWatch)
				}
				return
			}
			if gotWatch == nil {
				t.Fatal("watch = nil, want non-nil")
			}
			if gotWatch.Cluster != tt.wantWatch.Cluster {
				t.Errorf("Cluster = %q, want %q", gotWatch.Cluster, tt.wantWatch.Cluster)
			}
			if gotWatch.Namespace != tt.wantWatch.Namespace {
				t.Errorf("Namespace = %q, want %q", gotWatch.Namespace, tt.wantWatch.Namespace)
			}
			if gotWatch.ResourceKind != tt.wantWatch.ResourceKind {
				t.Errorf("ResourceKind = %q, want %q", gotWatch.ResourceKind, tt.wantWatch.ResourceKind)
			}
			if gotWatch.ResourceName != tt.wantWatch.ResourceName {
				t.Errorf("ResourceName = %q, want %q", gotWatch.ResourceName, tt.wantWatch.ResourceName)
			}
			if gotWatch.Reason != tt.wantWatch.Reason {
				t.Errorf("Reason = %q, want %q", gotWatch.Reason, tt.wantWatch.Reason)
			}
		})
	}
}

func TestPluralize(t *testing.T) {
	tests := []struct {
		count    int
		singular string
		plural   string
		want     string
	}{
		{0, "event", "events", "events"},
		{1, "event", "events", "event"},
		{2, "event", "events", "events"},
		{1, "watch", "watches", "watch"},
		{5, "watch", "watches", "watches"},
		{1, "resource", "resources", "resource"},
		{100, "resource", "resources", "resources"},
	}

	for _, tt := range tests {
		got := pluralize(tt.count, tt.singular, tt.plural)
		if got != tt.want {
			t.Errorf("pluralize(%d, %q, %q) = %q, want %q", tt.count, tt.singular, tt.plural, got, tt.want)
		}
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		duration time.Duration
		want     string
	}{
		{0, "0m"},
		{5 * time.Minute, "5m"},
		{30 * time.Minute, "30m"},
		{59 * time.Minute, "59m"},
		{60 * time.Minute, "1h 0m"},
		{90 * time.Minute, "1h 30m"},
		{2*time.Hour + 15*time.Minute, "2h 15m"},
		{24 * time.Hour, "24h 0m"},
		{48*time.Hour + 30*time.Minute, "48h 30m"},
	}

	for _, tt := range tests {
		got := formatDuration(tt.duration)
		if got != tt.want {
			t.Errorf("formatDuration(%v) = %q, want %q", tt.duration, got, tt.want)
		}
	}
}

func TestFormatCatchUpNotificationHighlight(t *testing.T) {
	tests := []struct {
		name         string
		notification store.StellarNotification
		wantContains []string
	}{
		{
			name: "full notification with severity and cluster",
			notification: store.StellarNotification{
				Severity: "critical",
				Title:    "Pod OOMKilled",
				Cluster:  "prod-east",
			},
			wantContains: []string{"[CRITICAL]", "Pod OOMKilled", "on prod-east"},
		},
		{
			name: "notification without cluster",
			notification: store.StellarNotification{
				Severity: "warning",
				Title:    "High memory usage",
			},
			wantContains: []string{"[WARNING]", "High memory usage"},
		},
		{
			name: "notification with body fallback (no title)",
			notification: store.StellarNotification{
				Severity: "info",
				Body:     "This is the body text that will be used as fallback since title is empty",
			},
			wantContains: []string{"[INFO]", "This is the body text"},
		},
		{
			name: "empty notification",
			notification: store.StellarNotification{},
			wantContains: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatCatchUpNotificationHighlight(tt.notification)
			for _, want := range tt.wantContains {
				if !containsStr(got, want) {
					t.Errorf("formatCatchUpNotificationHighlight() = %q, missing %q", got, want)
				}
			}
		})
	}
}

func TestFormatCatchUpResolvedWatchHighlight(t *testing.T) {
	tests := []struct {
		name string
		watch store.StellarWatch
		wantContains []string
	}{
		{
			name: "resolved with namespace and update",
			watch: store.StellarWatch{
				Namespace:    "payments",
				ResourceName: "payment-worker",
				LastUpdate:   "pods recovered after scale-up",
			},
			wantContains: []string{"Resolved watch:", "payments/payment-worker", "pods recovered"},
		},
		{
			name: "resolved without last update",
			watch: store.StellarWatch{
				Namespace:    "default",
				ResourceName: "redis",
				LastUpdate:   "",
			},
			wantContains: []string{"Resolved watch:", "default/redis"},
		},
		{
			name: "resolved without namespace",
			watch: store.StellarWatch{
				ResourceName: "cluster-node-1",
				LastUpdate:   "node ready",
			},
			wantContains: []string{"Resolved watch:", "cluster-node-1", "node ready"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatCatchUpResolvedWatchHighlight(tt.watch)
			for _, want := range tt.wantContains {
				if !containsStr(got, want) {
					t.Errorf("formatCatchUpResolvedWatchHighlight() = %q, missing %q", got, want)
				}
			}
		})
	}
}

func TestBuildCatchUpPayload(t *testing.T) {
	since := time.Now().Add(-2 * time.Hour)

	t.Run("all clear - no events", func(t *testing.T) {
		result := buildCatchUpPayload(since, nil, nil, nil)
		if result.Kind != "clean" {
			t.Errorf("Kind = %q, want %q", result.Kind, "clean")
		}
		if !containsStr(result.Summary, "All clear") {
			t.Errorf("Summary = %q, want to contain 'All clear'", result.Summary)
		}
	})

	t.Run("notifications present", func(t *testing.T) {
		notifications := []store.StellarNotification{
			{Severity: "critical", Title: "Pod crash", Cluster: "prod"},
			{Severity: "warning", Title: "High CPU", Cluster: "staging"},
		}
		result := buildCatchUpPayload(since, notifications, nil, nil)
		if result.Kind != "summary" {
			t.Errorf("Kind = %q, want %q", result.Kind, "summary")
		}
		if !containsStr(result.Summary, "2 events fired") {
			t.Errorf("Summary = %q, want to contain '2 events fired'", result.Summary)
		}
	})

	t.Run("resolved watches", func(t *testing.T) {
		resolved := []store.StellarWatch{
			{Namespace: "default", ResourceName: "nginx", LastUpdate: "healthy"},
		}
		result := buildCatchUpPayload(since, nil, resolved, nil)
		if result.Kind != "summary" {
			t.Errorf("Kind = %q, want %q", result.Kind, "summary")
		}
		if !containsStr(result.Summary, "1 watch resolved") {
			t.Errorf("Summary = %q, want to contain '1 watch resolved'", result.Summary)
		}
	})

	t.Run("active watches mentioned", func(t *testing.T) {
		active := []store.StellarWatch{
			{Namespace: "prod", ResourceName: "api-server"},
			{Namespace: "prod", ResourceName: "db"},
		}
		result := buildCatchUpPayload(since, nil, nil, active)
		if !containsStr(result.Summary, "2 resources still need attention") {
			t.Errorf("Summary = %q, want to contain '2 resources still need attention'", result.Summary)
		}
	})

	t.Run("highlights capped at max", func(t *testing.T) {
		// Create more than catchUpMaxEventHighlights (3) notifications
		notifications := make([]store.StellarNotification, 5)
		for i := range notifications {
			notifications[i] = store.StellarNotification{Severity: "warning", Title: "Event"}
		}
		result := buildCatchUpPayload(since, notifications, nil, nil)
		// Should contain "Plus 2 more events" highlight
		found := false
		for _, h := range result.Highlights {
			if containsStr(h, "Plus 2 more") {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected 'Plus 2 more' highlight, got %v", result.Highlights)
		}
	})
}

// containsStr checks if s contains substr.
func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
