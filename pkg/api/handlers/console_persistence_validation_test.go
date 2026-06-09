package handlers

// Tests for console_persistence_validation.go: matchString, clusterMatchesFilter,
// clusterMatchesFilters, and clusterFilterNeedsNodes.

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
)

// ---------- matchString ----------

func TestMatchString(t *testing.T) {
	tests := []struct {
		name     string
		actual   string
		operator string
		expected string
		want     bool
	}{
		{"eq_match", "us-west-1", "eq", "us-west-1", true},
		{"eq_no_match", "us-west-1", "eq", "eu-west-1", false},
		{"neq_different", "us-west-1", "neq", "eu-west-1", true},
		{"neq_same", "us-west-1", "neq", "us-west-1", false},
		{"contains_match", "us-west-1", "contains", "west", true},
		{"contains_no_match", "us-west-1", "contains", "east", false},
		{"contains_empty_pattern", "us-west-1", "contains", "", true},
		{"unknown_operator", "us-west-1", "regex", "us.*", false},
		{"empty_actual_eq", "", "eq", "", true},
		{"empty_actual_neq", "", "neq", "something", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchString(tt.actual, tt.operator, tt.expected)
			assert.Equal(t, tt.want, got)
		})
	}
}

// ---------- clusterFilterNeedsNodes ----------

func TestClusterFilterNeedsNodes(t *testing.T) {
	tests := []struct {
		name    string
		filters []v1alpha1.ClusterFilter
		want    bool
	}{
		{"empty_filters", nil, false},
		{"no_node_fields", []v1alpha1.ClusterFilter{
			{Field: "name", Operator: "eq", Value: "prod"},
			{Field: "healthy", Operator: "eq", Value: "true"},
		}, false},
		{"gpuCount_needs_nodes", []v1alpha1.ClusterFilter{
			{Field: "gpuCount", Operator: "gte", Value: "4"},
		}, true},
		{"gpuType_needs_nodes", []v1alpha1.ClusterFilter{
			{Field: "gpuType", Operator: "eq", Value: "A100"},
		}, true},
		{"label_needs_nodes", []v1alpha1.ClusterFilter{
			{Field: "label", Operator: "eq", Value: "us-west", LabelKey: "region"},
		}, true},
		{"mixed_with_gpu", []v1alpha1.ClusterFilter{
			{Field: "name", Operator: "eq", Value: "prod"},
			{Field: "gpuCount", Operator: "gt", Value: "0"},
		}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := clusterFilterNeedsNodes(tt.filters)
			assert.Equal(t, tt.want, got)
		})
	}
}

// ---------- clusterMatchesFilter ----------

func TestClusterMatchesFilter_Name(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{Name: "prod-west"}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "name", Operator: "eq", Value: "prod-west",
	}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "name", Operator: "eq", Value: "staging",
	}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "name", Operator: "contains", Value: "prod",
	}))
}

func TestClusterMatchesFilter_Healthy(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{Healthy: true}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "healthy", Operator: "eq", Value: "true",
	}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "healthy", Operator: "eq", Value: "false",
	}))
}

func TestClusterMatchesFilter_Reachable(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{}
	health := &k8s.ClusterHealth{Reachable: true}

	// With health data
	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{
		Field: "reachable", Operator: "eq", Value: "true",
	}))

	// Without health data — should return false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "reachable", Operator: "eq", Value: "true",
	}))
}

func TestClusterMatchesFilter_NodeCount(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{NodeCount: 5}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "nodeCount", Operator: "gte", Value: "3",
	}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "nodeCount", Operator: "gt", Value: "5",
	}))
}

func TestClusterMatchesFilter_PodCount(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{PodCount: 100}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "podCount", Operator: "lt", Value: "200",
	}))
}

func TestClusterMatchesFilter_CpuCores(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{}
	health := &k8s.ClusterHealth{CpuCores: 32}

	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{
		Field: "cpuCores", Operator: "gte", Value: "16",
	}))

	// Nil health — should return false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "cpuCores", Operator: "gte", Value: "16",
	}))
}

func TestClusterMatchesFilter_MemoryGB(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{}
	health := &k8s.ClusterHealth{MemoryGB: 64.0}

	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{
		Field: "memoryGB", Operator: "gte", Value: "32.0",
	}))

	// Nil health — should return false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "memoryGB", Operator: "gt", Value: "0",
	}))
}

func TestClusterMatchesFilter_GpuCount(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{}
	nodes := []k8s.NodeInfo{
		{GPUCount: 4},
		{GPUCount: 8},
	}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "gpuCount", Operator: "eq", Value: "12",
	}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "gpuCount", Operator: "gt", Value: "12",
	}))
}

func TestClusterMatchesFilter_GpuType(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{}
	nodes := []k8s.NodeInfo{
		{GPUType: "NVIDIA-A100"},
		{GPUType: "AMD-MI250X"},
	}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "gpuType", Operator: "eq", Value: "NVIDIA-A100",
	}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "gpuType", Operator: "contains", Value: "A100",
	}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "gpuType", Operator: "eq", Value: "TPU-v4",
	}))
}

func TestClusterMatchesFilter_Label(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{}
	nodes := []k8s.NodeInfo{
		{Labels: map[string]string{"region": "us-west", "tier": "gpu"}},
		{Labels: map[string]string{"region": "us-east"}},
	}

	// Label exists on at least one node
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "label", Operator: "eq", Value: "us-west", LabelKey: "region",
	}))

	// Label value doesn't match
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "label", Operator: "eq", Value: "eu-central", LabelKey: "region",
	}))

	// Label key doesn't exist
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{
		Field: "label", Operator: "eq", Value: "prod", LabelKey: "env",
	}))

	// No nodes — no labels
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "label", Operator: "eq", Value: "us-west", LabelKey: "region",
	}))
}

func TestClusterMatchesFilter_UnsupportedField(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{Name: "test"}

	// Unsupported fields should return false without panicking
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "region", Operator: "eq", Value: "us-west",
	}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{
		Field: "zone", Operator: "eq", Value: "a",
	}))
}

// ---------- clusterMatchesFilters (all-must-match) ----------

func TestClusterMatchesFilters_AllMustMatch(t *testing.T) {
	h := &ConsolePersistenceHandlers{}
	cluster := k8s.ClusterInfo{Name: "prod-west", Healthy: true, NodeCount: 5}

	// Both filters match
	assert.True(t, h.clusterMatchesFilters(cluster, nil, nil, []v1alpha1.ClusterFilter{
		{Field: "name", Operator: "contains", Value: "prod"},
		{Field: "healthy", Operator: "eq", Value: "true"},
	}))

	// One filter fails
	assert.False(t, h.clusterMatchesFilters(cluster, nil, nil, []v1alpha1.ClusterFilter{
		{Field: "name", Operator: "contains", Value: "prod"},
		{Field: "nodeCount", Operator: "gt", Value: "10"},
	}))

	// Empty filters — all clusters match
	assert.True(t, h.clusterMatchesFilters(cluster, nil, nil, nil))
}
