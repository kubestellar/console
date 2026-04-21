package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestParseClusternetManagedCluster_Joined(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "child-1",
			"labels": map[string]interface{}{
				"clusternet.io/cluster-id": "abc-123",
				"env":                      "prod",
			},
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{
					"type":   "Ready",
					"status": "True",
				},
			},
			"apiServerURL": "https://child-1:6443",
		},
	}}

	fc := parseClusternetManagedCluster(obj)
	if fc.Name != "child-1" {
		t.Errorf("expected name child-1, got %s", fc.Name)
	}
	if fc.State != federation.ClusterStateJoined {
		t.Errorf("expected state joined, got %s", fc.State)
	}
	if fc.Available != "True" {
		t.Errorf("expected available True, got %s", fc.Available)
	}
	if fc.APIServerURL != "https://child-1:6443" {
		t.Errorf("expected apiServerURL https://child-1:6443, got %s", fc.APIServerURL)
	}
	if fc.ClusterSet != "abc-123" {
		t.Errorf("expected clusterSet abc-123, got %s", fc.ClusterSet)
	}
	if fc.Provider != federation.ProviderClusternet {
		t.Errorf("expected provider clusternet, got %s", fc.Provider)
	}
}

func TestParseClusternetManagedCluster_Pending(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "child-2",
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{
					"type":   "Ready",
					"status": "False",
				},
			},
		},
	}}

	fc := parseClusternetManagedCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending, got %s", fc.State)
	}
	if fc.Available != "False" {
		t.Errorf("expected available False, got %s", fc.Available)
	}
}

func TestParseClusternetManagedCluster_NoConditions(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "child-3",
		},
	}}

	fc := parseClusternetManagedCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending when no conditions, got %s", fc.State)
	}
	if fc.Available != "Unknown" {
		t.Errorf("expected available Unknown, got %s", fc.Available)
	}
}

func TestClusternetProviderName(t *testing.T) {
	p := &clusternetProvider{}
	if p.Name() != federation.ProviderClusternet {
		t.Errorf("expected provider name 'clusternet', got '%s'", p.Name())
	}
}
