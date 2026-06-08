package agent

import (
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
)

// --- extractResourceKind ---

func TestExtractResourceKind_Valid(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Pod/nginx", "Pod"},
		{"Deployment/app", "Deployment"},
		{"Service/frontend", "Service"},
		{"ReplicaSet/app-abc123", "ReplicaSet"},
	}
	for _, tt := range tests {
		got := extractResourceKind(tt.input)
		if got != tt.want {
			t.Errorf("extractResourceKind(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestExtractResourceKind_NoSlash(t *testing.T) {
	got := extractResourceKind("nginx")
	if got != "" {
		t.Errorf("expected empty string for input without slash, got %q", got)
	}
}

func TestExtractResourceKind_Empty(t *testing.T) {
	got := extractResourceKind("")
	if got != "" {
		t.Errorf("expected empty string for empty input, got %q", got)
	}
}

func TestExtractResourceKind_MultipleSlashes(t *testing.T) {
	// Should return everything before the first slash
	got := extractResourceKind("ConfigMap/dir/file")
	if got != "ConfigMap" {
		t.Errorf("expected 'ConfigMap', got %q", got)
	}
}

// --- extractResourceName ---

func TestExtractResourceName_Valid(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"Pod/nginx", "nginx"},
		{"Deployment/app", "app"},
		{"Service/frontend", "frontend"},
	}
	for _, tt := range tests {
		got := extractResourceName(tt.input)
		if got != tt.want {
			t.Errorf("extractResourceName(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestExtractResourceName_NoSlash(t *testing.T) {
	// When there's no slash, the whole string is the name
	got := extractResourceName("nginx")
	if got != "nginx" {
		t.Errorf("expected 'nginx' for input without slash, got %q", got)
	}
}

func TestExtractResourceName_Empty(t *testing.T) {
	got := extractResourceName("")
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestExtractResourceName_MultipleSlashes(t *testing.T) {
	// Should return everything after the first slash
	got := extractResourceName("ConfigMap/dir/file")
	if got != "dir/file" {
		t.Errorf("expected 'dir/file', got %q", got)
	}
}

// --- ptrInt64 ---

func TestPtrInt64(t *testing.T) {
	p := ptrInt64(42)
	if p == nil {
		t.Fatal("expected non-nil pointer")
	}
	if *p != 42 {
		t.Errorf("expected 42, got %d", *p)
	}
}

func TestPtrInt64_Zero(t *testing.T) {
	p := ptrInt64(0)
	if *p != 0 {
		t.Errorf("expected 0, got %d", *p)
	}
}

// --- summarizeEvent ---

func TestSummarizeEvent_ValidEvent(t *testing.T) {
	ev := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "default",
		},
		Type:    "Warning",
		Reason:  "BackOff",
		Message: "Back-off restarting failed container",
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: "nginx-abc123",
		},
		LastTimestamp: metav1.Time{Time: time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)},
	}

	summary := summarizeEvent(watch.Event{Object: ev}, "prod-cluster")

	if summary.Type != "Warning" {
		t.Errorf("expected Type 'Warning', got %q", summary.Type)
	}
	if summary.Reason != "BackOff" {
		t.Errorf("expected Reason 'BackOff', got %q", summary.Reason)
	}
	if summary.Message != "Back-off restarting failed container" {
		t.Errorf("unexpected Message: %q", summary.Message)
	}
	if summary.Object != "Pod/nginx-abc123" {
		t.Errorf("expected Object 'Pod/nginx-abc123', got %q", summary.Object)
	}
	if summary.Namespace != "default" {
		t.Errorf("expected Namespace 'default', got %q", summary.Namespace)
	}
	if summary.Cluster != "prod-cluster" {
		t.Errorf("expected Cluster 'prod-cluster', got %q", summary.Cluster)
	}
	if summary.LastSeen == "" {
		t.Error("expected non-empty LastSeen")
	}
}

func TestSummarizeEvent_ZeroTimestamp(t *testing.T) {
	ev := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Namespace: "kube-system"},
		Type:       "Normal",
		Reason:     "Scheduled",
		Message:    "Successfully assigned",
		InvolvedObject: corev1.ObjectReference{
			Kind: "Pod",
			Name: "coredns-xyz",
		},
		// LastTimestamp is zero
	}

	summary := summarizeEvent(watch.Event{Object: ev}, "test-cluster")

	if summary.LastSeen != "" {
		t.Errorf("expected empty LastSeen for zero timestamp, got %q", summary.LastSeen)
	}
	if summary.Cluster != "test-cluster" {
		t.Errorf("expected Cluster 'test-cluster', got %q", summary.Cluster)
	}
}

func TestSummarizeEvent_NonEventObject(t *testing.T) {
	// When the watch event is not a *corev1.Event, summarize should return
	// a minimal summary with just the cluster field.
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "nginx"},
	}
	summary := summarizeEvent(watch.Event{Object: pod}, "my-cluster")

	if summary.Cluster != "my-cluster" {
		t.Errorf("expected Cluster 'my-cluster', got %q", summary.Cluster)
	}
	if summary.Type != "" || summary.Reason != "" || summary.Message != "" {
		t.Errorf("expected empty fields for non-Event object, got: %+v", summary)
	}
}

// --- filterStreamClusters ---

func TestFilterStreamClusters_EmptyFilter(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "cluster-a"},
		{Name: "cluster-b"},
	}
	result := filterStreamClusters(clusters, "")
	if len(result) != 2 {
		t.Errorf("expected all clusters returned with empty filter, got %d", len(result))
	}
}

func TestFilterStreamClusters_MatchingFilter(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "cluster-a"},
		{Name: "cluster-b"},
		{Name: "cluster-c"},
	}
	result := filterStreamClusters(clusters, "cluster-b")
	if len(result) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(result))
	}
	if result[0].Name != "cluster-b" {
		t.Errorf("expected 'cluster-b', got %q", result[0].Name)
	}
}

func TestFilterStreamClusters_NoMatch(t *testing.T) {
	clusters := []protocol.ClusterInfo{
		{Name: "cluster-a"},
		{Name: "cluster-b"},
	}
	result := filterStreamClusters(clusters, "nonexistent")
	if len(result) != 0 {
		t.Errorf("expected 0 clusters for non-matching filter, got %d", len(result))
	}
}

func TestFilterStreamClusters_EmptyClusters(t *testing.T) {
	result := filterStreamClusters(nil, "cluster-a")
	if len(result) != 0 {
		t.Errorf("expected 0 clusters for nil input, got %d", len(result))
	}
}

// Ensure runtime.Object interface satisfaction for the test (compile check)
var _ runtime.Object = &corev1.Event{}
var _ runtime.Object = &corev1.Pod{}
