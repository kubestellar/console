package providers

import (
	"context"
	"testing"
)

func TestClusternetApproveCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"

	t.Run("approves cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "clusters.clusternet.io/v1beta1", "kind": "ManagedCluster", "metadata": map[string]interface{}{"name": "edge-1"}, "spec": map[string]interface{}{"approved": false}},
		}, nil)
		defer server.Close()

		result, err := clusternetApproveCluster(context.Background(), cfg, "edge-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		updated := state.object(clusterPath)
		approved := updated["spec"].(map[string]interface{})["approved"].(bool)
		if !approved {
			t.Fatal("expected spec.approved to be true")
		}
	})

	t.Run("returns already when approved", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "clusters.clusternet.io/v1beta1", "kind": "ManagedCluster", "metadata": map[string]interface{}{"name": "edge-1"}, "spec": map[string]interface{}{"approved": true}},
		}, nil)
		defer server.Close()

		result, err := clusternetApproveCluster(context.Background(), cfg, "edge-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}

func TestClusternetUnregisterCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/clusters.clusternet.io/v1beta1/managedclusters/edge-1"

	t.Run("deletes cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "clusters.clusternet.io/v1beta1", "kind": "ManagedCluster", "metadata": map[string]interface{}{"name": "edge-1"}},
		}, nil)
		defer server.Close()

		result, err := clusternetUnregisterCluster(context.Background(), cfg, "edge-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		if state.object(clusterPath) != nil {
			t.Fatal("expected cluster to be deleted")
		}
	})

	t.Run("returns already when missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		result, err := clusternetUnregisterCluster(context.Background(), cfg, "edge-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}
