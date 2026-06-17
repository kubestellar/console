package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestExecuteKarmadaJoinCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/member-1"
	const collectionPath = "/apis/cluster.karmada.io/v1alpha1/clusters"

	t.Run("creates cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		result, err := executeKarmadaJoinCluster(context.Background(), cfg, federation.ActionRequest{ActionID: karmadaActionJoinCluster, ClusterName: "member-1", Payload: map[string]interface{}{"apiEndpoint": "https://member-1:6443"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		created := state.object(clusterPath)
		if created == nil {
			t.Fatalf("expected object at %s", clusterPath)
		}
		spec := created["spec"].(map[string]interface{})
		if spec["apiEndpoint"].(string) != "https://member-1:6443" || spec["syncMode"].(string) != "Pull" {
			t.Fatalf("unexpected created spec: %#v", spec)
		}
		_ = collectionPath
	})

	t.Run("returns already when cluster exists", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.karmada.io/v1alpha1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "member-1"}},
		}, nil)
		defer server.Close()

		result, err := executeKarmadaJoinCluster(context.Background(), cfg, federation.ActionRequest{ActionID: karmadaActionJoinCluster, ClusterName: "member-1", Payload: map[string]interface{}{"apiEndpoint": "https://member-1:6443"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}

func TestExecuteKarmadaUnjoinCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/member-1"

	t.Run("deletes cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.karmada.io/v1alpha1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "member-1"}},
		}, nil)
		defer server.Close()

		result, err := executeKarmadaUnjoinCluster(context.Background(), cfg, federation.ActionRequest{ActionID: karmadaActionUnjoinCluster, ClusterName: "member-1"})
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

		result, err := executeKarmadaUnjoinCluster(context.Background(), cfg, federation.ActionRequest{ActionID: karmadaActionUnjoinCluster, ClusterName: "member-1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}

func TestExecuteKarmadaTaintCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/cluster.karmada.io/v1alpha1/clusters/member-1"

	t.Run("adds taint", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.karmada.io/v1alpha1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "member-1"}, "spec": map[string]interface{}{}},
		}, nil)
		defer server.Close()

		result, err := executeKarmadaTaintCluster(context.Background(), cfg, federation.ActionRequest{ActionID: karmadaActionTaintCluster, ClusterName: "member-1", Payload: map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		updated := state.object(clusterPath)
		taints := updated["spec"].(map[string]interface{})["taints"].([]interface{})
		if len(taints) != 1 {
			t.Fatalf("expected 1 taint, got %d", len(taints))
		}
	})

	t.Run("returns already when taint exists", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.karmada.io/v1alpha1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "member-1"}, "spec": map[string]interface{}{"taints": []interface{}{map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"}}}},
		}, nil)
		defer server.Close()

		result, err := executeKarmadaTaintCluster(context.Background(), cfg, federation.ActionRequest{ActionID: karmadaActionTaintCluster, ClusterName: "member-1", Payload: map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}
