package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestExecuteCAPIScaleMachineDeployment_HTTP(t *testing.T) {
	const path = "/apis/cluster.x-k8s.io/v1beta1/namespaces/default/machinedeployments/md-workers"

	t.Run("updates replicas", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "MachineDeployment", "metadata": map[string]interface{}{"name": "md-workers", "namespace": "default"}, "spec": map[string]interface{}{"replicas": float64(2)}},
		}, nil)
		defer server.Close()

		result, err := executeCAPIScaleMachineDeployment(context.Background(), cfg, federation.ActionRequest{ActionID: capiActionScaleMachineDeployment, Payload: map[string]interface{}{"name": "md-workers", "namespace": "default", "replicas": float64(5)}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}

		updated := state.object(path)
		spec := updated["spec"].(map[string]interface{})
		if spec["replicas"].(float64) != 5 {
			t.Fatalf("expected replicas to be 5, got %#v", spec["replicas"])
		}
	})

	t.Run("already when replicas match without patch", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "MachineDeployment", "metadata": map[string]interface{}{"name": "md-workers", "namespace": "default"}, "spec": map[string]interface{}{"replicas": 2}},
		}, map[string]int{
			"PATCH " + path: 500,
		})
		defer server.Close()

		result, err := executeCAPIScaleMachineDeployment(context.Background(), cfg, federation.ActionRequest{
			ActionID: capiActionScaleMachineDeployment,
			Payload:  map[string]interface{}{"name": "md-workers", "namespace": "default", "replicas": float64(2)},
		})
		if err != nil {
			t.Fatalf("expected idempotent result, got error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})

	t.Run("returns already on patch conflict", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "MachineDeployment", "metadata": map[string]interface{}{"name": "md-workers", "namespace": "default"}, "spec": map[string]interface{}{"replicas": 1}},
		}, map[string]int{
			"PATCH " + path: 409,
		})
		defer server.Close()

		result, err := executeCAPIScaleMachineDeployment(context.Background(), cfg, federation.ActionRequest{
			ActionID: capiActionScaleMachineDeployment,
			Payload:  map[string]interface{}{"name": "md-workers", "namespace": "default", "replicas": float64(3)},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected conflict recovery as already result, got %+v", result)
		}
	})

	t.Run("returns not found for missing machine deployment", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		_, err := executeCAPIScaleMachineDeployment(context.Background(), cfg, federation.ActionRequest{
			ActionID: capiActionScaleMachineDeployment,
			Payload:  map[string]interface{}{"name": "md-workers", "namespace": "default", "replicas": float64(3)},
		})
		if err == nil {
			t.Fatal("expected not found error")
		}
	})

	t.Run("returns error when patch fails", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "MachineDeployment", "metadata": map[string]interface{}{"name": "md-workers", "namespace": "default"}, "spec": map[string]interface{}{"replicas": 1}},
		}, map[string]int{
			"PATCH " + path: 500,
		})
		defer server.Close()

		_, err := executeCAPIScaleMachineDeployment(context.Background(), cfg, federation.ActionRequest{
			ActionID: capiActionScaleMachineDeployment,
			Payload:  map[string]interface{}{"name": "md-workers", "namespace": "default", "replicas": float64(3)},
		})
		if err == nil {
			t.Fatal("expected patch error")
		}
	})
}

func TestExecuteCAPIDeleteCluster_HTTP(t *testing.T) {
	const path = "/apis/cluster.x-k8s.io/v1beta1/namespaces/default/clusters/cluster-1"

	t.Run("deletes cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "cluster-1", "namespace": "default"}},
		}, nil)
		defer server.Close()

		result, err := executeCAPIDeleteCluster(context.Background(), cfg, federation.ActionRequest{ActionID: capiActionDeleteCluster, ClusterName: "cluster-1", Payload: map[string]interface{}{"namespace": "default"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		if state.object(path) != nil {
			t.Fatal("expected cluster to be removed")
		}
	})

	t.Run("returns already when cluster missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		result, err := executeCAPIDeleteCluster(context.Background(), cfg, federation.ActionRequest{ActionID: capiActionDeleteCluster, ClusterName: "cluster-1", Payload: map[string]interface{}{"namespace": "default"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})

	t.Run("returns error when delete fails", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "cluster-1", "namespace": "default"}},
		}, map[string]int{
			"DELETE " + path: 500,
		})
		defer server.Close()

		_, err := executeCAPIDeleteCluster(context.Background(), cfg, federation.ActionRequest{
			ActionID:    capiActionDeleteCluster,
			ClusterName: "cluster-1",
			Payload:     map[string]interface{}{"namespace": "default"},
		})
		if err == nil {
			t.Fatal("expected delete error")
		}
	})
}

func TestExecuteCAPIRetryProvisioning_HTTP(t *testing.T) {
	const path = "/apis/cluster.x-k8s.io/v1beta1/namespaces/default/clusters/cluster-1"

	t.Run("sets reconcile annotation", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "cluster-1", "namespace": "default"}},
		}, nil)
		defer server.Close()

		result, err := executeCAPIRetryProvisioning(context.Background(), cfg, federation.ActionRequest{ActionID: capiActionRetryProvisioning, ClusterName: "cluster-1", Payload: map[string]interface{}{"namespace": "default"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK {
			t.Fatalf("unexpected result: %+v", result)
		}

		updated := state.object(path)
		metadata := updated["metadata"].(map[string]interface{})
		annotations := metadata["annotations"].(map[string]interface{})
		if annotations[capiRetryAnnotation] == "" {
			t.Fatalf("expected %s annotation to be set", capiRetryAnnotation)
		}
	})

	t.Run("returns not found when cluster missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		_, err := executeCAPIRetryProvisioning(context.Background(), cfg, federation.ActionRequest{
			ActionID:    capiActionRetryProvisioning,
			ClusterName: "cluster-1",
			Payload:     map[string]interface{}{"namespace": "default"},
		})
		if err == nil {
			t.Fatal("expected not found error")
		}
	})

	t.Run("returns already on patch conflict", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "cluster-1", "namespace": "default"}},
		}, map[string]int{
			"PATCH " + path: 409,
		})
		defer server.Close()

		result, err := executeCAPIRetryProvisioning(context.Background(), cfg, federation.ActionRequest{
			ActionID:    capiActionRetryProvisioning,
			ClusterName: "cluster-1",
			Payload:     map[string]interface{}{"namespace": "default"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected already result on conflict, got %+v", result)
		}
	})

	t.Run("returns error when patch fails", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			path: {"apiVersion": "cluster.x-k8s.io/v1beta1", "kind": "Cluster", "metadata": map[string]interface{}{"name": "cluster-1", "namespace": "default"}},
		}, map[string]int{
			"PATCH " + path: 500,
		})
		defer server.Close()

		_, err := executeCAPIRetryProvisioning(context.Background(), cfg, federation.ActionRequest{
			ActionID:    capiActionRetryProvisioning,
			ClusterName: "cluster-1",
			Payload:     map[string]interface{}{"namespace": "default"},
		})
		if err == nil {
			t.Fatal("expected patch error")
		}
	})
}
