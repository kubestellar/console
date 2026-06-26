package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestParseLiqoForeignCluster_Joined(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "remote-cluster-1",
			"labels": map[string]interface{}{
				"liqo.io/remote-cluster-id": "cl-abc",
			},
		},
		"spec": map[string]interface{}{
			"controlPlaneEndpoint": "https://remote-1:6443",
		},
		"status": map[string]interface{}{
			"peeringConditions": []interface{}{
				map[string]interface{}{
					"type":   "OutgoingPeering",
					"status": "Active",
				},
			},
		},
	}}

	fc := parseLiqoForeignCluster(obj)
	if fc.Name != "remote-cluster-1" {
		t.Errorf("expected name remote-cluster-1, got %s", fc.Name)
	}
	if fc.State != federation.ClusterStateJoined {
		t.Errorf("expected state joined, got %s", fc.State)
	}
	if fc.Available != "True" {
		t.Errorf("expected available True, got %s", fc.Available)
	}
	if fc.APIServerURL != "https://remote-1:6443" {
		t.Errorf("expected apiServerURL https://remote-1:6443, got %s", fc.APIServerURL)
	}
	if fc.Provider != federation.ProviderLiqo {
		t.Errorf("expected provider liqo, got %s", fc.Provider)
	}
}

func TestParseLiqoForeignCluster_FallbackAuthURL(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "remote-cluster-2",
		},
		"spec": map[string]interface{}{
			"foreignAuthURL": "https://remote-2:9443/auth",
		},
		"status": map[string]interface{}{
			"peeringConditions": []interface{}{
				map[string]interface{}{
					"type":   "IncomingPeering",
					"status": "Active",
				},
			},
		},
	}}

	fc := parseLiqoForeignCluster(obj)
	if fc.APIServerURL != "https://remote-2:9443/auth" {
		t.Errorf("expected apiServerURL from foreignAuthURL, got %s", fc.APIServerURL)
	}
	if fc.State != federation.ClusterStateJoined {
		t.Errorf("expected state joined via IncomingPeering, got %s", fc.State)
	}
}

func TestParseLiqoForeignCluster_Pending(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "remote-cluster-3",
		},
		"status": map[string]interface{}{
			"peeringConditions": []interface{}{
				map[string]interface{}{
					"type":   "OutgoingPeering",
					"status": "Pending",
				},
			},
		},
	}}

	fc := parseLiqoForeignCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending, got %s", fc.State)
	}
	if fc.Available != "Unknown" {
		t.Errorf("expected available Unknown, got %s", fc.Available)
	}
}

func TestParseLiqoForeignCluster_NoConditions(t *testing.T) {
	obj := &unstructured.Unstructured{Object: map[string]interface{}{
		"metadata": map[string]interface{}{
			"name": "remote-cluster-4",
		},
	}}

	fc := parseLiqoForeignCluster(obj)
	if fc.State != federation.ClusterStatePending {
		t.Errorf("expected state pending when no conditions, got %s", fc.State)
	}
}

func TestLiqoIsPeeringActive(t *testing.T) {
	active := &unstructured.Unstructured{Object: map[string]interface{}{
		"status": map[string]interface{}{
			"peeringConditions": []interface{}{
				map[string]interface{}{
					"type":   "OutgoingPeering",
					"status": "Active",
				},
			},
		},
	}}
	if !liqoIsPeeringActive(active) {
		t.Error("expected active peering to be detected")
	}

	inactive := &unstructured.Unstructured{Object: map[string]interface{}{
		"status": map[string]interface{}{
			"peeringConditions": []interface{}{
				map[string]interface{}{
					"type":   "OutgoingPeering",
					"status": "Pending",
				},
			},
		},
	}}
	if liqoIsPeeringActive(inactive) {
		t.Error("expected pending peering to NOT be detected as active")
	}
}

func TestLiqoProviderName(t *testing.T) {
	p := &liqoProvider{}
	if p.Name() != federation.ProviderLiqo {
		t.Errorf("expected provider name 'liqo', got '%s'", p.Name())
	}
}
