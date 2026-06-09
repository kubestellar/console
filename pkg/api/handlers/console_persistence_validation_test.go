package handlers

// Tests for console_persistence_validation.go: matchString and clusterFilterNeedsNodes.
// The clusterMatchesFilter/clusterMatchesFilters tests live in console_persistence_test.go.

import (
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
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
