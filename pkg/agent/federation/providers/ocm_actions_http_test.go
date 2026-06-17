package providers

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestExecuteOCMApproveCSR_HTTP(t *testing.T) {
	const csrPath = "/apis/certificates.k8s.io/v1/certificatesigningrequests/csr-1"

	t.Run("approves pending csr", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			csrPath: {"apiVersion": "certificates.k8s.io/v1", "kind": "CertificateSigningRequest", "metadata": map[string]interface{}{"name": "csr-1"}, "status": map[string]interface{}{"conditions": []interface{}{}}},
		}, nil)
		defer server.Close()

		result, err := executeOCMApproveCSR(context.Background(), cfg, federation.ActionRequest{ActionID: ocmActionApproveCSR, Payload: map[string]interface{}{"csrName": "csr-1"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}

		updated := state.object(csrPath)
		conditions := updated["status"].(map[string]interface{})["conditions"].([]interface{})
		if len(conditions) != 1 {
			t.Fatalf("expected 1 condition, got %d", len(conditions))
		}
		condition := conditions[0].(map[string]interface{})
		if condition["type"].(string) != "Approved" {
			t.Fatalf("unexpected condition: %#v", condition)
		}
	})

	t.Run("returns already for approved csr", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			csrPath: {"apiVersion": "certificates.k8s.io/v1", "kind": "CertificateSigningRequest", "metadata": map[string]interface{}{"name": "csr-1"}, "status": map[string]interface{}{"conditions": []interface{}{map[string]interface{}{"type": "Approved", "status": "True"}}}},
		}, nil)
		defer server.Close()

		result, err := executeOCMApproveCSR(context.Background(), cfg, federation.ActionRequest{ActionID: ocmActionApproveCSR, Payload: map[string]interface{}{"csrName": "csr-1"}})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}

func TestExecuteOCMAcceptCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/cluster.open-cluster-management.io/v1/managedclusters/spoke-1"

	t.Run("accepts cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.open-cluster-management.io/v1", "kind": "ManagedCluster", "metadata": map[string]interface{}{"name": "spoke-1"}, "spec": map[string]interface{}{"hubAcceptsClient": false}},
		}, nil)
		defer server.Close()

		result, err := executeOCMAcceptCluster(context.Background(), cfg, federation.ActionRequest{ActionID: ocmActionAcceptCluster, ClusterName: "spoke-1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		updated := state.object(clusterPath)
		accepted := updated["spec"].(map[string]interface{})["hubAcceptsClient"].(bool)
		if !accepted {
			t.Fatal("expected hubAcceptsClient to be true")
		}
	})

	t.Run("returns already when accepted", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.open-cluster-management.io/v1", "kind": "ManagedCluster", "metadata": map[string]interface{}{"name": "spoke-1"}, "spec": map[string]interface{}{"hubAcceptsClient": true}},
		}, nil)
		defer server.Close()

		result, err := executeOCMAcceptCluster(context.Background(), cfg, federation.ActionRequest{ActionID: ocmActionAcceptCluster, ClusterName: "spoke-1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}

func TestExecuteOCMDetachCluster_HTTP(t *testing.T) {
	const clusterPath = "/apis/cluster.open-cluster-management.io/v1/managedclusters/spoke-1"

	t.Run("deletes cluster", func(t *testing.T) {
		server, cfg, state := newTestKubeAPIServer(t, map[string]map[string]interface{}{
			clusterPath: {"apiVersion": "cluster.open-cluster-management.io/v1", "kind": "ManagedCluster", "metadata": map[string]interface{}{"name": "spoke-1"}},
		}, nil)
		defer server.Close()

		result, err := executeOCMDetachCluster(context.Background(), cfg, federation.ActionRequest{ActionID: ocmActionDetachCluster, ClusterName: "spoke-1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.OK || result.Already {
			t.Fatalf("unexpected result: %+v", result)
		}
		if state.object(clusterPath) != nil {
			t.Fatal("expected cluster to be removed")
		}
	})

	t.Run("returns already when missing", func(t *testing.T) {
		server, cfg, _ := newTestKubeAPIServer(t, nil, nil)
		defer server.Close()

		result, err := executeOCMDetachCluster(context.Background(), cfg, federation.ActionRequest{ActionID: ocmActionDetachCluster, ClusterName: "spoke-1"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !result.Already {
			t.Fatalf("expected already result, got %+v", result)
		}
	})
}
