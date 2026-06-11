package handlers

// Tests for console_persistence_validation.go: matchString, clusterFilterNeedsNodes,
// and evaluateClusterGroup (static-member and nil-client paths).
// The clusterMatchesFilter/clusterMatchesFilters tests live in console_persistence_test.go.

import (
	"context"
	"sort"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
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

// ---------- evaluateClusterGroup (nil-k8sClient paths) ----------

// newGroupWithStatics builds a minimal ClusterGroup with the given static members.
func newGroupWithStatics(members ...string) *v1alpha1.ClusterGroup {
	return &v1alpha1.ClusterGroup{
		Spec: v1alpha1.ClusterGroupSpec{StaticMembers: members},
	}
}

func TestEvaluateClusterGroup_EmptyGroup(t *testing.T) {
	h := newTestHandler() // k8sClient == nil
	result := h.evaluateClusterGroup(context.Background(), &v1alpha1.ClusterGroup{})
	assert.Empty(t, result, "empty ClusterGroup should yield no members")
}

func TestEvaluateClusterGroup_StaticMembersOnly(t *testing.T) {
	h := newTestHandler()
	group := newGroupWithStatics("cluster-a", "cluster-b", "cluster-c")
	result := h.evaluateClusterGroup(context.Background(), group)
	sort.Strings(result)
	assert.Equal(t, []string{"cluster-a", "cluster-b", "cluster-c"}, result)
}

func TestEvaluateClusterGroup_SingleStaticMember(t *testing.T) {
	h := newTestHandler()
	result := h.evaluateClusterGroup(context.Background(), newGroupWithStatics("only-cluster"))
	assert.Equal(t, []string{"only-cluster"}, result)
}

func TestEvaluateClusterGroup_DeduplicatesStaticMembers(t *testing.T) {
	h := newTestHandler()
	// Same name listed twice — deduplication via map should yield one entry.
	group := newGroupWithStatics("cluster-a", "cluster-a", "cluster-b")
	result := h.evaluateClusterGroup(context.Background(), group)
	sort.Strings(result)
	assert.Equal(t, []string{"cluster-a", "cluster-b"}, result)
}

func TestEvaluateClusterGroup_DynamicFiltersSkippedWhenClientNil(t *testing.T) {
	h := newTestHandler() // k8sClient == nil — dynamic path must be skipped
	group := &v1alpha1.ClusterGroup{
		Spec: v1alpha1.ClusterGroupSpec{
			StaticMembers: []string{"static-cluster"},
			DynamicFilters: []v1alpha1.ClusterFilter{
				{Field: "name", Operator: "eq", Value: "dynamic-cluster"},
			},
		},
	}
	result := h.evaluateClusterGroup(context.Background(), group)
	// dynamic filters are skipped; only static member returned
	assert.Equal(t, []string{"static-cluster"}, result)
}

func TestEvaluateClusterGroup_NoDynamicFiltersNoClient(t *testing.T) {
	h := newTestHandler()
	group := &v1alpha1.ClusterGroup{
		Spec: v1alpha1.ClusterGroupSpec{
			StaticMembers:  []string{},
			DynamicFilters: []v1alpha1.ClusterFilter{},
		},
	}
	result := h.evaluateClusterGroup(context.Background(), group)
	assert.Empty(t, result)
}
