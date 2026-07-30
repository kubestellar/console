package kube

import (
	"context"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/k8s/k8stest"
	"github.com/kubestellar/console/pkg/mcp"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
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

func newTestMultiClusterClient(t *testing.T) *k8s.MultiClusterClient {
	t.Helper()

	k8sClient, err := k8s.NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("NewMultiClusterClient returned error: %v", err)
	}
	k8sClient.SetInClusterConfig(nil)
	return k8sClient
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

	req := &ai.ChatRequest{Prompt: "test"}
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

func TestListScopedClusters_UsesDeduplicatedK8sClusters(t *testing.T) {
	t.Helper()

	k8sClient := newTestMultiClusterClient(t)

	k8sClient.SetRawConfig(&api.Config{
		CurrentContext: "west",
		Contexts: map[string]*api.Context{
			"west":     {Cluster: "west-cluster", AuthInfo: "west-user"},
			"verbose":  {Cluster: "verbose-cluster", AuthInfo: "west-user"},
			"east":     {Cluster: "east-cluster", AuthInfo: "east-user"},
			"ignored":  {Cluster: "ignored-cluster", AuthInfo: "ignored-user"},
			"noserver": {Cluster: "noserver-cluster", AuthInfo: "ignored-user"},
		},
		Clusters: map[string]*api.Cluster{
			"west-cluster":     {Server: "https://shared.example.test"},
			"verbose-cluster":  {Server: "https://shared.example.test"},
			"east-cluster":     {Server: "https://east.example.test"},
			"ignored-cluster":  {Server: ""},
			"noserver-cluster": {},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"west-user":    {Token: "west-token"},
			"east-user":    {Token: "east-token"},
			"ignored-user": {Token: "ignored-token"},
		},
	})

	got := listScopedClusters(context.Background(), &mcp.Bridge{}, k8sClient)
	want := []string{"east", "ignored", "noserver", "west"}
	if len(got) != len(want) {
		t.Fatalf("unexpected cluster count: got %d want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected clusters: got %v want %v", got, want)
		}
	}
	if strings.Contains(strings.Join(got, ","), "verbose") {
		t.Fatalf("expected deduplicated clusters to exclude verbose duplicate: %v", got)
	}
}

func TestAppendClusterHealth_UsesK8sClientHealth(t *testing.T) {
	t.Helper()

	k8sClient := newTestMultiClusterClient(t)

	healthyNode := k8stest.NewHealthyNode("node-a", 4, 8)
	unreadyNode := k8stest.NewHealthyNode("node-b", 2, 4)
	unreadyNode.Status.Conditions = []corev1.NodeCondition{
		{Type: corev1.NodeReady, Status: corev1.ConditionFalse},
	}

	runningPod := k8stest.NewRunningPod("api", "default")
	boundPVC := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: "data", Namespace: "default"},
		Status:     corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimBound},
	}

	k8sClient.SetClient("west", fake.NewSimpleClientset(healthyNode, unreadyNode, runningPod, boundPVC))

	var sb strings.Builder
	appendClusterHealth(&sb, context.Background(), nil, k8sClient, "west")
	got := sb.String()

	if !strings.Contains(got, "Health: healthy=true reachable=true nodes=2 readyNodes=1 pods=1 cpuCores=6") {
		t.Fatalf("expected formatted health summary, got %q", got)
	}
	if !strings.Contains(got, "Health issues: 1/2 nodes not ready") {
		t.Fatalf("expected node readiness issue, got %q", got)
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

func TestAppendPodIssues_UsesK8sClientIssues(t *testing.T) {
	t.Helper()

	k8sClient := newTestMultiClusterClient(t)

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "api",
			Namespace: "default",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{{
				Ready:        false,
				RestartCount: 7,
				State: corev1.ContainerState{
					Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"},
				},
			}},
		},
	}

	k8sClient.SetClient("west", k8stest.NewFakeClientWithPods(pod))

	var sb strings.Builder
	appendPodIssues(&sb, context.Background(), nil, k8sClient, "west", "default")
	got := sb.String()

	if !strings.Contains(got, "Pod issues:\n- default/api status=CrashLoopBackOff restarts=7") {
		t.Fatalf("expected pod issue summary, got %q", got)
	}
	if !strings.Contains(got, "reason=CrashLoopBackOff issues=CrashLoopBackOff; High restarts (7)") {
		t.Fatalf("expected issue details from k8s client, got %q", got)
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

func TestAppendWarningEvents_UsesK8sClientEvents(t *testing.T) {
	t.Helper()

	k8sClient := newTestMultiClusterClient(t)

	event := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "api.123",
			Namespace: "default",
		},
		Type:    "Warning",
		Reason:  "FailedScheduling",
		Message: "Insufficient cpu",
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: "api",
		},
		Count: 3,
	}

	k8sClient.SetClient("west", fake.NewSimpleClientset(event))

	var sb strings.Builder
	appendWarningEvents(&sb, context.Background(), nil, k8sClient, "west", "default")
	got := sb.String()

	if !strings.Contains(got, "Recent warning events:\n- FailedScheduling default/Pod/api x3: Insufficient cpu") {
		t.Fatalf("expected warning event summary, got %q", got)
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

func TestAppendFormattedBridgePodIssues_TruncatesAndFormats(t *testing.T) {
	t.Helper()

	issues := make([]mcp.PodIssue, 0, providerClusterContextIssueLimit+2)
	for i := 0; i < providerClusterContextIssueLimit+2; i++ {
		issues = append(issues, mcp.PodIssue{
			Namespace: "default",
			Name:      "bridge-pod-" + string(rune('a'+i)),
			Status:    "Pending",
			Reason:    "Unschedulable",
			Restarts:  i,
			Issues:    []string{"not ready", "blocked"},
		})
	}

	var sb strings.Builder
	appendFormattedBridgePodIssues(&sb, issues)
	got := sb.String()

	if !strings.HasPrefix(got, "Pod issues:\n") {
		t.Fatalf("unexpected header: %q", got)
	}
	if strings.Count(got, "\n- ") != providerClusterContextIssueLimit {
		t.Fatalf("expected %d formatted issues, got %q", providerClusterContextIssueLimit, got)
	}
	if !strings.Contains(got, "reason=Unschedulable issues=not ready; blocked") {
		t.Fatalf("expected formatted bridge issue details, got %q", got)
	}
	if strings.Contains(got, "bridge-pod-j") {
		t.Fatalf("expected output truncated to %d items, got %q", providerClusterContextIssueLimit, got)
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
