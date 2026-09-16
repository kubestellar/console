package k8s

import (
	"context"
	"sort"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestGetClient_ReturnsInjectedClient(t *testing.T) {
	m, err := NewMultiClusterClient("")
	if err != nil {
		t.Fatalf("NewMultiClusterClient failed: %v", err)
	}

	fakeClient := k8sfake.NewSimpleClientset()
	m.clients["test-ctx"] = fakeClient

	retrieved, err := m.GetClient("test-ctx")
	if err != nil {
		t.Fatalf("GetClient failed: %v", err)
	}

	if retrieved != fakeClient {
		t.Error("GetClient did not return the injected client")
	}
}

func TestMultiClusterClient_ListClusters(t *testing.T) {
	// Setup a config with multiple contexts
	rawConfig := &api.Config{
		CurrentContext: "cluster-1",
		Contexts: map[string]*api.Context{
			"cluster-1": {Cluster: "c1", AuthInfo: "u1"},
			"cluster-2": {Cluster: "c2", AuthInfo: "u2"},
		},
		Clusters: map[string]*api.Cluster{
			"c1": {Server: "https://c1.com"},
			"c2": {Server: "https://c2.com"},
		},
		AuthInfos: map[string]*api.AuthInfo{
			"u1": {Username: "admin"},
			"u2": {Username: "dev"},
		},
	}

	m := &MultiClusterClient{
		rawConfig: rawConfig,
		clients:   make(map[string]kubernetes.Interface),
	}

	clusters, err := m.ListClusters(context.Background())
	if err != nil {
		t.Fatalf("ListClusters failed: %v", err)
	}

	if len(clusters) != 2 {
		t.Fatalf("Got %d clusters, want 2", len(clusters))
	}

	// Validate sorting and content
	// "cluster-1" comes before "cluster-2" alphabetically
	if clusters[0].Name != "cluster-1" {
		t.Errorf("Expected first cluster to be cluster-1, got %s", clusters[0].Name)
	}
	if !clusters[0].IsCurrent {
		t.Error("Expected cluster-1 to be current")
	}
	if clusters[0].Server != "https://c1.com" {
		t.Errorf("Expected server https://c1.com, got %s", clusters[0].Server)
	}
}

func TestMultiClusterClient_DeduplicatedClusters(t *testing.T) {
	rawConfig := &api.Config{
		Contexts: map[string]*api.Context{
			"short-name":                      {Cluster: "c1"},
			"long/auto/generated/name/for/c1": {Cluster: "c1"},
			"unique-cluster":                  {Cluster: "c2"},
		},
		Clusters: map[string]*api.Cluster{
			"c1": {Server: "https://shared.com"},
			"c2": {Server: "https://unique.com"},
		},
	}

	m := &MultiClusterClient{
		rawConfig: rawConfig,
		clients:   make(map[string]kubernetes.Interface),
	}

	clusters, err := m.DeduplicatedClusters(context.Background())
	if err != nil {
		t.Fatalf("DeduplicatedClusters failed: %v", err)
	}

	if len(clusters) != 2 {
		t.Fatalf("Expected 2 unique clusters, got %d", len(clusters))
	}

	// Verify that the short name was picked for the duplicate server
	names := []string{clusters[0].Name, clusters[1].Name}
	sort.Strings(names)

	if names[0] != "short-name" {
		t.Errorf("Expected 'short-name' to be preserved, got %v", names)
	}
	if names[1] != "unique-cluster" {
		t.Errorf("Expected 'unique-cluster' to be preserved, got %v", names)
	}
}

func TestMultiClusterClient_GetDynamicClient(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeDyn := fake.NewSimpleDynamicClient(runScheme())
	m.dynamicClients["test-dyn"] = fakeDyn

	retrieved, err := m.GetDynamicClient("test-dyn")
	if err != nil {
		t.Fatalf("GetDynamicClient failed: %v", err)
	}
	if retrieved != fakeDyn {
		t.Error("GetDynamicClient did not return injected client")
	}
}

func TestMultiClusterClient_Concurrency(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.clients["ctx"] = k8sfake.NewSimpleClientset()

	// Simulate concurrent access
	concurrency := 10
	errCh := make(chan error, concurrency)

	for i := 0; i < concurrency; i++ {
		go func() {
			_, err := m.GetClient("ctx")
			errCh <- err
		}()
	}

	for i := 0; i < concurrency; i++ {
		err := <-errCh
		if err != nil {
			t.Errorf("Concurrent GetClient failed: %v", err)
		}
	}
}

func TestIsBetterClusterName(t *testing.T) {
	tests := []struct {
		candidate string
		current   string
		want      bool
	}{
		{"short", "long/complicated/name:port", true},
		{"long/complicated/name:port", "short", false},
		{"abc", "defg", true},
		{"defg", "abc", false},
	}

	for _, tt := range tests {
		if got := isBetterClusterName(tt.candidate, tt.current); got != tt.want {
			t.Errorf("isBetterClusterName(%q, %q) = %v, want %v", tt.candidate, tt.current, got, tt.want)
		}
	}
}

func TestMultiClusterClient_InCluster(t *testing.T) {
	m := &MultiClusterClient{
		inClusterConfig: &rest.Config{Host: "https://kubernetes.default"},
	}

	if !m.IsInCluster() {
		t.Error("Msg IsInCluster() should range true when inClusterConfig is set")
	}

	clusters, _ := m.ListClusters(context.Background())
	found := false
	for _, c := range clusters {
		if c.Name == "in-cluster" {
			found = true
			if c.Server != "https://kubernetes.default" {
				t.Errorf("In-cluster server mismatch: %s", c.Server)
			}
		}
	}
	if !found {
		t.Error("ListClusters did not return in-cluster config")
	}
}

func TestGetClusterHealth(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node1"},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
			},
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU: resource.MustParse("2"),
			},
		},
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "pod1", Namespace: "default"},
		Status:     corev1.PodStatus{Phase: corev1.PodRunning},
	}

	fakeCS := k8sfake.NewSimpleClientset(node, pod)
	m.clients["c1"] = fakeCS

	health, err := m.GetClusterHealth(context.Background(), "c1")
	if err != nil {
		t.Fatalf("GetClusterHealth failed: %v", err)
	}

	if !health.Healthy {
		t.Error("Expected cluster to be healthy")
	}
	if health.NodeCount != 1 || health.ReadyNodes != 1 {
		t.Errorf("Node counts mismatch: %+v", health)
	}
	if health.PodCount != 1 {
		t.Errorf("Pod count mismatch: %d", health.PodCount)
	}
}

func TestGetAllClusterHealth(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Setup 2 clusters in rawConfig
	m.rawConfig = &api.Config{
		Contexts: map[string]*api.Context{
			"c1": {Cluster: "cl1"},
			"c2": {Cluster: "cl2"},
		},
		Clusters: map[string]*api.Cluster{
			"cl1": {Server: "s1"},
			"cl2": {Server: "s2"},
		},
	}

	// Inject fake clients
	m.clients["c1"] = k8sfake.NewSimpleClientset()
	m.clients["c2"] = k8sfake.NewSimpleClientset()

	results, err := m.GetAllClusterHealth(context.Background())
	if err != nil {
		t.Fatalf("GetAllClusterHealth failed: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("Expected 2 results, got %d", len(results))
	}
}

func TestClassifyError(t *testing.T) {
	tests := []struct {
		msg  string
		want string
	}{
		{"context deadline exceeded", "timeout"},
		{"i/o timeout", "timeout"},
		{"timeout waiting for connection", "timeout"},
		{"401 Unauthorized", "auth"},
		{"403 Forbidden", "auth"},
		{"forbidden: not allowed", "auth"},
		{"invalid token", "auth"},
		{"token expired", "auth"},
		{"authentication required", "auth"},
		{"connection refused", "network"},
		{"no route to host", "network"},
		{"network unreachable", "network"},
		{"dial tcp 10.0.0.1:443", "network"},
		{"no such host", "network"},
		{"lookup cluster.example.com", "network"},
		{"x509: certificate signed by unknown authority", "certificate"},
		{"tls handshake error", "certificate"},
		{"ssl: bad certificate", "certificate"},
		{"certificate has expired", "certificate"},
		{"something else", "unknown"},
		{"", "unknown"},

		// #6508 — exec-plugin missing must NOT be classified as auth, because
		// auth errors get the 10-minute authFailureCacheTTL which hides a
		// fixable config problem behind a stale "unreachable" entry.
		{`exec: "aws-iam-authenticator": executable file not found in $PATH`, "config"},
		{"exec plugin: executable not found", "config"},
		{"executable file not found", "config"},
		// Real auth errors still classify as auth
		{"getting credentials: token request failed", "auth"},
		{"credentials not provided", "auth"},
		// Ensure a generic "not found" for a MISSING resource still hits the
		// not_found branch (used for missing kubeconfig contexts, #4907)
		{"context \"foo\" does not exist", "not_found"},
	}

	for _, tt := range tests {
		if got := classifyError(tt.msg); got != tt.want {
			t.Errorf("classifyError(%q) = %q, want %q", tt.msg, got, tt.want)
		}
	}
}
