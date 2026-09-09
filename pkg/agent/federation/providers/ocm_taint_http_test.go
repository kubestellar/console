package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// TestExecuteOCMTaintCluster_HTTP exercises executeOCMTaintCluster against a
// fake kube API server so the happy path (append a new taint), the
// idempotent "taint already exists" branch, the Get error branch, and the
// Patch conflict branch are all covered. Before this test the function sat
// at 13.5%.
func TestExecuteOCMTaintCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/cluster.open-cluster-management.io/v1/managedclusters/spoke-1"

	t.Run("adds taint", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "cluster.open-cluster-management.io/v1",
				"kind":       "ManagedCluster",
				"metadata":   map[string]interface{}{"name": "spoke-1"},
				"spec":       map[string]interface{}{},
			},
		}, nil)
		defer server.Close()

		result, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		updated := state.object(clusterPath)
		taints, ok := updated["spec"].(map[string]interface{})["taints"].([]interface{})
		if !ok || len(taints) != 1 {
			t.Fatalf("expected 1 taint, got %v", updated["spec"])
		}
		tm := taints[0].(map[string]interface{})
		if tm["key"] != "dedicated" || tm["value"] != "gpu" || tm["effect"] != "NoSchedule" {
			t.Fatalf("unexpected taint payload: %#v", tm)
		}
	})

	t.Run("appends alongside existing taints", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "cluster.open-cluster-management.io/v1",
				"kind":       "ManagedCluster",
				"metadata":   map[string]interface{}{"name": "spoke-1"},
				"spec": map[string]interface{}{
					"taints": []interface{}{
						map[string]interface{}{"key": "existing", "value": "yes", "effect": "NoSchedule"},
					},
				},
			},
		}, nil)
		defer server.Close()

		result, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		taints := state.object(clusterPath)["spec"].(map[string]interface{})["taints"].([]interface{})
		if len(taints) != 2 {
			t.Fatalf("expected 2 taints, got %d", len(taints))
		}
	})

	t.Run("returns already when taint exists", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "cluster.open-cluster-management.io/v1",
				"kind":       "ManagedCluster",
				"metadata":   map[string]interface{}{"name": "spoke-1"},
				"spec": map[string]interface{}{
					"taints": []interface{}{
						map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
					},
				},
			},
		}, nil)
		defer server.Close()

		result, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})

	t.Run("skips non-map existing taint entries", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "cluster.open-cluster-management.io/v1",
				"kind":       "ManagedCluster",
				"metadata":   map[string]interface{}{"name": "spoke-1"},
				"spec": map[string]interface{}{
					"taints": []interface{}{"garbage-entry"},
				},
			},
		}, nil)
		defer server.Close()

		result, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		taints := state.object(clusterPath)["spec"].(map[string]interface{})["taints"].([]interface{})
		if len(taints) != 2 {
			t.Fatalf("expected 2 taints after append, got %d", len(taints))
		}
	})

	t.Run("propagates Get error when cluster missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		_, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err == nil {
			t.Fatal("expected error for missing ManagedCluster")
		}
	})

	t.Run("treats Patch 409 as already", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "cluster.open-cluster-management.io/v1",
				"kind":       "ManagedCluster",
				"metadata":   map[string]interface{}{"name": "spoke-1"},
				"spec":       map[string]interface{}{},
			},
		}, map[string]int{
			"PATCH " + clusterPath: 409,
		})
		defer server.Close()

		result, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected already result on 409, got %+v", result)
		}
	})

	t.Run("propagates non-conflict Patch error", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "cluster.open-cluster-management.io/v1",
				"kind":       "ManagedCluster",
				"metadata":   map[string]interface{}{"name": "spoke-1"},
				"spec":       map[string]interface{}{},
			},
		}, map[string]int{
			"PATCH " + clusterPath: 500,
		})
		defer server.Close()

		_, err := executeOCMTaintCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    ocmActionTaintCluster,
			ClusterName: "spoke-1",
			Payload:     map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoSchedule"},
		})
		if err == nil {
			t.Fatal("expected error for 500 Patch response")
		}
	})
}
