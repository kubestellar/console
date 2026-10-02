package k8s

import (
	"context"
	"fmt"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
)

// GetClusterCapabilities returns the capabilities of all clusters.
//
// Uses DeduplicatedClusters instead of the lazy m.clients snapshot so that
// newly-added kubeconfig contexts appear immediately on hot reload, matching
// the fix already landed in argocd.go for #6476. Previously, a cluster added
// after startup whose kubernetes client had not yet been lazily created was
// silently missing from /workloads/capabilities responses (#6661).
func (m *MultiClusterClient) GetClusterCapabilities(ctx context.Context) (*v1alpha1.ClusterCapabilityList, error) {
	dedupClusters, err := m.DeduplicatedClusters(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %w", err)
	}
	clusters := make([]string, 0, len(dedupClusters))
	for _, c := range dedupClusters {
		clusters = append(clusters, c.Name)
	}

	capabilities := make([]v1alpha1.ClusterCapability, 0, len(clusters))

	for _, clusterName := range clusters {
		cap := v1alpha1.ClusterCapability{
			Cluster: clusterName,
		}

		// Get node info to determine capabilities
		nodes, err := m.GetNodes(ctx, clusterName)
		if err != nil {
			// Cluster is unreachable — mark unavailable
			cap.Available = false
			capabilities = append(capabilities, cap)
			continue
		}

		cap.NodeCount = len(nodes)

		// A cluster with zero nodes is not a viable deployment target
		if cap.NodeCount == 0 {
			cap.Available = false
			capabilities = append(capabilities, cap)
			continue
		}

		// Cluster is reachable and has nodes — mark available
		cap.Available = true

		// Sum up resources from all nodes
		var totalGPUs int
		for _, node := range nodes {
			totalGPUs += node.GPUCount
			// Use first node with GPU type as representative
			if cap.GPUType == "" && node.GPUType != "" {
				cap.GPUType = node.GPUType
			}
		}
		cap.GPUCount = totalGPUs

		// Use capacity from first node as representative for CPU/Memory
		if len(nodes) > 0 {
			cap.CPUCapacity = nodes[0].CPUCapacity
			cap.MemCapacity = nodes[0].MemoryCapacity
		}

		capabilities = append(capabilities, cap)
	}

	return &v1alpha1.ClusterCapabilityList{
		Items:      capabilities,
		TotalCount: len(capabilities),
	}, nil
}
