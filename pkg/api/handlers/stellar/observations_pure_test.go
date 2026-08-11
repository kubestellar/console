package stellar

import (
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

func TestParseWatchLine(t *testing.T) {
	tests := []struct {
		name        string
		content     string
		wantContent string
		wantWatch   *watchSuggestion
	}{
		{
			name:        "no WATCH marker",
			content:     "just a normal message",
			wantContent: "just a normal message",
			wantWatch:   nil,
		},
		{
			name:        "well-formed watch with reason",
			content:     "hello there\nWATCH: prod-a/payments/Deployment/payment-worker — monitoring recovery",
			wantContent: "hello there",
			wantWatch: &watchSuggestion{
				Cluster:      "prod-a",
				Namespace:    "payments",
				ResourceKind: "Deployment",
				ResourceName: "payment-worker",
				Reason:       "monitoring recovery",
			},
		},
		{
			name:        "well-formed watch without reason",
			content:     "body\nWATCH: c/n/Kind/name",
			wantContent: "body",
			wantWatch: &watchSuggestion{
				Cluster:      "c",
				Namespace:    "n",
				ResourceKind: "Kind",
				ResourceName: "name",
			},
		},
		{
			name:        "malformed watch line strips marker but returns nil",
			content:     "body\nWATCH: only/two/segments",
			wantContent: "body",
			wantWatch:   nil,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotContent, gotWatch := parseWatchLine(tc.content)
			if gotContent != tc.wantContent {
				t.Errorf("content = %q, want %q", gotContent, tc.wantContent)
			}
			if (gotWatch == nil) != (tc.wantWatch == nil) {
				t.Fatalf("watch nil-ness mismatch: got %+v, want %+v", gotWatch, tc.wantWatch)
			}
			if gotWatch != nil && *gotWatch != *tc.wantWatch {
				t.Errorf("watch = %+v, want %+v", *gotWatch, *tc.wantWatch)
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
		{1, "item", "items", "item"},
		{0, "item", "items", "items"},
		{2, "item", "items", "items"},
		{-1, "item", "items", "items"},
	}
	for _, tc := range tests {
		got := pluralize(tc.count, tc.singular, tc.plural)
		if got != tc.want {
			t.Errorf("pluralize(%d, %q, %q) = %q, want %q", tc.count, tc.singular, tc.plural, got, tc.want)
		}
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		name string
		in   time.Duration
		want string
	}{
		{"zero", 0, "0m"},
		{"30 seconds rounds to 1m", 30 * time.Second, "1m"},
		{"exactly 1 minute", time.Minute, "1m"},
		{"59 minutes", 59 * time.Minute, "59m"},
		{"exactly 1 hour", time.Hour, "1h 0m"},
		{"1h 30m", 90 * time.Minute, "1h 30m"},
		{"2h 5m", 2*time.Hour + 5*time.Minute, "2h 5m"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := formatDuration(tc.in)
			if got != tc.want {
				t.Errorf("formatDuration(%v) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestFormatCatchUpNotificationHighlight(t *testing.T) {
	tests := []struct {
		name string
		n    store.StellarNotification
		want string
	}{
		{
			name: "title + severity + cluster",
			n:    store.StellarNotification{Title: "Pod crashloop", Severity: "critical", Cluster: "prod-a"},
			want: "[CRITICAL] Pod crashloop on prod-a",
		},
		{
			name: "title only",
			n:    store.StellarNotification{Title: "Info message"},
			want: "Info message",
		},
		{
			name: "empty title falls back to body (truncated at 100)",
			n:    store.StellarNotification{Body: "short body"},
			want: "short body",
		},
		{
			name: "severity is uppercased",
			n:    store.StellarNotification{Title: "t", Severity: "warning"},
			want: "[WARNING] t",
		},
		{
			name: "whitespace-only fields are ignored",
			n:    store.StellarNotification{Title: "  ", Severity: "  ", Cluster: "  ", Body: "  "},
			want: "",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := formatCatchUpNotificationHighlight(tc.n)
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFormatCatchUpResolvedWatchHighlight(t *testing.T) {
	tests := []struct {
		name string
		w    store.StellarWatch
		want string
	}{
		{
			name: "namespace + resource + last update",
			w:    store.StellarWatch{Namespace: "payments", ResourceName: "worker", LastUpdate: "recovered"},
			want: "Resolved watch: payments/worker — recovered.",
		},
		{
			name: "namespace + resource, no last update",
			w:    store.StellarWatch{Namespace: "kube-system", ResourceName: "coredns"},
			want: "Resolved watch: kube-system/coredns.",
		},
		{
			name: "resource only (no namespace)",
			w:    store.StellarWatch{ResourceName: "worker"},
			want: "Resolved watch: worker.",
		},
		{
			name: "both empty falls back to 'resource'",
			w:    store.StellarWatch{},
			want: "Resolved watch: resource.",
		},
		{
			name: "whitespace-only LastUpdate treated as empty",
			w:    store.StellarWatch{ResourceName: "worker", LastUpdate: "   "},
			want: "Resolved watch: worker.",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := formatCatchUpResolvedWatchHighlight(tc.w)
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}
