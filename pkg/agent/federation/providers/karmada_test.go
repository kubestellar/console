package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestParseKarmadaCluster_Joined(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "member-1",
			"labels": map[string]interface{}{
				"region": "us-east-1",
			},
		},
		"spec": map[string]interface{}{
			"apiEndpoint": "https://member-1.example.com:6443",
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

	fc := parseKarmadaCluster(obj)
	if fc.Name != "member-1" {
		t.Errorf("expected name member-1, got %s", fc.Name)
	}
	if fc.State != federation.ClusterStateJoined {
		t.Errorf("expected state joined, got %s", fc.State)
	}
	if fc.Available != "True" {
		t.Errorf("expected available True, got %s", fc.Available)
	}
	if fc.APIServerURL != "https://member-1.example.com:6443" {
		t.Errorf("expected apiServerURL https://member-1.example.com:6443, got %s", fc.APIServerURL)
	}
	if fc.Provider != federation.ProviderKarmada {
		t.Errorf("expected provider karmada, got %s", fc.Provider)
	}
}

func TestParseKarmadaCluster_Pending(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "member-2",
		},
		"spec": map[string]interface{}{
			"apiEndpoint": "https://member-2.example.com:6443",
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

	fc := parseKarmadaCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending, got %s", fc.State)
	}
	if fc.Available != "False" {
		t.Errorf("expected available False, got %s", fc.Available)
	}
}

func TestParseKarmadaCluster_WithTaints(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "member-tainted",
		},
		"spec": map[string]interface{}{
			"apiEndpoint": "https://member-tainted.example.com:6443",
			"taints": []interface{}{
				map[string]interface{}{
					"key":    "cluster.karmada.io/not-ready",
					"effect": "NoSchedule",
				},
			},
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

	fc := parseKarmadaCluster(obj)
	if len(fc.Taints) != 1 {
		t.Fatalf("expected 1 taint, got %d", len(fc.Taints))
	}
	if fc.Taints[0].Key != "cluster.karmada.io/not-ready" {
		t.Errorf("unexpected taint key: %s", fc.Taints[0].Key)
	}
	if fc.Taints[0].Effect != "NoSchedule" {
		t.Errorf("unexpected taint effect: %s", fc.Taints[0].Effect)
	}
}

func TestParseKarmadaPropagationPolicy(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "deploy-to-members",
		},
		"spec": map[string]interface{}{
			"placement": map[string]interface{}{
				"clusterAffinity": map[string]interface{}{
					"clusterNames": []interface{}{"member-1", "member-2"},
				},
			},
		},
	}}

	fg := parseKarmadaPropagationPolicy(obj)
	if fg.Name != "deploy-to-members" {
		t.Errorf("expected name deploy-to-members, got %s", fg.Name)
	}
	if fg.Kind != federation.FederatedGroupSelector {
		t.Errorf("expected kind selector, got %s", fg.Kind)
	}
	if len(fg.Members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(fg.Members))
	}
	if fg.Members[0] != "member-1" || fg.Members[1] != "member-2" {
		t.Errorf("unexpected members: %v", fg.Members)
	}
	if fg.Provider != federation.ProviderKarmada {
		t.Errorf("expected provider karmada, got %s", fg.Provider)
	}
}

func TestParseKarmadaPropagationPolicy_LabelSelector(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "select-by-region",
		},
		"spec": map[string]interface{}{
			"placement": map[string]interface{}{
				"clusterAffinity": map[string]interface{}{
					"labelSelector": map[string]interface{}{
						"matchLabels": map[string]interface{}{
							"region": "us-east-1",
						},
					},
				},
			},
		},
	}}

	fg := parseKarmadaPropagationPolicy(obj)
	if fg.Name != "select-by-region" {
		t.Errorf("expected name select-by-region, got %s", fg.Name)
	}
	if len(fg.Members) != 1 {
		t.Fatalf("expected 1 synthetic member, got %d", len(fg.Members))
	}
	if fg.Members[0] != "region=us-east-1" {
		t.Errorf("expected member 'region=us-east-1', got %s", fg.Members[0])
	}
}

func TestKarmadaProviderName(t *testing.T) {
	p := &karmadaProvider{}
	if p.Name() != federation.ProviderKarmada {
		t.Errorf("expected provider name 'karmada', got '%s'", p.Name())
	}
}
