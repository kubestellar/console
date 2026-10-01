package workloads

import (
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// TestBuildClusterContextForAI_Empty verifies the fallback string returned
// when there is no cluster health data to render into the AI prompt.
func TestBuildClusterContextForAI_Empty(t *testing.T) {
	got := buildClusterContextForAI(nil)
	if got != "No cluster data available." {
		t.Errorf("empty slice: got %q, want %q", got, "No cluster data available.")
	}

	got = buildClusterContextForAI([]k8s.ClusterHealth{})
	if got != "No cluster data available." {
		t.Errorf("zero-length slice: got %q, want %q", got, "No cluster data available.")
	}
}

// TestBuildClusterContextForAI_RendersEachCluster verifies that every
// cluster is rendered into the prompt as a bullet line that includes the
// cluster name and its summary stats.
func TestBuildClusterContextForAI_RendersEachCluster(t *testing.T) {
	data := []k8s.ClusterHealth{
		{
			Cluster:   "cluster-a",
			Healthy:   true,
			Reachable: true,
			CpuCores:  8,
			MemoryGB:  32.5,
			NodeCount: 3,
			PodCount:  42,
		},
		{
			Cluster:   "cluster-b",
			Healthy:   false,
			Reachable: true,
			CpuCores:  4,
			MemoryGB:  16.0,
			NodeCount: 2,
			PodCount:  10,
		},
	}

	got := buildClusterContextForAI(data)

	if !strings.HasPrefix(got, "Current clusters in the environment:\n") {
		t.Errorf("expected prompt header, got: %q", got)
	}

	wantFragments := []string{
		"- cluster-a: healthy=true, reachable=true, cpuCores=8, memoryGB=32.5, nodes=3, pods=42",
		"- cluster-b: healthy=false, reachable=true, cpuCores=4, memoryGB=16.0, nodes=2, pods=10",
	}
	for _, frag := range wantFragments {
		if !strings.Contains(got, frag) {
			t.Errorf("prompt missing fragment %q\nfull output:\n%s", frag, got)
		}
	}
}

// TestClusterMatchesQuery_EmptyQueryMatchesAll verifies that a query with
// no selector and no filters matches every cluster (the empty AND).
func TestClusterMatchesQuery_EmptyQueryMatchesAll(t *testing.T) {
	health := k8s.ClusterHealth{Cluster: "c1", Healthy: true, CpuCores: 1}
	q := &ClusterGroupQuery{}

	if !clusterMatchesQuery(health, nil, q) {
		t.Errorf("empty query should match every cluster, but got false")
	}
}

// TestClusterMatchesQuery_LabelSelectorAndFilters covers the AND composition
// of label selector + per-cluster filter — the two gating conditions.
func TestClusterMatchesQuery_LabelSelectorAndFilters(t *testing.T) {
	nodes := []k8s.NodeInfo{
		{Name: "n1", Labels: map[string]string{"region": "us-west", "tier": "gpu"}},
	}
	healthy8 := k8s.ClusterHealth{Cluster: "c1", Healthy: true, CpuCores: 8}
	healthy2 := k8s.ClusterHealth{Cluster: "c2", Healthy: true, CpuCores: 2}

	tests := []struct {
		name   string
		health k8s.ClusterHealth
		nodes  []k8s.NodeInfo
		query  *ClusterGroupQuery
		want   bool
	}{
		{
			name:   "selector matches and filter passes",
			health: healthy8,
			nodes:  nodes,
			query: &ClusterGroupQuery{
				LabelSelector: "region=us-west",
				Filters: []ClusterFilter{
					{Field: "cpuCores", Operator: "gte", Value: "4"},
				},
			},
			want: true,
		},
		{
			name:   "selector matches but filter fails",
			health: healthy2,
			nodes:  nodes,
			query: &ClusterGroupQuery{
				LabelSelector: "region=us-west",
				Filters: []ClusterFilter{
					{Field: "cpuCores", Operator: "gte", Value: "4"},
				},
			},
			want: false,
		},
		{
			name:   "selector fails even though filter passes",
			health: healthy8,
			nodes:  nodes,
			query: &ClusterGroupQuery{
				LabelSelector: "region=us-east",
				Filters: []ClusterFilter{
					{Field: "cpuCores", Operator: "gte", Value: "4"},
				},
			},
			want: false,
		},
		{
			name:   "multiple filters AND together — all pass",
			health: healthy8,
			nodes:  nodes,
			query: &ClusterGroupQuery{
				Filters: []ClusterFilter{
					{Field: "healthy", Operator: "eq", Value: "true"},
					{Field: "cpuCores", Operator: "gt", Value: "4"},
				},
			},
			want: true,
		},
		{
			name:   "multiple filters AND together — one fails",
			health: healthy2,
			nodes:  nodes,
			query: &ClusterGroupQuery{
				Filters: []ClusterFilter{
					{Field: "healthy", Operator: "eq", Value: "true"},
					{Field: "cpuCores", Operator: "gt", Value: "4"},
				},
			},
			want: false,
		},
		{
			name:   "invalid selector returns false (defense in depth)",
			health: healthy8,
			nodes:  nodes,
			query: &ClusterGroupQuery{
				LabelSelector: "!!!",
			},
			want: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := clusterMatchesQuery(tc.health, tc.nodes, tc.query); got != tc.want {
				t.Errorf("clusterMatchesQuery = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestClusterMatchesLabelSelector covers the matcher directly, including
// the empty-nodes short-circuit and the invalid-selector guard that the
// handler relies on as a defense-in-depth signal (#9092).
func TestClusterMatchesLabelSelector(t *testing.T) {
	nodes := []k8s.NodeInfo{
		{Name: "n1", Labels: map[string]string{"region": "us-west", "tier": "gpu"}},
		{Name: "n2", Labels: map[string]string{"region": "us-east"}},
	}

	tests := []struct {
		name     string
		nodes    []k8s.NodeInfo
		selector string
		want     bool
	}{
		{
			name:     "selector matches first node",
			nodes:    nodes,
			selector: "region=us-west",
			want:     true,
		},
		{
			name:     "selector matches second node",
			nodes:    nodes,
			selector: "region=us-east",
			want:     true,
		},
		{
			name:     "selector matches no node",
			nodes:    nodes,
			selector: "region=eu-west",
			want:     false,
		},
		{
			name:     "compound selector matches",
			nodes:    nodes,
			selector: "region=us-west,tier=gpu",
			want:     true,
		},
		{
			name:     "compound selector requires both keys on one node",
			nodes:    nodes,
			selector: "region=us-east,tier=gpu",
			want:     false,
		},
		{
			name:     "empty node list never matches",
			nodes:    nil,
			selector: "region=us-west",
			want:     false,
		},
		{
			name:     "invalid selector returns false",
			nodes:    nodes,
			selector: "!!!bogus",
			want:     false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := clusterMatchesLabelSelector(tc.nodes, tc.selector); got != tc.want {
				t.Errorf("clusterMatchesLabelSelector(%q) = %v, want %v", tc.selector, got, tc.want)
			}
		})
	}
}
