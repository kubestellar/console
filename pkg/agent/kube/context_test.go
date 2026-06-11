package kube

import (
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

func TestResolveScopedClusters_DeduplicatesAndSorts(t *testing.T) {
	t.Helper()

	req := &ChatRequest{
		Context: map[string]string{
			"clusterContext": "west, east",
			"cluster":        "prod, east",
			"clusters":       "edge, west",
		},
	}

	got := resolveScopedClusters(req)
	want := []string{"east", "edge", "prod", "west"}
	if len(got) != len(want) {
		t.Fatalf("unexpected cluster count: got %d want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected clusters: got %v want %v", got, want)
		}
	}
}

func TestResolveScopedNamespace_TrimsWhitespace(t *testing.T) {
	t.Helper()

	req := &ChatRequest{Context: map[string]string{"namespace": "  observability  "}}
	if got := resolveScopedNamespace(req); got != "observability" {
		t.Fatalf("unexpected namespace: %q", got)
	}
	if got := resolveScopedNamespace(nil); got != "" {
		t.Fatalf("nil request should return empty namespace, got %q", got)
	}
}

func TestAppendFormattedPodIssues_TruncatesToIssueLimit(t *testing.T) {
	t.Helper()

	issues := make([]k8s.PodIssue, 0, providerClusterContextIssueLimit+2)
	for i := 0; i < providerClusterContextIssueLimit+2; i++ {
		issues = append(issues, k8s.PodIssue{
			Namespace: "default",
			Name:      "pod-" + string(rune('a'+i)),
			Status:    "CrashLoopBackOff",
			Reason:    "BackOff",
			Restarts:  i,
			Issues:    []string{"crash", "restart"},
		})
	}

	var sb strings.Builder
	appendFormattedPodIssues(&sb, issues)
	out := sb.String()

	if !strings.HasPrefix(out, "Pod issues:\n") {
		t.Fatalf("unexpected header: %q", out)
	}
	if strings.Count(out, "\n- ") != providerClusterContextIssueLimit {
		t.Fatalf("expected %d formatted issues, got output %q", providerClusterContextIssueLimit, out)
	}
	if strings.Contains(out, "pod-j") {
		t.Fatalf("output should be truncated to the first %d issues: %q", providerClusterContextIssueLimit, out)
	}
}

func TestAppendFormattedBridgeWarningEvents_TruncatesLongMessages(t *testing.T) {
	t.Helper()

	longMessage := strings.Repeat("a", providerClusterContextMessageLimit+25)
	events := []mcp.Event{{
		Reason:    "FailedScheduling",
		Namespace: "kube-system",
		Object:    "coredns",
		Count:     3,
		Message:   longMessage,
	}}

	var sb strings.Builder
	appendFormattedBridgeWarningEvents(&sb, events)
	out := sb.String()

	if !strings.HasPrefix(out, "Recent warning events:\n") {
		t.Fatalf("unexpected header: %q", out)
	}
	if !strings.Contains(out, "...") {
		t.Fatalf("long message should be truncated with ellipsis: %q", out)
	}
	if strings.Contains(out, longMessage) {
		t.Fatalf("full message should not appear after truncation")
	}
}

func TestUniqueSortedStrings_EmptyAndDeduplicated(t *testing.T) {
	t.Helper()

	if got := uniqueSortedStrings(nil); got != nil {
		t.Fatalf("nil input should return nil, got %v", got)
	}

	got := uniqueSortedStrings([]string{"gamma", "alpha", "gamma", "beta"})
	want := []string{"alpha", "beta", "gamma"}
	if len(got) != len(want) {
		t.Fatalf("unexpected unique count: got %d want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected deduplicated values: got %v want %v", got, want)
		}
	}
}
