package providers

import (
	"context"
	"testing"
)

func TestKubeAdmiralReadClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind":       "FederatedClusterList",
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "member-1", "labels": map[string]interface{}{"region": "us-east"}},
					"spec":     map[string]interface{}{"apiEndpoint": "https://member-1:6443"},
					"status": map[string]interface{}{"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "True"},
					}},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "member-2"},
					"status": map[string]interface{}{"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "False"},
					}},
				},
			},
		},
	})
	defer ts.Close()

	clusters, err := (&kubeAdmiralProvider{}).ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ReadClusters returned error: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}
	if clusters[0].Name != "member-1" || clusters[0].Available != "True" {
		t.Fatalf("unexpected first cluster: %+v", clusters[0])
	}
	if clusters[1].Name != "member-2" || clusters[1].Available != "False" {
		t.Fatalf("unexpected second cluster: %+v", clusters[1])
	}
}

func TestKubeAdmiralReadGroups(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind": "FederatedClusterList",
			"items": []interface{}{
				map[string]interface{}{"metadata": map[string]interface{}{"name": "member-1", "labels": map[string]interface{}{"region": "us-east", "env": "prod"}}},
				map[string]interface{}{"metadata": map[string]interface{}{"name": "member-2", "labels": map[string]interface{}{"region": "us-east"}}},
			},
		},
	})
	defer ts.Close()

	groups, err := (&kubeAdmiralProvider{}).ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ReadGroups returned error: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("expected 2 synthetic groups, got %d", len(groups))
	}

	foundRegion := false
	foundEnv := false
	for _, group := range groups {
		switch group.Name {
		case "region=us-east":
			foundRegion = true
			if len(group.Members) != 2 {
				t.Fatalf("expected 2 members in region group, got %d", len(group.Members))
			}
		case "env=prod":
			foundEnv = true
			if len(group.Members) != 1 || group.Members[0] != "member-1" {
				t.Fatalf("unexpected env group members: %#v", group.Members)
			}
		}
	}
	if !foundRegion || !foundEnv {
		t.Fatalf("missing expected groups: foundRegion=%v foundEnv=%v", foundRegion, foundEnv)
	}
}

func TestKubeAdmiralReadPendingJoins(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/core.kubeadmiral.io/v1alpha1/federatedclusters": map[string]interface{}{
			"kind": "FederatedClusterList",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "pending-member", "creationTimestamp": "2026-01-01T00:00:00Z"},
					"status": map[string]interface{}{"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "False"},
					}},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "joined-member", "creationTimestamp": "2026-01-01T00:00:00Z"},
					"status": map[string]interface{}{"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "True"},
					}},
				},
			},
		},
	})
	defer ts.Close()

	pending, err := (&kubeAdmiralProvider{}).ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ReadPendingJoins returned error: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(pending))
	}
	if pending[0].ClusterName != "pending-member" {
		t.Fatalf("expected pending-member, got %s", pending[0].ClusterName)
	}
}
