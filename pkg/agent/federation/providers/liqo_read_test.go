package providers

import (
	"context"
	"testing"
)

func TestLiqoReadClusters(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind":       "ForeignClusterList",
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"items": []interface{}{
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "peer-1"},
					"spec":     map[string]interface{}{"controlPlaneEndpoint": "https://peer-1:6443"},
					"status": map[string]interface{}{"peeringConditions": []interface{}{
						map[string]interface{}{"type": "OutgoingPeering", "status": "Active"},
					}},
				},
				map[string]interface{}{
					"metadata": map[string]interface{}{"name": "peer-2"},
					"spec":     map[string]interface{}{"foreignAuthURL": "https://peer-2:9443/auth"},
					"status": map[string]interface{}{"peeringConditions": []interface{}{
						map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"},
					}},
				},
			},
		},
	})
	defer ts.Close()

	clusters, err := (&liqoProvider{}).ReadClusters(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ReadClusters returned error: %v", err)
	}
	if len(clusters) != 2 {
		t.Fatalf("expected 2 clusters, got %d", len(clusters))
	}
	if clusters[0].State != "joined" || clusters[1].State != "pending" {
		t.Fatalf("unexpected states: %#v", clusters)
	}
	if clusters[1].APIServerURL != "https://peer-2:9443/auth" {
		t.Fatalf("expected foreignAuthURL fallback, got %s", clusters[1].APIServerURL)
	}
}

func TestLiqoReadGroups(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind": "ForeignClusterList",
			"items": []interface{}{
				map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-1"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Active"}}}},
				map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-2"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "IncomingPeering", "status": "Active"}}}},
				map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-3"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"}}}},
			},
		},
	})
	defer ts.Close()

	groups, err := (&liqoProvider{}).ReadGroups(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ReadGroups returned error: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected 1 peers group, got %d", len(groups))
	}
	if groups[0].Name != "peers" || len(groups[0].Members) != 2 {
		t.Fatalf("unexpected group: %+v", groups[0])
	}
}

func TestLiqoReadPendingJoins(t *testing.T) {
	ts, cfg := fakeAPIServer(t, map[string]interface{}{
		"/apis/discovery.liqo.io/v1alpha1/foreignclusters": map[string]interface{}{
			"kind": "ForeignClusterList",
			"items": []interface{}{
				map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-1", "creationTimestamp": "2026-01-01T00:00:00Z"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Pending"}}}},
				map[string]interface{}{"metadata": map[string]interface{}{"name": "peer-2", "creationTimestamp": "2026-01-01T00:00:00Z"}, "status": map[string]interface{}{"peeringConditions": []interface{}{map[string]interface{}{"type": "OutgoingPeering", "status": "Active"}}}},
			},
		},
	})
	defer ts.Close()

	pending, err := (&liqoProvider{}).ReadPendingJoins(context.Background(), cfg)
	if err != nil {
		t.Fatalf("ReadPendingJoins returned error: %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending join, got %d", len(pending))
	}
	if pending[0].ClusterName != "peer-1" {
		t.Fatalf("expected peer-1, got %s", pending[0].ClusterName)
	}
}
