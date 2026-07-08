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
}

func TestExecuteCAPIRetryProvisioning_HTTP(t *testing.T) {
	const path = "/apis/cluster.x-k8s.io/v1beta1/namespaces/default/clusters/cluster-1"

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
}
