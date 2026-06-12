package kube

import (
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

func TestResolveScopedClusters_DeduplicatesAndSorts(t *testing.T) {
	t.Helper()

	req := &ai.ChatRequest{
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

	req := &ai.ChatRequest{Context: map[string]string{"namespace": "  observability  "}}
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

func TestSetClusterContextProviders(t *testing.T) {
	t.Helper()

	// Clear state
	providerClusterContextState.mu.Lock()
	providerClusterContextState.bridge = nil
	providerClusterContextState.k8sClient = nil
	providerClusterContextState.mu.Unlock()

	// Create mock instances (nil is valid for testing the setter)
	var mockBridge *mcp.Bridge
	var mockClient *k8s.MultiClusterClient

	// Set providers
	SetClusterContextProviders(mockBridge, mockClient)

	// Verify state was set
	providerClusterContextState.mu.RLock()
	if providerClusterContextState.bridge != mockBridge {
		t.Fatalf("bridge not set correctly")
	}
	if providerClusterContextState.k8sClient != mockClient {
		t.Fatalf("k8sClient not set correctly")
	}
	providerClusterContextState.mu.RUnlock()
}

func TestBuildLiveClusterContext_NilRequest(t *testing.T) {
	t.Helper()

	got := buildLiveClusterContext(nil, nil)
	if got != "" {
		t.Fatalf("expected empty string for nil request, got %q", got)
	}
}

func TestBuildLiveClusterContext_NoProvidersConfigured(t *testing.T) {
	t.Helper()

	// Clear state
	providerClusterContextState.mu.Lock()
	providerClusterContextState.bridge = nil
	providerClusterContextState.k8sClient = nil
	providerClusterContextState.mu.Unlock()

	req := &ai.ChatRequest{Message: "test"}
	got := buildLiveClusterContext(nil, req)
	if got != "" {
		t.Fatalf("expected empty string when no providers configured, got %q", got)
	}
}

func TestAppendClusterHealth_BothProvidersUnavailable(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendClusterHealth(&sb, nil, nil, nil, "test-cluster")
	got := sb.String()
	if !strings.Contains(got, "Health: unavailable") {
		t.Fatalf("expected unavailable health, got %q", got)
	}
}

func TestAppendPodIssues_BothProvidersUnavailable(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendPodIssues(&sb, nil, nil, nil, "test-cluster", "default")
	got := sb.String()
	if !strings.Contains(got, "Pod issues: unavailable") {
		t.Fatalf("expected unavailable pod issues, got %q", got)
	}
}

func TestAppendWarningEvents_BothProvidersUnavailable(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendWarningEvents(&sb, nil, nil, nil, "test-cluster", "default")
	got := sb.String()
	if !strings.Contains(got, "Recent warning events: unavailable") {
		t.Fatalf("expected unavailable warning events, got %q", got)
	}
}

func TestAppendFormattedBridgePodIssues_NoneDetected(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendFormattedBridgePodIssues(&sb, nil)
	got := sb.String()
	if !strings.Contains(got, "Pod issues: none detected") {
		t.Fatalf("expected none detected, got %q", got)
	}
}

func TestAppendFormattedPodIssues_NoneDetected(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendFormattedPodIssues(&sb, nil)
	got := sb.String()
	if !strings.Contains(got, "Pod issues: none detected") {
		t.Fatalf("expected none detected, got %q", got)
	}
}

func TestAppendFormattedBridgeWarningEvents_None(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendFormattedBridgeWarningEvents(&sb, nil)
	got := sb.String()
	if !strings.Contains(got, "Recent warning events: none") {
		t.Fatalf("expected none, got %q", got)
	}
}

func TestAppendFormattedWarningEvents_None(t *testing.T) {
	t.Helper()

	var sb strings.Builder
	appendFormattedWarningEvents(&sb, nil)
	got := sb.String()
	if !strings.Contains(got, "Recent warning events: none") {
		t.Fatalf("expected none, got %q", got)
	}
}

func TestAppendFormattedWarningEvents_TruncatesLongMessages(t *testing.T) {
	t.Helper()

	longMessage := strings.Repeat("x", providerClusterContextMessageLimit+50)
	events := []k8s.Event{{
		Reason:    "PodEvicted",
		Namespace: "default",
		Object:    "my-pod",
		Count:     5,
		Message:   longMessage,
	}}

	var sb strings.Builder
	appendFormattedWarningEvents(&sb, events)
	got := sb.String()

	if !strings.Contains(got, "...") {
		t.Fatalf("long message should be truncated with ellipsis: %q", got)
	}
	if strings.Contains(got, longMessage) {
		t.Fatalf("full message should not appear after truncation")
	}
}
