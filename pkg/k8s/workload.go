package k8s

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
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

// DeployOptions configures how a workload is deployed across clusters
type DeployOptions struct {
	DeployedBy string
	GroupName  string
}

// DeployWorkload fetches a workload manifest from the source cluster and applies it to target clusters
func (m *MultiClusterClient) DeployWorkload(ctx context.Context, sourceCluster, namespace, name string, targetClusters []string, replicas int32, opts *DeployOptions) (*v1alpha1.DeployResponse, error) {
	if opts == nil {
		opts = &DeployOptions{DeployedBy: "anonymous"}
	}

	// 1. Fetch the workload from the source cluster
	sourceClient, err := m.GetDynamicClient(sourceCluster)
	if err != nil {
		return nil, fmt.Errorf("failed to get source cluster client: %w", err)
	}

	// Try Deployment, StatefulSet, DaemonSet in order
	gvrs := []struct {
		gvr  schema.GroupVersionResource
		kind string
	}{
		{gvrDeployments, "Deployment"},
		{gvrStatefulSets, "StatefulSet"},
		{gvrDaemonSets, "DaemonSet"},
	}

	var sourceObj *unstructured.Unstructured
	var sourceGVR schema.GroupVersionResource
	for _, g := range gvrs {
		obj, getErr := sourceClient.Resource(g.gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr == nil {
			sourceObj = obj
			sourceGVR = g.gvr
			break
		}
	}

	if sourceObj == nil {
		return nil, fmt.Errorf("workload %s/%s not found in cluster %s", namespace, name, sourceCluster)
	}

	// 2. Clean the manifest for cross-cluster apply
	cleanedObj := cleanManifestForDeploy(sourceObj, opts)

	// Override replicas if specified
	if replicas > 0 {
		if spec, ok := cleanedObj.Object["spec"].(map[string]interface{}); ok {
			spec["replicas"] = int64(replicas)
		}
	}

	// 3. Apply to each target cluster in parallel
	var wg sync.WaitGroup
	var mu sync.Mutex
	deployed := make([]string, 0, len(targetClusters))
	failed := make([]string, 0)
	var lastErr error

	for _, target := range targetClusters {
		wg.Add(1)
		go func(targetCluster string) {
			defer wg.Done()

			targetClient, err := m.GetDynamicClient(targetCluster)
			if err != nil {
				mu.Lock()
				failed = append(failed, targetCluster)
				lastErr = fmt.Errorf("cluster %s: %w", targetCluster, err)
				mu.Unlock()
				return
			}

			// Deep copy the object for this cluster
			objCopy := cleanedObj.DeepCopy()

			// Normalize image names for CRI-O clusters (short names → fully qualified)
			normalizeImageNames(objCopy)

			// Create a per-cluster timeout context
			clusterCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()

			// Try to create; if exists, update
			_, err = targetClient.Resource(sourceGVR).Namespace(namespace).Create(clusterCtx, objCopy, metav1.CreateOptions{})
			if err != nil {
				// If already exists, try update
				existing, getErr := targetClient.Resource(sourceGVR).Namespace(namespace).Get(clusterCtx, name, metav1.GetOptions{})
				if getErr != nil {
					mu.Lock()
					failed = append(failed, targetCluster)
					lastErr = fmt.Errorf("cluster %s: create failed: %w", targetCluster, err)
					mu.Unlock()
					return
				}
				// Copy resourceVersion for update
				objCopy.SetResourceVersion(existing.GetResourceVersion())
				_, err = targetClient.Resource(sourceGVR).Namespace(namespace).Update(clusterCtx, objCopy, metav1.UpdateOptions{})
				if err != nil {
					mu.Lock()
					failed = append(failed, targetCluster)
					lastErr = fmt.Errorf("cluster %s: update failed: %w", targetCluster, err)
					mu.Unlock()
					return
				}
			}

			mu.Lock()
			deployed = append(deployed, targetCluster)
			mu.Unlock()
		}(target)
	}

	wg.Wait()

	resp := &v1alpha1.DeployResponse{
		Success:        len(failed) == 0,
		DeployedTo:     deployed,
		FailedClusters: failed,
	}

	if len(failed) == 0 {
		resp.Message = fmt.Sprintf("Deployed %s/%s to %d cluster(s)", namespace, name, len(deployed))
	} else if len(deployed) > 0 {
		resp.Message = fmt.Sprintf("Partially deployed: %d succeeded, %d failed", len(deployed), len(failed))
	} else {
		resp.Message = fmt.Sprintf("Deployment failed on all clusters: %v", lastErr)
	}

	return resp, nil
}

// cleanManifestForDeploy strips cluster-specific metadata and adds console labels
func cleanManifestForDeploy(obj *unstructured.Unstructured, opts *DeployOptions) *unstructured.Unstructured {
	clean := obj.DeepCopy()

	// Strip cluster-specific fields
	clean.SetResourceVersion("")
	clean.SetUID("")
	clean.SetSelfLink("")
	clean.SetGeneration(0)
	clean.SetManagedFields(nil)
	clean.SetCreationTimestamp(metav1.Time{})

	// Remove status
	delete(clean.Object, "status")

	// Remove owner references (cluster-specific)
	clean.SetOwnerReferences(nil)

	// Add console labels
	labels := clean.GetLabels()
	if labels == nil {
		labels = make(map[string]string)
	}
	labels["kubestellar.io/managed-by"] = "kubestellar-console"
	if opts.DeployedBy != "" {
		labels["kubestellar.io/deployed-by"] = opts.DeployedBy
	}
	if opts.GroupName != "" {
		labels["kubestellar.io/group"] = opts.GroupName
	}
	clean.SetLabels(labels)

	// Add annotations
	annotations := clean.GetAnnotations()
	if annotations == nil {
		annotations = make(map[string]string)
	}
	annotations["kubestellar.io/deploy-timestamp"] = time.Now().UTC().Format(time.RFC3339)
	annotations["kubestellar.io/source-cluster"] = obj.GetNamespace()
	clean.SetAnnotations(annotations)

	return clean
}

// normalizeImageNames converts short image names to fully-qualified for CRI-O compatibility
func normalizeImageNames(obj *unstructured.Unstructured) {
	spec, ok := obj.Object["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	templateSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}
	containers, ok := templateSpec["containers"].([]interface{})
	if !ok {
		return
	}

	for _, c := range containers {
		container, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		image, ok := container["image"].(string)
		if !ok {
			continue
		}
		container["image"] = normalizeImageRef(image)
	}

	// Also handle init containers
	initContainers, ok := templateSpec["initContainers"].([]interface{})
	if !ok {
		return
	}
	for _, c := range initContainers {
		container, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		image, ok := container["image"].(string)
		if !ok {
			continue
		}
		container["image"] = normalizeImageRef(image)
	}
}

// normalizeImageRef converts short Docker Hub names to fully-qualified
// e.g. "nginx:1.27" → "docker.io/library/nginx:1.27"
// e.g. "myorg/myimage:v1" → "docker.io/myorg/myimage:v1"
func normalizeImageRef(image string) string {
	// Already fully qualified (contains a dot in the registry part)
	parts := strings.SplitN(image, "/", 2)
	if len(parts) > 1 && strings.Contains(parts[0], ".") {
		return image
	}

	// Single-name image (e.g. "nginx:tag") → docker.io/library/name
	if !strings.Contains(image, "/") {
		return "docker.io/library/" + image
	}

	// Two-part name without registry (e.g. "org/image:tag") → docker.io/org/image
	return "docker.io/" + image
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
		}

		capabilities = append(capabilities, cap)
	}

	return &v1alpha1.ClusterCapabilityList{
		Items:      capabilities,
		TotalCount: len(capabilities),
	}, nil
}

// LabelClusterNodes labels all nodes in a cluster with the given labels
func (m *MultiClusterClient) LabelClusterNodes(ctx context.Context, cluster string, labels map[string]string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return err
	}

	nodeList, err := dynamicClient.Resource(gvrNodes).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes in %s: %w", cluster, err)
	}

	for _, node := range nodeList.Items {
		existing := node.GetLabels()
		if existing == nil {
			existing = make(map[string]string)
		}
		for k, v := range labels {
			existing[k] = v
		}
		node.SetLabels(existing)
		_, err := dynamicClient.Resource(gvrNodes).Update(ctx, &node, metav1.UpdateOptions{})
		if err != nil {
			return fmt.Errorf("failed to label node %s in %s: %w", node.GetName(), cluster, err)
		}
	}
	return nil
}

// RemoveClusterNodeLabels removes specified labels from all nodes in a cluster
func (m *MultiClusterClient) RemoveClusterNodeLabels(ctx context.Context, cluster string, labelKeys []string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return err
	}

	nodeList, err := dynamicClient.Resource(gvrNodes).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes in %s: %w", cluster, err)
	}

	for _, node := range nodeList.Items {
		existing := node.GetLabels()
		if existing == nil {
			continue
		}
		changed := false
		for _, k := range labelKeys {
			if _, ok := existing[k]; ok {
				delete(existing, k)
				changed = true
			}
		}
		if !changed {
			continue
		}
		node.SetLabels(existing)
		_, err := dynamicClient.Resource(gvrNodes).Update(ctx, &node, metav1.UpdateOptions{})
		if err != nil {
			return fmt.Errorf("failed to update node %s in %s: %w", node.GetName(), cluster, err)
		}
	}
	return nil
}

// ListBindingPolicies lists binding policies (placeholder)
func (m *MultiClusterClient) ListBindingPolicies(ctx context.Context) (*v1alpha1.BindingPolicyList, error) {
	// Placeholder - would list actual KubeStellar BindingPolicies
	return &v1alpha1.BindingPolicyList{
		Items:      []v1alpha1.BindingPolicy{},
		TotalCount: 0,
	}, nil
}

