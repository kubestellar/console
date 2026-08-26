package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

// TestKubeAdmiralUnfederateCluster_HTTP exercises the destructive
// kubeAdmiralUnfederateCluster action against a fake kube API server so the
// happy path, the idempotent "already removed" branch, and Delete error
// propagation are all covered. Before this test the function sat at 0.0%.
func TestKubeAdmiralUnfederateCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/core.kubeadmiral.io/v1alpha1/federatedclusters/edge-1"

	t.Run("deletes federated cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "core.kubeadmiral.io/v1alpha1",
				"kind":       "FederatedCluster",
				"metadata":   map[string]interface{}{"name": "edge-1"},
			},
		}, nil)
		defer server.Close()

		result, err := kubeAdmiralUnfederateCluster(context.Background(), cfg, "edge-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		if state.object(clusterPath) != nil {
			t.Fatal("expected FederatedCluster to be deleted")
		}
	})

	t.Run("returns already when missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		result, err := kubeAdmiralUnfederateCluster(context.Background(), cfg, "edge-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})

	t.Run("propagates non-NotFound delete error", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, map[string]int{
			"DELETE " + clusterPath: 500,
		})
		defer server.Close()

		_, err := kubeAdmiralUnfederateCluster(context.Background(), cfg, "edge-1")
		if err == nil {
			t.Fatal("expected error for 500 response")
		}
	})
}

// TestKubeAdmiralExecuteUnfederate_HTTP exercises the Execute dispatch path
// (previously covered only for the unknown-action branch) by routing a real
// federation.ActionRequest through the provider.
func TestKubeAdmiralExecuteUnfederate_HTTP(t *testing.T) {
	const clusterPath = "/apis/core.kubeadmiral.io/v1alpha1/federatedclusters/edge-2"

	server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
		clusterPath: {
			"apiVersion": "core.kubeadmiral.io/v1alpha1",
			"kind":       "FederatedCluster",
			"metadata":   map[string]interface{}{"name": "edge-2"},
		},
	}, nil)
	defer server.Close()

	p := &kubeAdmiralProvider{}
	result, err := p.Execute(context.Background(), cfg, federation.ActionRequest{ActionID: kubeAdmiralActionUnfederateCluster, ClusterName: "edge-2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || result.Already {
		t.Fatalf("unexpected result: %+v", result)
	}
	if state.object(clusterPath) != nil {
		t.Fatal("expected FederatedCluster to be deleted")
	}
}

// TestLiqoUnpeerWith_HTTP exercises the destructive liqoUnpeerWith action
// (0.0% before this test) across happy path, idempotent already-removed
// branch, and error propagation.
func TestLiqoUnpeerWith_HTTP(t *testing.T) {
	const clusterPath = "/apis/discovery.liqo.io/v1alpha1/foreignclusters/peer-1"

	t.Run("deletes foreign cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {
				"apiVersion": "discovery.liqo.io/v1alpha1",
				"kind":       "ForeignCluster",
				"metadata":   map[string]interface{}{"name": "peer-1"},
			},
		}, nil)
		defer server.Close()

		result, err := liqoUnpeerWith(context.Background(), cfg, "peer-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		if state.object(clusterPath) != nil {
			t.Fatal("expected ForeignCluster to be deleted")
		}
	})

	t.Run("returns already when missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		result, err := liqoUnpeerWith(context.Background(), cfg, "peer-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})

	t.Run("propagates non-NotFound delete error", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, map[string]int{
			"DELETE " + clusterPath: 500,
		})
		defer server.Close()

		_, err := liqoUnpeerWith(context.Background(), cfg, "peer-1")
		if err == nil {
			t.Fatal("expected error for 500 response")
		}
	})
}

// TestLiqoExecuteUnpeer_HTTP exercises the Execute dispatch path for the
// happy case (previously only the unknown-action branch was tested).
func TestLiqoExecuteUnpeer_HTTP(t *testing.T) {
	const clusterPath = "/apis/discovery.liqo.io/v1alpha1/foreignclusters/peer-2"

	server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
		clusterPath: {
			"apiVersion": "discovery.liqo.io/v1alpha1",
			"kind":       "ForeignCluster",
			"metadata":   map[string]interface{}{"name": "peer-2"},
		},
	}, nil)
	defer server.Close()

	p := &liqoProvider{}
	result, err := p.Execute(context.Background(), cfg, federation.ActionRequest{ActionID: liqoActionUnpeerWith, ClusterName: "peer-2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.OK || result.Already {
		t.Fatalf("unexpected result: %+v", result)
	}
	if state.object(clusterPath) != nil {
		t.Fatal("expected ForeignCluster to be deleted")
	}
}
