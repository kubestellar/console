package kube

import (
	"context"
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

func TestBuildLiveClusterContext(t *testing.T) {
	tests := []struct {
		name           string
		req            *ai.ChatRequest
		bridge         *mcp.Bridge
		k8sClient      *k8s.MultiClusterClient
		wantEmpty      bool
		wantContains   []string
		wantNotContain []string
	}{
		{
			name:      "nil context returns empty string",
			req:       nil,
			bridge:    nil,
			k8sClient: nil,
			wantEmpty: true,
		},
		{
			name:      "nil request returns empty string",
			req:       nil,
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantEmpty: true,
		},
		{
			name:      "no providers configured returns empty string",
			req:       &ai.ChatRequest{Prompt: "test"},
			bridge:    nil,
			k8sClient: nil,
			wantEmpty: true,
		},
		{
			name: "scoped clusters from context are used",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"cluster": "prod-west",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"LIVE KUBERNETES CONTEXT",
				"<cluster-data>",
				"Cluster: prod-west",
				"</cluster-data>",
			},
		},
		{
			name: "scoped namespace is included when present",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"cluster":   "prod",
					"namespace": "kube-system",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"Scoped namespace: kube-system",
				"Cluster: prod",
			},
		},
		{
			name: "multiple clusters from context are processed",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"clusters": "alpha, beta, gamma",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"Cluster: alpha",
				"Cluster: beta",
				"Cluster: gamma",
			},
		},
		{
			name: "truncates clusters beyond limit",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"clusters": "c1, c2, c3, c4, c5, c6, c7, c8",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"Cluster: c1",
				"Cluster: c5",
				"Additional clusters omitted from context: 3",
			},
			wantNotContain: []string{
				"Cluster: c6",
				"Cluster: c7",
				"Cluster: c8",
			},
		},
		{
			name: "health section is appended for each cluster",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"cluster": "test-cluster",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"Cluster: test-cluster",
				"Health:",
			},
		},
		{
			name: "pod issues section is appended for each cluster",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"cluster": "test-cluster",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"Cluster: test-cluster",
				"Pod issues:",
			},
		},
		{
			name: "warning events section is appended for each cluster",
			req: &ai.ChatRequest{
				Prompt: "test",
				Context: map[string]string{
					"cluster": "test-cluster",
				},
			},
			bridge:    &mcp.Bridge{},
			k8sClient: nil,
			wantContains: []string{
				"Cluster: test-cluster",
				"Recent warning events:",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set up provider state
			providerClusterContextState.mu.Lock()
			providerClusterContextState.bridge = tt.bridge
			providerClusterContextState.k8sClient = tt.k8sClient
			providerClusterContextState.mu.Unlock()

			got := buildLiveClusterContext(context.Background(), tt.req)

			if tt.wantEmpty {
				if got != "" {
					t.Errorf("expected empty string, got %q", got)
				}
				return
			}

			for _, want := range tt.wantContains {
				if !strings.Contains(got, want) {
					t.Errorf("expected output to contain %q, got:\n%s", want, got)
				}
			}

			for _, notWant := range tt.wantNotContain {
				if strings.Contains(got, notWant) {
					t.Errorf("expected output to NOT contain %q, got:\n%s", notWant, got)
				}
			}
		})
	}
}

func TestBuildLiveClusterContext_NilRequest(t *testing.T) {
	t.Helper()

	got := buildLiveClusterContext(context.Background(), nil)
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

	req := &ai.ChatRequest{Prompt: "test"}
	got := buildLiveClusterContext(context.Background(), req)
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
