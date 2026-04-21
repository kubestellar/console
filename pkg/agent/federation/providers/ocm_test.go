package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestParseOCMManagedCluster_Joined(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "spoke-1",
			"labels": map[string]interface{}{
				"cluster.open-cluster-management.io/clusterset": "prod-set",
			},
		},
		"spec": map[string]interface{}{
			"hubAcceptsClient": true,
			"managedClusterClientConfigs": []interface{}{
				map[string]interface{}{"url": "https://spoke-1:6443"},
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
	}}

	fc := parseOCMManagedCluster(obj)
	if fc.Name != "spoke-1" {
		t.Errorf("expected name spoke-1, got %s", fc.Name)
	}
	if fc.State != federation.ClusterStateJoined {
		t.Errorf("expected state joined, got %s", fc.State)
	}
	if fc.Available != "True" {
		t.Errorf("expected available True, got %s", fc.Available)
	}
	if fc.ClusterSet != "prod-set" {
		t.Errorf("expected clusterSet prod-set, got %s", fc.ClusterSet)
	}
	if fc.APIServerURL != "https://spoke-1:6443" {
		t.Errorf("expected apiServerURL https://spoke-1:6443, got %s", fc.APIServerURL)
	}
	if fc.Provider != federation.ProviderOCM {
		t.Errorf("expected provider ocm, got %s", fc.Provider)
	}
}

func TestParseOCMManagedCluster_Pending(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "spoke-2",
		},
		"spec": map[string]interface{}{
			"hubAcceptsClient": false,
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{
					"type":   "ManagedClusterJoined",
					"status": "False",
				},
			},
		},
	}}

	fc := parseOCMManagedCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending, got %s", fc.State)
	}
	if fc.Available != "Unknown" {
		t.Errorf("expected available Unknown, got %s", fc.Available)
	}
}

func TestParseOCMManagedCluster_WithTaints(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "spoke-tainted",
		},
		"spec": map[string]interface{}{
			"hubAcceptsClient": true,
			"taints": []interface{}{
				map[string]interface{}{
					"key":    "cluster.open-cluster-management.io/unreachable",
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
			},
		},
	}}

	fc := parseOCMManagedCluster(obj)
	if len(fc.Taints) != 1 {
		t.Fatalf("expected 1 taint, got %d", len(fc.Taints))
	}
	if fc.Taints[0].Key != "cluster.open-cluster-management.io/unreachable" {
		t.Errorf("unexpected taint key: %s", fc.Taints[0].Key)
	}
}

func TestIsOCMPendingCSR(t *testing.T) {
	pending := &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{
			"username": "system:open-cluster-management:spoke-3:agent",
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{},
		},
	}}
	if !isOCMPendingCSR(pending) {
		t.Error("expected pending CSR to be detected")
	}

	approved := &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{
			"username": "system:open-cluster-management:spoke-3:agent",
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{"type": "Approved", "status": "True"},
			},
		},
	}}
	if isOCMPendingCSR(approved) {
		t.Error("expected approved CSR to NOT be detected as pending")
	}

	nonOCM := &unstructured.Unstructured{Object: map[string]interface{}{
		"spec": map[string]interface{}{
			"username": "system:node:worker-1",
		},
	}}
	if isOCMPendingCSR(nonOCM) {
		t.Error("expected non-OCM CSR to NOT be detected")
	}
}

func TestExtractOCMClusterFromCSR(t *testing.T) {
	csr := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "csr-spoke-4",
		},
		"spec": map[string]interface{}{
			"username": "system:open-cluster-management:spoke-4:agent",
		},
	}}
	name := extractOCMClusterFromCSR(csr)
	if name != "spoke-4" {
		t.Errorf("expected cluster name 'spoke-4' from split, got %s", name)
	}
}

func TestOCMProviderName(t *testing.T) {
	p := &ocmProvider{}
	if p.Name() != federation.ProviderOCM {
		t.Errorf("expected provider name 'ocm', got '%s'", p.Name())
	}
}
