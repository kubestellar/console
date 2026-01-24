package k8s

import (
	"context"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// GVRs for workload resources
var (
	gvrDeployments = schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "deployments",
	}
	gvrStatefulSets = schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "statefulsets",
	}
	gvrDaemonSets = schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "daemonsets",
	}
	gvrNodes = schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "nodes",
	}
)

// ListWorkloads lists all workloads across clusters
func (m *MultiClusterClient) ListWorkloads(ctx context.Context, cluster, namespace, workloadType string) (*v1alpha1.WorkloadList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	if cluster != "" {
		clusters = append(clusters, cluster)
	} else {
		for name := range m.clients {
			clusters = append(clusters, name)
		}
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	workloads := make([]v1alpha1.Workload, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(c string) {
			defer wg.Done()

			clusterWorkloads, err := m.ListWorkloadsForCluster(ctx, c, namespace, workloadType)
			if err != nil {
				return
			}

			mu.Lock()
			workloads = append(workloads, clusterWorkloads...)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.WorkloadList{
		Items:      workloads,
		TotalCount: len(workloads),
	}, nil
}

// ListWorkloadsForCluster lists workloads in a specific cluster
func (m *MultiClusterClient) ListWorkloadsForCluster(ctx context.Context, contextName, namespace, workloadType string) ([]v1alpha1.Workload, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	workloads := make([]v1alpha1.Workload, 0)

	// List Deployments
	if workloadType == "" || workloadType == "Deployment" {
		var deployments interface{}
		if namespace == "" {
			deployments, err = dynamicClient.Resource(gvrDeployments).List(ctx, metav1.ListOptions{})
		} else {
			deployments, err = dynamicClient.Resource(gvrDeployments).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
		if err == nil {
			workloads = append(workloads, m.parseDeploymentsAsWorkloads(deployments, contextName)...)
		}
	}

	// List StatefulSets
	if workloadType == "" || workloadType == "StatefulSet" {
		var statefulsets interface{}
		if namespace == "" {
			statefulsets, err = dynamicClient.Resource(gvrStatefulSets).List(ctx, metav1.ListOptions{})
		} else {
			statefulsets, err = dynamicClient.Resource(gvrStatefulSets).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
		if err == nil {
			workloads = append(workloads, m.parseStatefulSetsAsWorkloads(statefulsets, contextName)...)
		}
	}

	// List DaemonSets
	if workloadType == "" || workloadType == "DaemonSet" {
		var daemonsets interface{}
		if namespace == "" {
			daemonsets, err = dynamicClient.Resource(gvrDaemonSets).List(ctx, metav1.ListOptions{})
		} else {
			daemonsets, err = dynamicClient.Resource(gvrDaemonSets).Namespace(namespace).List(ctx, metav1.ListOptions{})
		}
		if err == nil {
			workloads = append(workloads, m.parseDaemonSetsAsWorkloads(daemonsets, contextName)...)
		}
	}

	return workloads, nil
}

// parseDeploymentsAsWorkloads parses deployments from unstructured list
func (m *MultiClusterClient) parseDeploymentsAsWorkloads(list interface{}, contextName string) []v1alpha1.Workload {
	workloads := make([]v1alpha1.Workload, 0)

	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetLabels() map[string]string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				w := v1alpha1.Workload{
					Name:      item.GetName(),
					Namespace: item.GetNamespace(),
					Type:      v1alpha1.WorkloadTypeDeployment,
					Labels:    item.GetLabels(),
					CreatedAt: item.GetCreationTimestamp().Time,
					TargetClusters: []string{contextName},
				}

				content := item.UnstructuredContent()

				// Parse spec.replicas
				if spec, ok := content["spec"].(map[string]interface{}); ok {
					if replicas, ok := spec["replicas"].(int64); ok {
						w.Replicas = int32(replicas)
					}
					// Parse image from first container
					if template, ok := spec["template"].(map[string]interface{}); ok {
						if templateSpec, ok := template["spec"].(map[string]interface{}); ok {
							if containers, ok := templateSpec["containers"].([]interface{}); ok && len(containers) > 0 {
								if container, ok := containers[0].(map[string]interface{}); ok {
									if image, ok := container["image"].(string); ok {
										w.Image = image
									}
								}
							}
						}
					}
				}

				// Parse status
				if status, ok := content["status"].(map[string]interface{}); ok {
					if readyReplicas, ok := status["readyReplicas"].(int64); ok {
						w.ReadyReplicas = int32(readyReplicas)
					}
					if availableReplicas, ok := status["availableReplicas"].(int64); ok {
						if int32(availableReplicas) == w.Replicas {
							w.Status = v1alpha1.WorkloadStatusRunning
						} else if availableReplicas > 0 {
							w.Status = v1alpha1.WorkloadStatusDegraded
						} else {
							w.Status = v1alpha1.WorkloadStatusPending
						}
					} else {
						w.Status = v1alpha1.WorkloadStatusPending
					}
				}

				// Add cluster deployment info
				w.Deployments = []v1alpha1.ClusterDeployment{{
					Cluster:       contextName,
					Status:        w.Status,
					Replicas:      w.Replicas,
					ReadyReplicas: w.ReadyReplicas,
					LastUpdated:   time.Now(),
				}}

				workloads = append(workloads, w)
			}
			return nil
		})
	}

	return workloads
}

// parseStatefulSetsAsWorkloads parses statefulsets from unstructured list
func (m *MultiClusterClient) parseStatefulSetsAsWorkloads(list interface{}, contextName string) []v1alpha1.Workload {
	workloads := make([]v1alpha1.Workload, 0)

	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetLabels() map[string]string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				w := v1alpha1.Workload{
					Name:           item.GetName(),
					Namespace:      item.GetNamespace(),
					Type:           v1alpha1.WorkloadTypeStatefulSet,
					Labels:         item.GetLabels(),
					CreatedAt:      item.GetCreationTimestamp().Time,
					TargetClusters: []string{contextName},
					Status:         v1alpha1.WorkloadStatusUnknown,
				}

				content := item.UnstructuredContent()

				// Parse spec.replicas
				if spec, ok := content["spec"].(map[string]interface{}); ok {
					if replicas, ok := spec["replicas"].(int64); ok {
						w.Replicas = int32(replicas)
					}
				}

				// Parse status
				if status, ok := content["status"].(map[string]interface{}); ok {
					if readyReplicas, ok := status["readyReplicas"].(int64); ok {
						w.ReadyReplicas = int32(readyReplicas)
					}
					if w.ReadyReplicas == w.Replicas && w.Replicas > 0 {
						w.Status = v1alpha1.WorkloadStatusRunning
					} else if w.ReadyReplicas > 0 {
						w.Status = v1alpha1.WorkloadStatusDegraded
					} else {
						w.Status = v1alpha1.WorkloadStatusPending
					}
				}

				w.Deployments = []v1alpha1.ClusterDeployment{{
					Cluster:       contextName,
					Status:        w.Status,
					Replicas:      w.Replicas,
					ReadyReplicas: w.ReadyReplicas,
					LastUpdated:   time.Now(),
				}}

				workloads = append(workloads, w)
			}
			return nil
		})
	}

	return workloads
}

// parseDaemonSetsAsWorkloads parses daemonsets from unstructured list
func (m *MultiClusterClient) parseDaemonSetsAsWorkloads(list interface{}, contextName string) []v1alpha1.Workload {
	workloads := make([]v1alpha1.Workload, 0)

	if listMap, ok := list.(interface{ EachListItem(func(interface{}) error) error }); ok {
		_ = listMap.EachListItem(func(obj interface{}) error {
			if item, ok := obj.(interface {
				GetName() string
				GetNamespace() string
				GetLabels() map[string]string
				GetCreationTimestamp() metav1.Time
				UnstructuredContent() map[string]interface{}
			}); ok {
				w := v1alpha1.Workload{
					Name:           item.GetName(),
					Namespace:      item.GetNamespace(),
					Type:           v1alpha1.WorkloadTypeDaemonSet,
					Labels:         item.GetLabels(),
					CreatedAt:      item.GetCreationTimestamp().Time,
					TargetClusters: []string{contextName},
					Status:         v1alpha1.WorkloadStatusUnknown,
				}

				content := item.UnstructuredContent()

				// Parse status
				if status, ok := content["status"].(map[string]interface{}); ok {
					if desiredNumber, ok := status["desiredNumberScheduled"].(int64); ok {
						w.Replicas = int32(desiredNumber)
					}
					if readyNumber, ok := status["numberReady"].(int64); ok {
						w.ReadyReplicas = int32(readyNumber)
					}
					if w.ReadyReplicas == w.Replicas && w.Replicas > 0 {
						w.Status = v1alpha1.WorkloadStatusRunning
					} else if w.ReadyReplicas > 0 {
						w.Status = v1alpha1.WorkloadStatusDegraded
					} else {
						w.Status = v1alpha1.WorkloadStatusPending
					}
				}

				w.Deployments = []v1alpha1.ClusterDeployment{{
					Cluster:       contextName,
					Status:        w.Status,
					Replicas:      w.Replicas,
					ReadyReplicas: w.ReadyReplicas,
					LastUpdated:   time.Now(),
				}}

				workloads = append(workloads, w)
			}
			return nil
		})
	}

	return workloads
}

// GetWorkload gets a specific workload
func (m *MultiClusterClient) GetWorkload(ctx context.Context, cluster, namespace, name string) (*v1alpha1.Workload, error) {
	workloads, err := m.ListWorkloadsForCluster(ctx, cluster, namespace, "")
	if err != nil {
		return nil, err
	}

	for _, w := range workloads {
		if w.Name == name {
			return &w, nil
		}
	}

	return nil, nil
}

// DeployWorkload deploys a workload to target clusters (placeholder - would use MCP or direct apply)
func (m *MultiClusterClient) DeployWorkload(ctx context.Context, sourceCluster, namespace, name string, targetClusters []string, replicas int32) (*v1alpha1.DeployResponse, error) {
	// This is a placeholder - in a real implementation, this would:
	// 1. Get the workload manifest from the source cluster
	// 2. Apply it to each target cluster
	// 3. Or create a KubeStellar BindingPolicy for the workload

	return &v1alpha1.DeployResponse{
		Success:    true,
		Message:    "Workload deployment initiated",
		DeployedTo: targetClusters,
	}, nil
}

// ScaleWorkload scales a workload across clusters
func (m *MultiClusterClient) ScaleWorkload(ctx context.Context, namespace, name string, targetClusters []string, replicas int32) (*v1alpha1.DeployResponse, error) {
	// Placeholder for scaling implementation
	return &v1alpha1.DeployResponse{
		Success: true,
		Message: "Workload scaling initiated",
	}, nil
}

// DeleteWorkload deletes a workload from a cluster
func (m *MultiClusterClient) DeleteWorkload(ctx context.Context, cluster, namespace, name string) error {
	// Placeholder for delete implementation
	return nil
}

// GetClusterCapabilities returns the capabilities of all clusters
func (m *MultiClusterClient) GetClusterCapabilities(ctx context.Context) (*v1alpha1.ClusterCapabilityList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	capabilities := make([]v1alpha1.ClusterCapability, 0, len(clusters))

	for _, clusterName := range clusters {
		cap := v1alpha1.ClusterCapability{
			Cluster:   clusterName,
			Available: true,
		}

		// Get node info to determine capabilities
		nodes, err := m.GetNodes(ctx, clusterName)
		if err == nil {
			cap.NodeCount = len(nodes)

			// Use capacity from first node as representative
			// (GetNodes returns NodeInfo with string capacities)
			if len(nodes) > 0 {
				cap.CPUCapacity = nodes[0].CPUCapacity
				cap.MemCapacity = nodes[0].MemoryCapacity
				// Check for GPU labels
				for _, node := range nodes {
					if gpuType, ok := node.Labels["nvidia.com/gpu.product"]; ok {
						cap.GPUType = gpuType
						break
					}
				}
			}
		}

		capabilities = append(capabilities, cap)
	}

	return &v1alpha1.ClusterCapabilityList{
		Items:      capabilities,
		TotalCount: len(capabilities),
	}, nil
}

// ListBindingPolicies lists binding policies (placeholder)
func (m *MultiClusterClient) ListBindingPolicies(ctx context.Context) (*v1alpha1.BindingPolicyList, error) {
	// Placeholder - would list actual KubeStellar BindingPolicies
	return &v1alpha1.BindingPolicyList{
		Items:      []v1alpha1.BindingPolicy{},
		TotalCount: 0,
	}, nil
}

