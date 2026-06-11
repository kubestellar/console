package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestClusternetExtractState(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want federation.ClusterState
	}{
		{
			name: "ready condition true",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "True"},
					},
				},
			}},
			want: federation.ClusterStateJoined,
		},
		{
			name: "ready condition false",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "False"},
					},
				},
			}},
			want: federation.ClusterStatePending,
		},
		{
			name: "no conditions",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{},
			}},
			want: federation.ClusterStatePending,
		},
		{
			name: "unrelated condition only",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "NetworkReady", "status": "True"},
					},
				},
			}},
			want: federation.ClusterStatePending,
		},
		{
			name: "malformed condition entry",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{"not-a-map"},
				},
			}},
			want: federation.ClusterStatePending,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusternetExtractState(tt.obj)
			if got != tt.want {
				t.Errorf("clusternetExtractState() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestClusternetExtractAvailable(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want string
	}{
		{
			name: "ready true",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "True"},
					},
				},
			}},
			want: "True",
		},
		{
			name: "ready false",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Ready", "status": "False"},
					},
				},
			}},
			want: "False",
		},
		{
			name: "no conditions",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{},
			}},
			want: "Unknown",
		},
		{
			name: "no ready condition",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Healthy", "status": "True"},
					},
				},
			}},
			want: "Unknown",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusternetExtractAvailable(tt.obj)
			if got != tt.want {
				t.Errorf("clusternetExtractAvailable() = %q, want %q", got, tt.want)
			}
		})
	}
}
