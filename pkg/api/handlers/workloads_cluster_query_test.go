package handlers

import (
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// ---------------------------------------------------------------------------
// matchString — string comparison operators for cluster filters
// ---------------------------------------------------------------------------

func TestMatchString(t *testing.T) {
	tests := []struct {
		name     string
		actual   string
		operator string
		expected string
		want     bool
	}{
		{"eq match", "cluster-1", "eq", "cluster-1", true},
		{"eq no match", "cluster-1", "eq", "cluster-2", false},
		{"neq match", "cluster-1", "neq", "cluster-2", true},
		{"neq no match", "cluster-1", "neq", "cluster-1", false},
		{"contains match", "prod-cluster-east", "contains", "cluster", true},
		{"contains no match", "prod-cluster-east", "contains", "west", false},
		{"contains empty pattern", "anything", "contains", "", true},
		{"unknown operator", "cluster-1", "regex", "cluster-1", false},
		{"empty actual eq", "", "eq", "", true},
		{"empty actual neq", "", "neq", "something", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchString(tt.actual, tt.operator, tt.expected)
			if got != tt.want {
				t.Errorf("matchString(%q, %q, %q) = %v, want %v",
					tt.actual, tt.operator, tt.expected, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// compareBool — boolean filter evaluation
// ---------------------------------------------------------------------------

func TestCompareBool(t *testing.T) {
	tests := []struct {
		name   string
		actual bool
		op     string
		value  string
		want   bool
	}{
		{"eq true/true", true, "eq", "true", true},
		{"eq false/false", false, "eq", "false", true},
		{"eq true/false", true, "eq", "false", false},
		{"neq true/false", true, "neq", "false", true},
		{"neq true/true", true, "neq", "true", false},
		{"case insensitive TRUE", true, "eq", "TRUE", true},
		{"case insensitive True", true, "eq", "True", true},
		{"unknown op defaults to eq", true, "unknown", "true", true},
		{"non-true string is false", true, "eq", "yes", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareBool(tt.actual, tt.op, tt.value)
			if got != tt.want {
				t.Errorf("compareBool(%v, %q, %q) = %v, want %v",
					tt.actual, tt.op, tt.value, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// compareInt — integer filter evaluation with operator support
// ---------------------------------------------------------------------------

func TestCompareInt(t *testing.T) {
	tests := []struct {
		name   string
		actual int64
		op     string
		value  string
		want   bool
	}{
		{"eq match", 5, "eq", "5", true},
		{"eq no match", 5, "eq", "6", false},
		{"neq match", 5, "neq", "6", true},
		{"neq no match", 5, "neq", "5", false},
		{"gt true", 10, "gt", "5", true},
		{"gt false equal", 5, "gt", "5", false},
		{"gt false less", 3, "gt", "5", false},
		{"gte true greater", 10, "gte", "5", true},
		{"gte true equal", 5, "gte", "5", true},
		{"gte false", 3, "gte", "5", false},
		{"lt true", 3, "lt", "5", true},
		{"lt false equal", 5, "lt", "5", false},
		{"lt false greater", 10, "lt", "5", false},
		{"lte true less", 3, "lte", "5", true},
		{"lte true equal", 5, "lte", "5", true},
		{"lte false", 10, "lte", "5", false},
		{"invalid value", 5, "eq", "abc", false},
		{"unknown op", 5, "regex", "5", false},
		{"zero", 0, "eq", "0", true},
		{"negative", -1, "lt", "0", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareInt(tt.actual, tt.op, tt.value)
			if got != tt.want {
				t.Errorf("compareInt(%d, %q, %q) = %v, want %v",
					tt.actual, tt.op, tt.value, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// compareFloat — float filter evaluation with epsilon tolerance
// ---------------------------------------------------------------------------

func TestCompareFloat(t *testing.T) {
	tests := []struct {
		name   string
		actual float64
		op     string
		value  string
		want   bool
	}{
		{"eq match", 3.14, "eq", "3.14", true},
		{"eq no match", 3.14, "eq", "3.15", false},
		{"eq within epsilon", 1.0000000001, "eq", "1.0", true},
		{"neq match", 3.14, "neq", "2.0", true},
		{"neq no match", 3.14, "neq", "3.14", false},
		{"gt true", 10.5, "gt", "5.0", true},
		{"gt false", 3.0, "gt", "5.0", false},
		{"gte true equal", 5.0, "gte", "5.0", true},
		{"gte true greater", 5.1, "gte", "5.0", true},
		{"gte false", 4.9, "gte", "5.0", false},
		{"lt true", 3.0, "lt", "5.0", true},
		{"lt false equal", 5.0, "lt", "5.0", false},
		{"lte true", 5.0, "lte", "5.0", true},
		{"lte true less", 4.9, "lte", "5.0", true},
		{"invalid value", 5.0, "eq", "not_a_number", false},
		{"unknown op", 5.0, "mod", "3.0", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareFloat(tt.actual, tt.op, tt.value)
			if got != tt.want {
				t.Errorf("compareFloat(%f, %q, %q) = %v, want %v",
					tt.actual, tt.op, tt.value, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// compareStringSet — set-based comparison for GPU types
// ---------------------------------------------------------------------------

func TestCompareStringSet(t *testing.T) {
	tests := []struct {
		name   string
		actual []string
		op     string
		value  string
		want   bool
	}{
		{"eq exact match", []string{"A100", "V100"}, "eq", "A100", true},
		{"eq case insensitive", []string{"a100"}, "eq", "A100", true},
		{"eq no match", []string{"V100"}, "eq", "A100", false},
		{"contains substring", []string{"NVIDIA-A100-80GB"}, "contains", "A100", true},
		{"contains no match", []string{"NVIDIA-V100"}, "contains", "A100", false},
		{"neq excludes", []string{"V100", "T4"}, "neq", "A100", true},
		{"neq has match", []string{"A100", "V100"}, "neq", "A100", false},
		{"excludes no match", []string{"V100"}, "excludes", "A100", true},
		{"excludes has match", []string{"A100"}, "excludes", "a100", false},
		{"empty set eq", []string{}, "eq", "A100", false},
		{"empty set neq", []string{}, "neq", "A100", true},
		{"unknown op", []string{"A100"}, "regex", "A100", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareStringSet(tt.actual, tt.op, tt.value)
			if got != tt.want {
				t.Errorf("compareStringSet(%v, %q, %q) = %v, want %v",
					tt.actual, tt.op, tt.value, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// clusterGPUCount — GPU aggregation across nodes
// ---------------------------------------------------------------------------

func TestClusterGPUCount(t *testing.T) {
	tests := []struct {
		name  string
		nodes []k8s.NodeInfo
		want  int
	}{
		{"nil nodes", nil, 0},
		{"empty nodes", []k8s.NodeInfo{}, 0},
		{"single node no GPU", []k8s.NodeInfo{{Name: "n1", GPUCount: 0}}, 0},
		{"single node with GPUs", []k8s.NodeInfo{{Name: "n1", GPUCount: 4}}, 4},
		{"multiple nodes", []k8s.NodeInfo{
			{Name: "n1", GPUCount: 8},
			{Name: "n2", GPUCount: 4},
			{Name: "n3", GPUCount: 0},
		}, 12},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusterGPUCount(tt.nodes)
			if got != tt.want {
				t.Errorf("clusterGPUCount() = %d, want %d", got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// clusterGPUTypes — GPU type deduplication
// ---------------------------------------------------------------------------

func TestClusterGPUTypes(t *testing.T) {
	tests := []struct {
		name  string
		nodes []k8s.NodeInfo
		want  int // number of unique types
	}{
		{"nil nodes", nil, 0},
		{"empty nodes", []k8s.NodeInfo{}, 0},
		{"no GPU types", []k8s.NodeInfo{{Name: "n1"}}, 0},
		{"single type", []k8s.NodeInfo{
			{Name: "n1", GPUType: "A100"},
			{Name: "n2", GPUType: "A100"},
		}, 1},
		{"multiple types", []k8s.NodeInfo{
			{Name: "n1", GPUType: "A100"},
			{Name: "n2", GPUType: "V100"},
			{Name: "n3", GPUType: "T4"},
		}, 3},
		{"mixed empty and types", []k8s.NodeInfo{
			{Name: "n1", GPUType: "A100"},
			{Name: "n2", GPUType: ""},
			{Name: "n3", GPUType: "V100"},
		}, 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusterGPUTypes(tt.nodes)
			if len(got) != tt.want {
				t.Errorf("clusterGPUTypes() returned %d types, want %d", len(got), tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// clusterFilterNeedsNodes — filter classification
// ---------------------------------------------------------------------------

func TestClusterFilterNeedsNodes(t *testing.T) {
	tests := []struct {
		name    string
		filters []v1alpha1.ClusterFilter
		want    bool
	}{
		{"nil filters", nil, false},
		{"empty filters", []v1alpha1.ClusterFilter{}, false},
		{"name filter only", []v1alpha1.ClusterFilter{{Field: "name"}}, false},
		{"gpuCount needs nodes", []v1alpha1.ClusterFilter{{Field: "gpuCount"}}, true},
		{"gpuType needs nodes", []v1alpha1.ClusterFilter{{Field: "gpuType"}}, true},
		{"label needs nodes", []v1alpha1.ClusterFilter{{Field: "label"}}, true},
		{"mixed", []v1alpha1.ClusterFilter{
			{Field: "name"},
			{Field: "healthy"},
			{Field: "gpuCount"},
		}, true},
		{"all non-node fields", []v1alpha1.ClusterFilter{
			{Field: "name"},
			{Field: "healthy"},
			{Field: "nodeCount"},
			{Field: "podCount"},
		}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusterFilterNeedsNodes(tt.filters)
			if got != tt.want {
				t.Errorf("clusterFilterNeedsNodes() = %v, want %v", got, tt.want)
			}
		})
	}
}
