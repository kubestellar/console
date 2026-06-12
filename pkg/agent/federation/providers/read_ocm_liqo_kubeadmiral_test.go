package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// ────────────────────────────────────────────────────────────────────
// OCM ReadClusters
// ────────────────────────────────────────────────────────────────────

func TestOCMReadClusters_ReturnsClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.open-cluster-management.io/v1/managedclusters": map[string]interface{}{
			"kind":       "ManagedClusterList",
			"apiVersion": "cluster.open-cluster-management.io/v1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "spoke-1",
						"labels": map[string]interface{}{
							"cluster.open-cluster-management.io/clusterset": "production",
							"env": "prod",
						},
					},
					"spec": map[string]interface{}{
						"hubAcceptsClient": true,
						"managedClusterClientConfigs": []interface{}{
							map[string]interface{}{
								"url": "https://spoke-1.example.com:6443",
							},
						},
						"taints": []interface{}{
							map[string]interface{}{
								"key":    "node.cluster.io/unreachable",
								"effect": "NoSchedule",
							},
						},
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "ManagedClusterJoined",
								"status": "True",
							},
							map[string]interface{}{
								"type":   "ManagedClusterConditionAvailable",
								"status": "True",
							},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":   "spoke-2",
						"labels": map[string]interface{}{},
					},
					"spec": map[string]interface{}{
						"hubAcceptsClient": false,
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "ManagedClusterConditionAvailable",
								"status": "Unknown",
							},
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &ocmProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}

	// Verify first cluster
	c1 := clusters[0]
	if c1.Name != "spoke-1" {
		t.Errorf("expected spoke-1, got %s", c1.Name)
	}
	if c1.Provider != federation.ProviderOCM {
		t.Errorf("expected OCM provider, got %s", c1.Provider)
	}
	if c1.State != federation.ClusterStateJoined {
		t.Errorf("expected Joined state, got %s", c1.State)
	}
	if c1.Available != "True" {
		t.Errorf("expected available True, got %s", c1.Available)
	}
	if c1.ClusterSet != "production" {
		t.Errorf("expected clusterSet production, got %s", c1.ClusterSet)
	}
	if c1.APIServerURL != "https://spoke-1.example.com:6443" {
		t.Errorf("expected API URL https://spoke-1.example.com:6443, got %s", c1.APIServerURL)
	}
	if len(c1.Taints) != 1 {
		t.Errorf("expected 1 taint, got %d", len(c1.Taints))
	} else if c1.Taints[0].Key != "node.cluster.io/unreachable" {
		t.Errorf("expected taint key node.cluster.io/unreachable, got %s", c1.Taints[0].Key)
	}

	// Verify second cluster (pending, not joined)
	c2 := clusters[1]
	if c2.Name != "spoke-2" {
		t.Errorf("expected spoke-2, got %s", c2.Name)
	}
	if c2.State != federation.ClusterStatePending {
		t.Errorf("expected Pending state for spoke-2, got %s", c2.State)
	}
}

func TestOCMReadClusters_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &ocmProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("expected nil error for missing CRD, got %v", err)
	}
	if clusters != nil {
		t.Fatalf("expected nil clusters, got %+v", clusters)
	}
}

// ────────────────────────────────────────────────────────────────────
// OCM ReadGroups
// ────────────────────────────────────────────────────────────────────

func TestOCMReadGroups_ReturnsSets(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/cluster.open-cluster-management.io/v1beta2/managedclustersets": map[string]interface{}{
			"kind":       "ManagedClusterSetList",
			"apiVersion": "cluster.open-cluster-management.io/v1beta2",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "production",
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "staging",
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &ocmProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(groups))
	}
	names := map[string]bool{}
	for _, g := range groups {
		names[g.Name] = true
		if g.Provider != federation.ProviderOCM {
			t.Errorf("expected OCM provider, got %s", g.Provider)
		}
		if g.Kind != federation.FederatedGroupSet {
			t.Errorf("expected Set kind, got %s", g.Kind)
		}
	}
	if !names["production"] || !names["staging"] {
		t.Errorf("missing expected groups: %v", names)
	}
}

func TestOCMReadGroups_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &ocmProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if groups != nil {
		t.Fatalf("expected nil groups, got %+v", groups)
	}
}

// ────────────────────────────────────────────────────────────────────
// OCM ReadPendingJoins
// ────────────────────────────────────────────────────────────────────

func TestOCMReadPendingJoins_ReturnsPending(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/certificates.k8s.io/v1/certificatesigningrequests": map[string]interface{}{
			"kind":       "CertificateSigningRequestList",
			"apiVersion": "certificates.k8s.io/v1",
			"items": []interface{}{
				// Pending OCM CSR — should be returned
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "csr-spoke-3",
						"creationTimestamp": "2024-01-15T10:00:00Z",
					},
					"spec": map[string]interface{}{
						"username": "system:open-cluster-management:spoke-3:agent",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{},
					},
				},
				// Already approved CSR — should be filtered out
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "csr-spoke-4",
						"creationTimestamp": "2024-01-15T09:00:00Z",
					},
					"spec": map[string]interface{}{
						"username": "system:open-cluster-management:spoke-4:agent",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type": "Approved",
							},
						},
					},
				},
				// Non-OCM CSR — should be filtered out
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "csr-random",
						"creationTimestamp": "2024-01-15T08:00:00Z",
					},
					"spec": map[string]interface{}{
						"username": "system:node:worker-1",
					},
					"status": map[string]interface{}{
						"conditions": []interface{}{},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &ocmProvider{}
	joins, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(joins) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(joins))
	}
	if joins[0].ClusterName != "spoke-3" {
		t.Errorf("expected cluster name spoke-3, got %s", joins[0].ClusterName)
	}
	if joins[0].Provider != federation.ProviderOCM {
		t.Errorf("expected OCM provider, got %s", joins[0].Provider)
	}
}

func TestOCMReadPendingJoins_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &ocmProvider{}
	joins, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if joins != nil {
		t.Fatalf("expected nil, got %+v", joins)
	}
}

// ────────────────────────────────────────────────────────────────────
// Liqo ReadClusters
// ────────────────────────────────────────────────────────────────────

func TestLiqoReadClusters_ReturnsClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind":       "ForeignClusterList",
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "remote-1",
						"labels": map[string]interface{}{
							"liqo.io/region": "eu-west",
						},
					},
					"spec": map[string]interface{}{
						"controlPlaneEndpoint": "https://remote-1.liqo.io:6443",
					},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{
							map[string]interface{}{
								"type":   "OutgoingPeering",
								"status": "Active",
							},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":   "remote-2",
						"labels": map[string]interface{}{},
					},
					"spec": map[string]interface{}{
						"foreignAuthURL": "https://remote-2.liqo.io:443/auth",
					},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &liqoProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}

	// Active peer
	if clusters[0].Name != "remote-1" {
		t.Errorf("expected remote-1, got %s", clusters[0].Name)
	}
	if clusters[0].State != federation.ClusterStateJoined {
		t.Errorf("expected Joined, got %s", clusters[0].State)
	}
	if clusters[0].APIServerURL != "https://remote-1.liqo.io:6443" {
		t.Errorf("expected controlPlaneEndpoint URL, got %s", clusters[0].APIServerURL)
	}
	if clusters[0].Available != "True" {
		t.Errorf("expected True available, got %s", clusters[0].Available)
	}

	// Inactive peer (fallback to foreignAuthURL)
	if clusters[1].Name != "remote-2" {
		t.Errorf("expected remote-2, got %s", clusters[1].Name)
	}
	if clusters[1].State != federation.ClusterStatePending {
		t.Errorf("expected Pending, got %s", clusters[1].State)
	}
	if clusters[1].APIServerURL != "https://remote-2.liqo.io:443/auth" {
		t.Errorf("expected foreignAuthURL, got %s", clusters[1].APIServerURL)
	}
}

func TestLiqoReadClusters_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &liqoProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if clusters != nil {
		t.Fatalf("expected nil clusters, got %+v", clusters)
	}
}

// ────────────────────────────────────────────────────────────────────
// Liqo ReadGroups
// ────────────────────────────────────────────────────────────────────

func TestLiqoReadGroups_ReturnsActivePeers(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind":       "ForeignClusterList",
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "peer-a"},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{
							map[string]interface{}{"type": "OutgoingPeering", "status": "Active"},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "peer-b"},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{
							map[string]interface{}{"type": "IncomingPeering", "status": "Active"},
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "not-peered"},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &liqoProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 group (peers), got %d", len(groups))
	}
	if groups[0].Name != "peers" {
		t.Errorf("expected group name 'peers', got %s", groups[0].Name)
	}
	if groups[0].Kind != federation.FederatedGroupPeer {
		t.Errorf("expected Peer kind, got %s", groups[0].Kind)
	}
	if len(groups[0].Members) != 2 {
		t.Errorf("expected 2 members, got %d", len(groups[0].Members))
	}
}

func TestLiqoReadGroups_NoPeers(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind":       "ForeignClusterList",
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "not-peered"},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &liqoProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if groups != nil {
		t.Fatalf("expected nil when no peers, got %+v", groups)
	}
}

// ────────────────────────────────────────────────────────────────────
// Liqo ReadPendingJoins
// ────────────────────────────────────────────────────────────────────

func TestLiqoReadPendingJoins_ReturnsInactive(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind":       "ForeignClusterList",
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"items": []interface{}{
				// Active peer — should be excluded
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "active-peer",
						"creationTimestamp": "2024-01-01T00:00:00Z",
					},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{
							map[string]interface{}{"type": "OutgoingPeering", "status": "Active"},
						},
					},
				},
				// Inactive — should be included as pending
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "pending-peer",
						"creationTimestamp": "2024-02-15T12:00:00Z",
					},
					"status": map[string]interface{}{
						"peeringConditions": []interface{}{},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &liqoProvider{}
	joins, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(joins) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(joins))
	}
	if joins[0].ClusterName != "pending-peer" {
		t.Errorf("expected pending-peer, got %s", joins[0].ClusterName)
	}
	if joins[0].Provider != federation.ProviderLiqo {
		t.Errorf("expected Liqo provider, got %s", joins[0].Provider)
	}
}

// ────────────────────────────────────────────────────────────────────
// KubeAdmiral ReadClusters
// ────────────────────────────────────────────────────────────────────

func TestKubeAdmiralReadClusters_ReturnsClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind":       "FederatedClusterList",
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "member-1",
						"labels": map[string]interface{}{
							"region": "us-east",
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
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "member-2",
						"labels": map[string]interface{}{
							"region": "eu-west",
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

	p := &kubeAdmiralProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}
	if clusters[0].Name != "member-1" {
		t.Errorf("expected member-1, got %s", clusters[0].Name)
	}
	if clusters[0].Provider != federation.ProviderKubeAdmiral {
		t.Errorf("expected KubeAdmiral provider, got %s", clusters[0].Provider)
	}
}

func TestKubeAdmiralReadClusters_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &kubeAdmiralProvider{}
	clusters, err := p.ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if clusters != nil {
		t.Fatalf("expected nil, got %+v", clusters)
	}
}

// ────────────────────────────────────────────────────────────────────
// KubeAdmiral ReadGroups
// ────────────────────────────────────────────────────────────────────

func TestKubeAdmiralReadGroups_ReturnsLabelGroups(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind":       "FederatedClusterList",
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "cluster-a",
						"labels": map[string]interface{}{
							"env": "prod",
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "cluster-b",
						"labels": map[string]interface{}{
							"env": "prod",
						},
					},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name": "cluster-c",
						"labels": map[string]interface{}{
							"env": "staging",
						},
					},
				},
			},
		},
	})
	defer ts.Close()

	p := &kubeAdmiralProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have "env=prod" (2 members) and "env=staging" (1 member)
	groupMap := map[string]int{}
	for _, g := range groups {
		groupMap[g.Name] = len(g.Members)
		if g.Provider != federation.ProviderKubeAdmiral {
			t.Errorf("expected KubeAdmiral provider, got %s", g.Provider)
		}
		if g.Kind != federation.FederatedGroupSelector {
			t.Errorf("expected Selector kind, got %s", g.Kind)
		}
	}
	if groupMap["env=prod"] != 2 {
		t.Errorf("expected env=prod group with 2 members, got %d", groupMap["env=prod"])
	}
	if groupMap["env=staging"] != 1 {
		t.Errorf("expected env=staging group with 1 member, got %d", groupMap["env=staging"])
	}
}

func TestKubeAdmiralReadGroups_GroupNotFound(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{})
	defer ts.Close()

	p := &kubeAdmiralProvider{}
	groups, err := p.ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if groups != nil {
		t.Fatalf("expected nil, got %+v", groups)
	}
}

// ────────────────────────────────────────────────────────────────────
// KubeAdmiral ReadPendingJoins
// ────────────────────────────────────────────────────────────────────

func TestKubeAdmiralReadPendingJoins_ReturnsPending(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind":       "FederatedClusterList",
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"items": []interface{}{
				// Ready cluster — not pending
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "ready-cluster",
						"creationTimestamp": "2024-01-01T00:00:00Z",
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
				// Not-ready cluster — should be pending
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "pending-cluster",
						"creationTimestamp": "2024-03-01T10:00:00Z",
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

	p := &kubeAdmiralProvider{}
	joins, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(joins) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(joins))
	}
	if joins[0].ClusterName != "pending-cluster" {
		t.Errorf("expected pending-cluster, got %s", joins[0].ClusterName)
	}
	if joins[0].Provider != federation.ProviderKubeAdmiral {
		t.Errorf("expected KubeAdmiral provider, got %s", joins[0].Provider)
	}
}

func TestKubeAdmiralReadPendingJoins_AllReady(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind":       "FederatedClusterList",
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{
						"name":              "ready-cluster",
						"creationTimestamp": "2024-01-01T00:00:00Z",
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

	p := &kubeAdmiralProvider{}
	joins, err := p.ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(joins) != 0 {
		t.Fatalf("expected 0 pending joins, got %d", len(joins))
	}
}
