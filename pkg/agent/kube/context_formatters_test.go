package kube

import (
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

// ────────────────────────────────────────────────────────────────────────────
// appendFormattedBridgePodIssues — cover issue rendering (23.1% → expected >80%)
// ────────────────────────────────────────────────────────────────────────────

func TestAppendFormattedBridgePodIssues_SingleIssue(t *testing.T) {
	issues := []mcp.PodIssue{{
		Namespace: "monitoring",
		Name:      "alertmanager-0",
		Status:    "CrashLoopBackOff",
		Reason:    "BackOff",
		Restarts:  12,
		Issues:    []string{"container OOMKilled", "exceeded memory limit"},
	}}

	var sb strings.Builder
	appendFormattedBridgePodIssues(&sb, issues)
	out := sb.String()

	if !strings.Contains(out, "Pod issues:\n") {
		t.Fatalf("expected pod issues header, got %q", out)
	}
	if !strings.Contains(out, "monitoring/alertmanager-0") {
		t.Fatalf("expected pod name, got %q", out)
	}
	if !strings.Contains(out, "status=CrashLoopBackOff") {
		t.Fatalf("expected status, got %q", out)
	}
	if !strings.Contains(out, "restarts=12") {
		t.Fatalf("expected restarts, got %q", out)
	}
	if !strings.Contains(out, "reason=BackOff") {
		t.Fatalf("expected reason, got %q", out)
	}
	if !strings.Contains(out, "container OOMKilled") {
		t.Fatalf("expected issue text, got %q", out)
	}
}

func TestAppendFormattedBridgePodIssues_NoReasonNoIssues(t *testing.T) {
	issues := []mcp.PodIssue{{
		Namespace: "default",
		Name:      "web-deploy-abc",
		Status:    "Pending",
		Reason:    "",
		Restarts:  0,
		Issues:    nil,
	}}

	var sb strings.Builder
	appendFormattedBridgePodIssues(&sb, issues)
	out := sb.String()

	if strings.Contains(out, "reason=") {
		t.Fatalf("should not include reason when empty: %q", out)
	}
	if strings.Contains(out, "issues=") {
		t.Fatalf("should not include issues when empty: %q", out)
	}
	if !strings.Contains(out, "default/web-deploy-abc") {
		t.Fatalf("expected pod name, got %q", out)
	}
}

func TestAppendFormattedBridgePodIssues_TruncatesToIssueLimit(t *testing.T) {
	issues := make([]mcp.PodIssue, 0, providerClusterContextIssueLimit+3)
	for i := 0; i < providerClusterContextIssueLimit+3; i++ {
		issues = append(issues, mcp.PodIssue{
			Namespace: "batch",
			Name:      "job-" + string(rune('a'+i)),
			Status:    "Failed",
			Restarts:  0,
		})
	}

	var sb strings.Builder
	appendFormattedBridgePodIssues(&sb, issues)
	out := sb.String()

	lineCount := strings.Count(out, "\n- ")
	if lineCount != providerClusterContextIssueLimit {
		t.Fatalf("expected %d issues, got %d in output: %q", providerClusterContextIssueLimit, lineCount, out)
	}
}

// ────────────────────────────────────────────────────────────────────────────
// appendFormattedPodIssues — k8s.PodIssue variant
// ────────────────────────────────────────────────────────────────────────────

func TestAppendFormattedPodIssues_SingleIssue(t *testing.T) {
	issues := []k8s.PodIssue{{
		Namespace: "kube-system",
		Name:      "coredns-xyz",
		Status:    "ImagePullBackOff",
		Reason:    "ErrImagePull",
		Restarts:  0,
		Issues:    []string{"image not found"},
	}}

	var sb strings.Builder
	appendFormattedPodIssues(&sb, issues)
	out := sb.String()

	if !strings.Contains(out, "kube-system/coredns-xyz") {
		t.Fatalf("expected pod reference, got %q", out)
	}
	if !strings.Contains(out, "status=ImagePullBackOff") {
		t.Fatalf("expected status, got %q", out)
	}
	if !strings.Contains(out, "reason=ErrImagePull") {
		t.Fatalf("expected reason, got %q", out)
	}
	if !strings.Contains(out, "image not found") {
		t.Fatalf("expected issue detail, got %q", out)
	}
}

func TestAppendFormattedPodIssues_NoReasonNoIssues(t *testing.T) {
	issues := []k8s.PodIssue{{
		Namespace: "prod",
		Name:      "api-server-1",
		Status:    "Terminating",
		Restarts:  3,
	}}

	var sb strings.Builder
	appendFormattedPodIssues(&sb, issues)
	out := sb.String()

	if strings.Contains(out, "reason=") {
		t.Fatalf("should not include reason when empty: %q", out)
	}
	if strings.Contains(out, "issues=") {
		t.Fatalf("should not include issues when empty: %q", out)
	}
	if !strings.Contains(out, "restarts=3") {
		t.Fatalf("expected restarts, got %q", out)
	}
}

// ────────────────────────────────────────────────────────────────────────────
// appendFormattedBridgeWarningEvents — cover rendering with data
// ────────────────────────────────────────────────────────────────────────────

func TestAppendFormattedBridgeWarningEvents_MultipleEvents(t *testing.T) {
	events := []mcp.Event{
		{Reason: "FailedScheduling", Namespace: "prod", Object: "nginx-deploy", Count: 5, Message: "no nodes available"},
		{Reason: "BackOff", Namespace: "default", Object: "redis-0", Count: 2, Message: "back-off restarting"},
	}

	var sb strings.Builder
	appendFormattedBridgeWarningEvents(&sb, events)
	out := sb.String()

	if !strings.Contains(out, "Recent warning events:\n") {
		t.Fatalf("expected header, got %q", out)
	}
	if !strings.Contains(out, "FailedScheduling prod/nginx-deploy x5") {
		t.Fatalf("expected first event, got %q", out)
	}
	if !strings.Contains(out, "BackOff default/redis-0 x2") {
		t.Fatalf("expected second event, got %q", out)
	}
}

func TestAppendFormattedWarningEvents_MultipleEvents(t *testing.T) {
	events := []k8s.Event{
		{Reason: "Unhealthy", Namespace: "monitoring", Object: "prometheus-0", Count: 10, Message: "liveness probe failed"},
		{Reason: "Evicted", Namespace: "default", Object: "worker-pod", Count: 1, Message: "The node was low on resource: memory"},
	}

	var sb strings.Builder
	appendFormattedWarningEvents(&sb, events)
	out := sb.String()

	if !strings.Contains(out, "Recent warning events:\n") {
		t.Fatalf("expected header, got %q", out)
	}
	if !strings.Contains(out, "Unhealthy monitoring/prometheus-0 x10") {
		t.Fatalf("expected first event, got %q", out)
	}
	if !strings.Contains(out, "Evicted default/worker-pod x1") {
		t.Fatalf("expected second event, got %q", out)
	}
}

func TestAppendFormattedWarningEvents_ShortMessageNotTruncated(t *testing.T) {
	events := []k8s.Event{{
		Reason:    "Created",
		Namespace: "ns",
		Object:    "pod",
		Count:     1,
		Message:   "short message",
	}}

	var sb strings.Builder
	appendFormattedWarningEvents(&sb, events)
	out := sb.String()

	if strings.Contains(out, "...") {
		t.Fatalf("short message should not be truncated: %q", out)
	}
	if !strings.Contains(out, "short message") {
		t.Fatalf("expected full message, got %q", out)
	}
}

// ────────────────────────────────────────────────────────────────────────────
// buildLiveClusterContext — edge cases
// ────────────────────────────────────────────────────────────────────────────

func TestBuildLiveClusterContext_EmptyClusters(t *testing.T) {
	// Clear state — no bridge, no k8sClient
	providerClusterContextState.mu.Lock()
	providerClusterContextState.bridge = nil
	providerClusterContextState.k8sClient = nil
	providerClusterContextState.mu.Unlock()

	req := &ai.ChatRequest{
		Prompt:  "show pods",
		Context: map[string]string{"cluster": "nonexistent"},
	}

	// With both providers nil, even explicit clusters should return "" because
	// the nil check at line 49 returns early.
	got := buildLiveClusterContext(nil, req)
	if got != "" {
		t.Fatalf("expected empty when no providers, got %q", got)
	}
}

func TestBuildLiveClusterContext_EmptyContextNoExplicitClusters(t *testing.T) {
	providerClusterContextState.mu.Lock()
	providerClusterContextState.bridge = nil
	providerClusterContextState.k8sClient = nil
	providerClusterContextState.mu.Unlock()

	req := &ai.ChatRequest{
		Prompt:  "what's running?",
		Context: map[string]string{},
	}

	got := buildLiveClusterContext(nil, req)
	if got != "" {
		t.Fatalf("expected empty with no providers and no explicit clusters, got %q", got)
	}
}

// ────────────────────────────────────────────────────────────────────────────
// resolveScopedClusters — additional patterns
// ────────────────────────────────────────────────────────────────────────────

func TestResolveScopedClusters_NilContext(t *testing.T) {
	got := resolveScopedClusters(&ai.ChatRequest{Context: nil})
	if got != nil {
		t.Fatalf("expected nil for nil context, got %v", got)
	}
}

func TestResolveScopedClusters_EmptyValues(t *testing.T) {
	req := &ai.ChatRequest{
		Context: map[string]string{
			"clusterContext": "  ",
			"cluster":        "",
			"clusters":       "  ,  , ",
		},
	}
	got := resolveScopedClusters(req)
	if got != nil {
		t.Fatalf("expected nil for all-empty values, got %v", got)
	}
}

func TestResolveScopedClusters_SingleCluster(t *testing.T) {
	req := &ai.ChatRequest{
		Context: map[string]string{"cluster": "prod-east"},
	}
	got := resolveScopedClusters(req)
	if len(got) != 1 || got[0] != "prod-east" {
		t.Fatalf("expected [prod-east], got %v", got)
	}
}
