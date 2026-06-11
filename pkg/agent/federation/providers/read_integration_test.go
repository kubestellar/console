package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// ---------- Clusternet ReadClusters ----------

func TestClusternetReadClusters_ReturnsClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/clusters.clusternet.io/v1beta1/managedclusters": map[string]interface{}{
			"kind":       "ManagedClusterList",
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "edge-node-1",
						"labels": map[string]interface{}{
							"clusternet.io/cluster-id": "group-a",
						},
					},
					"status": map[string]interface{}{
						"apiServerURL": "https://192.168.1.10:6443",
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "True",
							},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "edge-node-2",
						"labels": map[string]interface{}{
							"clusternet.io/cluster-id": "group-a",
						},
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "False",
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &clusternetProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}
	if clusters[0].Name != "edge-node-1" {
		t.Errorf("expected first cluster edge-node-1, got %s", clusters[0].Name)
	}
	if clusters[0].APIServerURL != "https://192.168.1.10:6443" {
		t.Errorf("expected API URL https://192.168.1.10:6443, got %s", clusters[0].APIServerURL)
	}
	if clusters[0].ClusterSet != "group-a" {
		t.Errorf("expected clusterSet group-a, got %s", clusters[0].ClusterSet)
	}
}

func TestClusternetReadClusters_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &clusternetProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if clusters != nil {
		t.Errorf("expected nil clusters, got %v", clusters)
	}
}

// ---------- Clusternet ReadGroups ----------

func TestClusternetReadGroups_ReturnGroups(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/clusters.clusternet.io/v1beta1/managedclusters": map[string]interface{}{
			"kind":       "ManagedClusterList",
			"apiVersion": "clusters.clusternet.io/v1beta1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "node-1",
						"labels": map[string]interface{}{
							"clusternet.io/cluster-id": "region-us",
						},
					},
					"status": map[string]interface{}{},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "node-2",
						"labels": map[string]interface{}{
							"clusternet.io/cluster-id": "region-us",
						},
					},
					"status": map[string]interface{}{},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "node-3",
						"labels": map[string]interface{}{
							"clusternet.io/cluster-id": "region-eu",
						},
					},
					"status": map[string]interface{}{},
				},
			},
		},
	})
	defer ts.Close()

	p := &clusternetProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(groups))
	}
	foundUS, foundEU := false, false
	for _, g := range groups {
		if g.Name == "region-us" {
			foundUS = true
			if len(g.Members) != 2 {
				t.Errorf("expected 2 members in region-us, got %d", len(g.Members))
			}
		}
		if g.Name == "region-eu" {
			foundEU = true
			if len(g.Members) != 1 {
				t.Errorf("expected 1 member in region-eu, got %d", len(g.Members))
			}
		}
	}
	if !foundUS {
		t.Error("missing region-us group")
	}
	if !foundEU {
		t.Error("missing region-eu group")
	}
}

func TestClusternetReadGroups_NoLabels(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/clusters.clusternet.io/v1beta1/managedclusters": map[string]interface{}{
			"kind":  "ManagedClusterList",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "node-no-labels"},
					"status":   map[string]interface{}{},
				},
			},
		},
	})
	defer ts.Close()

	p := &clusternetProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 0 {
		t.Errorf("expected 0 groups, got %d", len(groups))
	}
}

// ---------- Clusternet ReadPendingJoins ----------

func TestClusternetReadPendingJoins_ReturnsPending(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/clusters.clusternet.io/v1beta1/managedclusters": map[string]interface{}{
			"kind":  "ManagedClusterList",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "pending-cluster",
						"creationTimestamp": "2026-01-01T00:00:00Z",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "False",
							},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "ready-cluster",
						"creationTimestamp": "2026-01-01T00:00:00Z",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "True",
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &clusternetProvider{}
	pending, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(pending))
	}
	if pending[0].ClusterName != "pending-cluster" {
		t.Errorf("expected pending-cluster, got %s", pending[0].ClusterName)
	}
}

// ---------- Karmada ReadClusters ----------

func TestKarmadaReadClusters_ReturnsClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.karmada.io/v1alpha1/clusters": map[string]interface{}{
			"kind":       "ClusterList",
			"apiVersion": "cluster.karmada.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "member-1",
						"labels": map[string]interface{}{
							"region": "us-east",
						},
					},
					"spec": map[string]interface{}{
						"apiEndpoint": "https://10.0.0.5:6443",
						"taints": []interface{}{
							map[string]interface{}{
								"key":    "node.karmada.io/not-ready",
								"effect": "NoSchedule",
							},
						},
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "True",
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &karmadaProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(clusters))
	}
	if clusters[0].Name != "member-1" {
		t.Errorf("expected name member-1, got %s", clusters[0].Name)
	}
	if clusters[0].APIServerURL != "https://10.0.0.5:6443" {
		t.Errorf("expected API URL https://10.0.0.5:6443, got %s", clusters[0].APIServerURL)
	}
}

func TestKarmadaReadClusters_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &karmadaProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if clusters != nil {
		t.Errorf("expected nil clusters, got %v", clusters)
	}
}

// ---------- Karmada ReadGroups ----------

func TestKarmadaReadGroups_ReturnGroups(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/policy.karmada.io/v1alpha1/propagationpolicies": map[string]interface{}{
			"kind":       "PropagationPolicyList",
			"apiVersion": "policy.karmada.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":      "spread-to-us",
						"namespace": "default",
					},
					"spec": map[string]interface{}{
						"placement": map[string]interface{}{
							"clusterAffinity": map[string]interface{}{
								"clusterNames": []interface{}{"member-1", "member-2"},
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &karmadaProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(groups))
	}
	if groups[0].Name != "spread-to-us" {
		t.Errorf("expected name spread-to-us, got %s", groups[0].Name)
	}
	if len(groups[0].Members) != 2 {
		t.Errorf("expected 2 members, got %d", len(groups[0].Members))
	}
}

func TestKarmadaReadGroups_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &karmadaProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if groups != nil {
		t.Errorf("expected nil groups, got %v", groups)
	}
}

// ---------- Karmada ReadPendingJoins ----------

func TestKarmadaReadPendingJoins_ReturnsPending(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.karmada.io/v1alpha1/clusters": map[string]interface{}{
			"kind":  "ClusterList",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "pending-member",
						"creationTimestamp": "2026-02-01T12:00:00Z",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "False",
							},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "ready-member",
						"creationTimestamp": "2026-02-01T12:00:00Z",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "True",
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &karmadaProvider{}
	pending, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(pending))
	}
	if pending[0].ClusterName != "pending-member" {
		t.Errorf("expected pending-member, got %s", pending[0].ClusterName)
	}
}

func TestKarmadaReadPendingJoins_NoneReady(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.karmada.io/v1alpha1/clusters": map[string]interface{}{
			"kind":  "ClusterList",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "ready-member",
						"creationTimestamp": "2026-02-01T12:00:00Z",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Ready",
								"status": "True",
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &karmadaProvider{}
	pending, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pending) != 0 {
		t.Errorf("expected 0 pending joins, got %d", len(pending))
	}
}

// ---------- CAPI ReadPendingJoins ----------

func TestCAPIReadPendingJoins_NoPending(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.x-k8s.io/v1beta1/clusters": map[string]interface{}{
			"kind":  "ClusterList",
			"items": []interface{}{},
		},
	})
	defer ts.Close()

	p := &capiProvider{}
	pending, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pending != nil {
		t.Errorf("CAPI ReadPendingJoins should always return nil, got %v", pending)
	}
}

// ---------- CAPI safeInt64ToInt32 ----------

func TestSafeInt64ToInt32_ReadIntegration(t *testing.T) {
	tests := []struct {
		input    int64
		expected int32
	}{
		{0, 0},
		{1, 1},
		{100, 100},
		{2147483647, 2147483647},   // MaxInt32
		{2147483648, 2147483647},   // overflow capped
		{-1, -1},
		{-2147483648, -2147483648}, // MinInt32
		{-2147483649, -2147483648}, // underflow capped
	}
	for _, tt := range tests {
		got := safeInt64ToInt32(tt.input)
		if got != tt.expected {
			t.Errorf("safeInt64ToInt32(%d) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}

// ---------- CAPI capiAvailableFromState ----------

func TestCAPIAvailableFromState(t *testing.T) {
	tests := []struct {
		state    federation.ClusterState
		expected string
	}{
		{federation.ClusterStateProvisioned, "True"},
		{federation.ClusterStateProvisioning, "Unknown"},
		{federation.ClusterStatePending, "Unknown"},
		{federation.ClusterStateFailed, "False"},
		{federation.ClusterStateDeleting, "Unknown"},
		{federation.ClusterStateUnknown, "Unknown"},
	}
	for _, tt := range tests {
		got := capiAvailableFromState(tt.state)
		if got != tt.expected {
			t.Errorf("capiAvailableFromState(%q) = %q, want %q", tt.state, got, tt.expected)
		}
	}
}
