package providers

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestCapiPhaseToState_AllPhases(t *testing.T) {
	tests := []struct {
		phase string
		want  federation.ClusterState
	}{
		{"Provisioning", federation.ClusterStateProvisioning},
		{"Pending", federation.ClusterStateProvisioning},
		{"Provisioned", federation.ClusterStateProvisioned},
		{"Failed", federation.ClusterStateFailed},
		{"Deleting", federation.ClusterStateDeleting},
		{"", federation.ClusterStateUnknown},
		{"SomethingUnexpected", federation.ClusterStateUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.phase, func(t *testing.T) {
			got := capiPhaseToState(tt.phase)
			if got != tt.want {
				t.Errorf("capiPhaseToState(%q) = %v, want %v", tt.phase, got, tt.want)
			}
		})
	}
}

func TestCapiAvailableFromState_AllStates(t *testing.T) {
	tests := []struct {
		state federation.ClusterState
		want  string
	}{
		{federation.ClusterStateProvisioned, "True"},
		{federation.ClusterStateFailed, "False"},
		{federation.ClusterStateProvisioning, "Unknown"},
		{federation.ClusterStateDeleting, "Unknown"},
		{federation.ClusterStateUnknown, "Unknown"},
		{federation.ClusterStateJoined, "Unknown"},
		{federation.ClusterStatePending, "Unknown"},
	}
	for _, tt := range tests {
		t.Run(string(tt.state), func(t *testing.T) {
			got := capiAvailableFromState(tt.state)
			if got != tt.want {
				t.Errorf("capiAvailableFromState(%v) = %q, want %q", tt.state, got, tt.want)
			}
		})
	}
}

func TestCapiAPIServerURL(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want string
	}{
		{
			name: "host and port",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"controlPlaneEndpoint": map[string]interface{}{
						"host": "10.0.0.1",
						"port": int64(6443),
					},
				},
			}},
			want: "https://10.0.0.1:6443",
		},
		{
			name: "host only no port",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"controlPlaneEndpoint": map[string]interface{}{
						"host": "api.cluster.local",
					},
				},
			}},
			want: "https://api.cluster.local",
		},
		{
			name: "empty host",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{},
			}},
			want: "",
		},
		{
			name: "port zero",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"controlPlaneEndpoint": map[string]interface{}{
						"host": "myhost",
						"port": int64(0),
					},
				},
			}},
			want: "https://myhost",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := capiAPIServerURL(tt.obj)
			if got != tt.want {
				t.Errorf("capiAPIServerURL() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCapiInfraRefKind(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want string
	}{
		{
			name: "AWSCluster",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"infrastructureRef": map[string]interface{}{
						"kind": "AWSCluster",
					},
				},
			}},
			want: "AWSCluster",
		},
		{
			name: "missing infra ref",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{},
			}},
			want: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := capiInfraRefKind(tt.obj)
			if got != tt.want {
				t.Errorf("capiInfraRefKind() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCapiControlPlaneReady(t *testing.T) {
	tests := []struct {
		name         string
		obj          *unstructured.Unstructured
		kcpByCluster map[string]bool
		want         bool
	}{
		{
			name: "ready from condition",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"metadata": map[string]interface{}{"name": "c1"},
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "ControlPlaneReady", "status": "True"},
					},
				},
			}},
			kcpByCluster: map[string]bool{},
			want:         true,
		},
		{
			name: "not ready from condition",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"metadata": map[string]interface{}{"name": "c1"},
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "ControlPlaneReady", "status": "False"},
					},
				},
			}},
			kcpByCluster: map[string]bool{},
			want:         false,
		},
		{
			name: "fallback to kcp index",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"metadata": map[string]interface{}{"name": "c1"},
				"status":   map[string]interface{}{},
			}},
			kcpByCluster: map[string]bool{"c1": true},
			want:         true,
		},
		{
			name: "no conditions no kcp",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"metadata": map[string]interface{}{"name": "c1"},
				"status":   map[string]interface{}{},
			}},
			kcpByCluster: map[string]bool{},
			want:         false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := capiControlPlaneReady(tt.obj, tt.kcpByCluster)
			if got != tt.want {
				t.Errorf("capiControlPlaneReady() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSafeInt64ToInt32(t *testing.T) {
	tests := []struct {
		name  string
		input int64
		want  int32
	}{
		{"normal", 42, 42},
		{"zero", 0, 0},
		{"max int32", 2147483647, 2147483647},
		{"overflow", 2147483648, 2147483647},
		{"negative", -5, -5},
		{"negative overflow", -2147483649, -2147483648},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := safeInt64ToInt32(tt.input)
			if got != tt.want {
				t.Errorf("safeInt64ToInt32(%d) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}
