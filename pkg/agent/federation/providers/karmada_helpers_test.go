package providers

import (
	"sort"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/agent/federation"
)

func TestKarmadaExtractState(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want federation.ClusterState
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
			want: federation.ClusterStateJoined,
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
			want: federation.ClusterStatePending,
		},
		{
			name: "no conditions",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{},
			}},
			want: federation.ClusterStateUnknown,
		},
		{
			name: "unrelated condition only",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"status": map[string]interface{}{
					"conditions": []interface{}{
						map[string]interface{}{"type": "Healthy", "status": "True"},
					},
				},
			}},
			want: federation.ClusterStateUnknown,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := karmadaExtractState(tt.obj)
			if got != tt.want {
				t.Errorf("karmadaExtractState() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestKarmadaExtractAvailable(t *testing.T) {
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
			name: "no status",
			obj:  &unstructured.Unstructured{Object: map[string]interface{}{}},
			want: "Unknown",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := karmadaExtractAvailable(tt.obj)
			if got != tt.want {
				t.Errorf("karmadaExtractAvailable() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestKarmadaExtractTaints(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want []federation.Taint
	}{
		{
			name: "with taints",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"taints": []interface{}{
						map[string]interface{}{"key": "node.kubernetes.io/unschedulable", "value": "", "effect": "NoSchedule"},
						map[string]interface{}{"key": "dedicated", "value": "gpu", "effect": "NoExecute"},
					},
				},
			}},
			want: []federation.Taint{
				{Key: "node.kubernetes.io/unschedulable", Value: "", Effect: "NoSchedule"},
				{Key: "dedicated", Value: "gpu", Effect: "NoExecute"},
			},
		},
		{
			name: "no taints",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{},
			}},
			want: nil,
		},
		{
			name: "empty taints",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"taints": []interface{}{},
				},
			}},
			want: nil,
		},
		{
			name: "malformed taint entry",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"taints": []interface{}{"not-a-map"},
				},
			}},
			want: []federation.Taint{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := karmadaExtractTaints(tt.obj)
			if tt.want == nil {
				if got != nil {
					t.Errorf("karmadaExtractTaints() = %v, want nil", got)
				}
				return
			}
			if len(got) != len(tt.want) {
				t.Fatalf("karmadaExtractTaints() returned %d taints, want %d", len(got), len(tt.want))
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("taint[%d] = %+v, want %+v", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestExtractKarmadaClusterNames(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want []string
	}{
		{
			name: "with cluster names",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"placement": map[string]interface{}{
						"clusterAffinity": map[string]interface{}{
							"clusterNames": []interface{}{"cluster-a", "cluster-b", "cluster-c"},
						},
					},
				},
			}},
			want: []string{"cluster-a", "cluster-b", "cluster-c"},
		},
		{
			name: "no cluster names",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{},
			}},
			want: nil,
		},
		{
			name: "empty cluster names",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"placement": map[string]interface{}{
						"clusterAffinity": map[string]interface{}{
							"clusterNames": []interface{}{},
						},
					},
				},
			}},
			want: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractKarmadaClusterNames(tt.obj)
			if tt.want == nil {
				if got != nil {
					t.Errorf("extractKarmadaClusterNames() = %v, want nil", got)
				}
				return
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %d names, want %d", len(got), len(tt.want))
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("name[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestExtractKarmadaSelectorMembers(t *testing.T) {
	tests := []struct {
		name string
		obj  *unstructured.Unstructured
		want []string
	}{
		{
			name: "with labels",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{
					"placement": map[string]interface{}{
						"clusterAffinity": map[string]interface{}{
							"labelSelector": map[string]interface{}{
								"matchLabels": map[string]interface{}{
									"env":    "prod",
									"region": "us-west",
								},
							},
						},
					},
				},
			}},
			want: []string{"env=prod", "region=us-west"},
		},
		{
			name: "no labels",
			obj: &unstructured.Unstructured{Object: map[string]interface{}{
				"spec": map[string]interface{}{},
			}},
			want: []string{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractKarmadaSelectorMembers(tt.obj)
			sort.Strings(got)
			sort.Strings(tt.want)
			if len(got) != len(tt.want) {
				t.Fatalf("got %d members, want %d: %v", len(got), len(tt.want), got)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Errorf("member[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}
