package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestParseKubeAdmiralFederatedCluster_Joined(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "member-1",
			"labels": map[string]interface{}{
				"region": "us-west-2",
			},
		},
		"spec": map[string]interface{}{
			"apiEndpoint": "https://member-1:6443",
		},
		"status": map[string]interface{}{
			"conditions": []interface{}{
				map[string]interface{}{
					"type":   "Ready",
					"status": "True",
				},
			},
		},
	}}

	fc := parseKubeAdmiralFederatedCluster(obj)
	if fc.Name != "member-1" {
		t.Errorf("expected name member-1, got %s", fc.Name)
	}
	if fc.State != federation.ClusterStateJoined {
		t.Errorf("expected state joined, got %s", fc.State)
	}
	if fc.Available != "True" {
		t.Errorf("expected available True, got %s", fc.Available)
	}
	if fc.APIServerURL != "https://member-1:6443" {
		t.Errorf("expected apiServerURL https://member-1:6443, got %s", fc.APIServerURL)
	}
	if fc.Provider != federation.ProviderKubeAdmiral {
		t.Errorf("expected provider kubeadmiral, got %s", fc.Provider)
	}
}

func TestParseKubeAdmiralFederatedCluster_Pending(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "member-2",
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

	fc := parseKubeAdmiralFederatedCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending, got %s", fc.State)
	}
	if fc.Available != "False" {
		t.Errorf("expected available False, got %s", fc.Available)
	}
}

func TestParseKubeAdmiralFederatedCluster_NoConditions(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "member-3",
		},
	}}

	fc := parseKubeAdmiralFederatedCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending when no conditions, got %s", fc.State)
	}
	if fc.Available != "Unknown" {
		t.Errorf("expected available Unknown, got %s", fc.Available)
	}
}

func TestKubeAdmiralProviderName(t *testing.T) {
	p := &kubeAdmiralProvider{}
	if p.Name() != federation.ProviderKubeAdmiral {
		t.Errorf("expected provider name 'kubeadmiral', got '%s'", p.Name())
	}
}
