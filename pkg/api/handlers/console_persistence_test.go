package handlers

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/stretchr/testify/assert"
)

// newTestHandler returns a minimal ConsolePersistenceHandlers for unit tests
// (no persistence store or k8s client needed for pure filter tests).
func newTestHandler() *ConsolePersistenceHandlers {
	return &ConsolePersistenceHandlers{}
}

func TestClusterMatchesFilter_Name(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "prod-cluster"}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "name", Operator: "eq", Value: "prod-cluster"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "name", Operator: "eq", Value: "other"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "name", Operator: "neq", Value: "other"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "name", Operator: "neq", Value: "prod-cluster"}))
}

func TestClusterMatchesFilter_Healthy(t *testing.T) {
	h := newTestHandler()
	healthy := k8s.ClusterInfo{Name: "c", Healthy: true}
	unhealthy := k8s.ClusterInfo{Name: "c", Healthy: false}

	assert.True(t, h.clusterMatchesFilter(healthy, nil, nil, v1alpha1.ClusterFilter{Field: "healthy", Operator: "eq", Value: "true"}))
	assert.True(t, h.clusterMatchesFilter(healthy, nil, nil, v1alpha1.ClusterFilter{Field: "healthy", Operator: "eq", Value: "True"}))  // case-insensitive
	assert.False(t, h.clusterMatchesFilter(healthy, nil, nil, v1alpha1.ClusterFilter{Field: "healthy", Operator: "eq", Value: "false"}))
	assert.True(t, h.clusterMatchesFilter(unhealthy, nil, nil, v1alpha1.ClusterFilter{Field: "healthy", Operator: "eq", Value: "false"}))
}

func TestClusterMatchesFilter_Reachable(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}
	health := &k8s.ClusterHealth{Reachable: true}

	// With health data
	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "reachable", Operator: "eq", Value: "true"}))
	assert.False(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "reachable", Operator: "eq", Value: "false"}))

	// No health data → false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "reachable", Operator: "eq", Value: "true"}))
}

func TestClusterMatchesFilter_NodeCount(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c", NodeCount: 5}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "nodeCount", Operator: "eq", Value: "5"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "nodeCount", Operator: "gte", Value: "3"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "nodeCount", Operator: "lte", Value: "5"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "nodeCount", Operator: "gt", Value: "5"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "nodeCount", Operator: "lt", Value: "10"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "nodeCount", Operator: "neq", Value: "3"}))
}

func TestClusterMatchesFilter_PodCount(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c", PodCount: 20}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "podCount", Operator: "eq", Value: "20"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "podCount", Operator: "gt", Value: "10"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "podCount", Operator: "gt", Value: "20"}))
}

func TestClusterMatchesFilter_CpuCores(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}
	health := &k8s.ClusterHealth{CpuCores: 16}

	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "cpuCores", Operator: "gte", Value: "8"}))
	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "cpuCores", Operator: "eq", Value: "16"}))
	assert.False(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "cpuCores", Operator: "gt", Value: "16"}))

	// No health data → false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "cpuCores", Operator: "gte", Value: "1"}))
}

func TestClusterMatchesFilter_MemoryGB(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}
	health := &k8s.ClusterHealth{MemoryGB: 64.0}

	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "memoryGB", Operator: "gte", Value: "32"}))
	assert.True(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "memoryGB", Operator: "eq", Value: "64"}))
	assert.False(t, h.clusterMatchesFilter(cluster, health, nil, v1alpha1.ClusterFilter{Field: "memoryGB", Operator: "gt", Value: "64"}))

	// No health data → false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "memoryGB", Operator: "gte", Value: "1"}))
}

func TestClusterMatchesFilter_GpuCount(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}
	nodes := []k8s.NodeInfo{
		{Name: "n1", GPUCount: 4},
		{Name: "n2", GPUCount: 2},
	}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "gpuCount", Operator: "eq", Value: "6"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "gpuCount", Operator: "gte", Value: "4"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "gpuCount", Operator: "gt", Value: "6"}))

	// No nodes → gpuCount = 0
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "gpuCount", Operator: "eq", Value: "0"}))
}

func TestClusterMatchesFilter_GpuType(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}
	nodes := []k8s.NodeInfo{
		{Name: "n1", GPUType: "NVIDIA A100"},
		{Name: "n2", GPUType: "NVIDIA A100"},
	}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "gpuType", Operator: "eq", Value: "NVIDIA A100"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "gpuType", Operator: "eq", Value: "AMD"}))
	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "gpuType", Operator: "neq", Value: "AMD"}))

	// No nodes
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "gpuType", Operator: "eq", Value: "NVIDIA A100"}))
}

func TestClusterMatchesFilter_Label(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}
	nodes := []k8s.NodeInfo{
		{
			Name:   "n1",
			Labels: map[string]string{"env": "production", "region": "us-east-1"},
		},
	}

	assert.True(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "label", LabelKey: "env", Operator: "eq", Value: "production"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "label", LabelKey: "env", Operator: "eq", Value: "staging"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nodes, v1alpha1.ClusterFilter{Field: "label", LabelKey: "nonexistent", Operator: "eq", Value: "value"}))

	// No nodes → false
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "label", LabelKey: "env", Operator: "eq", Value: "production"}))
}

func TestClusterMatchesFilter_UnknownField(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c"}

	// Unknown fields should return false (not silently pass)
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "region", Operator: "eq", Value: "us-east-1"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "zone", Operator: "eq", Value: "us-east-1a"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "provider", Operator: "eq", Value: "aws"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "version", Operator: "eq", Value: "1.28"}))
	assert.False(t, h.clusterMatchesFilter(cluster, nil, nil, v1alpha1.ClusterFilter{Field: "unknownField", Operator: "eq", Value: "value"}))
}

func TestClusterMatchesFilters_AllMatch(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "prod-cluster", Healthy: true, NodeCount: 5, PodCount: 20}
	health := &k8s.ClusterHealth{Reachable: true, CpuCores: 16, MemoryGB: 64.0}
	filters := []v1alpha1.ClusterFilter{
		{Field: "healthy", Operator: "eq", Value: "true"},
		{Field: "nodeCount", Operator: "gte", Value: "3"},
		{Field: "cpuCores", Operator: "gte", Value: "8"},
	}

	assert.True(t, h.clusterMatchesFilters(cluster, health, nil, filters))
}

func TestClusterMatchesFilters_OneFails(t *testing.T) {
	h := newTestHandler()
	cluster := k8s.ClusterInfo{Name: "c", Healthy: true, NodeCount: 2}
	health := &k8s.ClusterHealth{Reachable: true, CpuCores: 4}
	filters := []v1alpha1.ClusterFilter{
		{Field: "healthy", Operator: "eq", Value: "true"},
		{Field: "nodeCount", Operator: "gte", Value: "5"}, // fails: 2 < 5
	}

	assert.False(t, h.clusterMatchesFilters(cluster, health, nil, filters))
}
