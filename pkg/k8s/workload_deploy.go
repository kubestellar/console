package k8s

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/util/retry"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/safego"
)

// ResolveWorkloadDependencies fetches a workload by name (trying Deployment/StatefulSet/DaemonSet)
// and resolves its dependency tree without deploying. Used for dry-run preview.
func (m *MultiClusterClient) ResolveWorkloadDependencies(
	ctx context.Context, cluster, namespace, name string,
) (string, *DependencyBundle, error) {
	sourceClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return "", nil, fmt.Errorf("failed to get cluster client for %s: %w", cluster, err)
	}

	gvrs := []struct {
		gvr  schema.GroupVersionResource
		kind string
	}{
		{gvrDeployments, "Deployment"},
		{gvrStatefulSets, "StatefulSet"},
		{gvrDaemonSets, "DaemonSet"},
	}

	var sourceObj *unstructured.Unstructured
	var workloadKind string
	var lastErr error
	allNotFound := true
	for _, g := range gvrs {
		obj, getErr := sourceClient.Resource(g.gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr == nil {
			sourceObj = obj
			workloadKind = g.kind
			break
		}
		lastErr = getErr
		if !apierrors.IsNotFound(getErr) {
			allNotFound = false
		}
	}

	if sourceObj == nil {
		if !allNotFound && lastErr != nil {
			return "", nil, fmt.Errorf("cluster %s: %w", cluster, lastErr)
		}
		return "", nil, fmt.Errorf("workload %s/%s not found in cluster %s", namespace, name, cluster)
	}

	opts := &DeployOptions{DeployedBy: "dry-run"}
	bundle, err := m.ResolveDependencies(ctx, cluster, namespace, sourceObj, opts)
	if err != nil {
		return workloadKind, nil, fmt.Errorf("dependency resolution failed: %w", err)
	}

	return workloadKind, bundle, nil
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

	// 2. Resolve dependencies (ConfigMaps, Secrets, SA, RBAC, PVCs, Services, Ingress, NetworkPolicy, HPA, PDB)
	bundle, err := m.ResolveDependencies(ctx, sourceCluster, namespace, sourceObj, opts)
	if err != nil {
		slog.Warn("[deploy] dependency resolution failed", "error", err)
		bundle = &DependencyBundle{Workload: sourceObj}
	}
	if len(bundle.Warnings) > 0 {
		for _, w := range bundle.Warnings {
			slog.Info("[deploy] dependency warning", "warning", w)
		}
	}

	// 3. Clean the workload manifest for cross-cluster apply
	cleanedObj := cleanManifestForDeploy(sourceObj, sourceCluster, opts)

	// Override replicas if specified
	if replicas > 0 {
		if spec, ok := cleanedObj.Object["spec"].(map[string]interface{}); ok {
			spec["replicas"] = int64(replicas)
		}
	}

	// 4. Apply to each target cluster in parallel
	var wg sync.WaitGroup
	var mu sync.Mutex
	deployed := make([]string, 0, len(targetClusters))
	failed := make([]string, 0)
	// Collect all per-cluster errors so partial failures report every cluster's
	// error, not just the last one to finish (#10257).
	errs := make([]error, 0)
	allDepResults := make([]v1alpha1.DeployedDep, 0)

	for _, target := range targetClusters {
		targetCluster := target
		wg.Add(1)
		safego.Go(func() {
			defer wg.Done()

			targetClient, err := m.GetDynamicClient(targetCluster)
			if err != nil {
				mu.Lock()
				failed = append(failed, targetCluster)
				errs = append(errs, fmt.Errorf("cluster %s: %w", targetCluster, err))
				mu.Unlock()
				return
			}

			clusterCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
			defer cancel()

			// 4a. Ensure namespace exists on target
			nsErr := m.ensureNamespace(clusterCtx, targetClient, namespace, opts)
			if nsErr != nil {
				slog.Warn("[deploy] namespace ensure failed", "cluster", targetCluster, "error", nsErr)
			}

			// 4b. Apply dependencies in order before the workload
			depResults := applyDependencies(clusterCtx, targetClient, bundle.Dependencies)
			mu.Lock()
			allDepResults = append(allDepResults, depResults...)

			// Check if any dependency failed to deploy
			hasFailedDep := false
			for _, dr := range depResults {
				if dr.Action == "failed" {
					failed = append(failed, targetCluster)
					if dr.Error != "" {
						errs = append(errs, fmt.Errorf("cluster %s: dependency %s/%s failed: %s", targetCluster, dr.Kind, dr.Name, dr.Error))
					} else {
						errs = append(errs, fmt.Errorf("cluster %s: dependency %s/%s failed", targetCluster, dr.Kind, dr.Name))
					}
					hasFailedDep = true
					break // Record one failure reason per cluster to avoid spam
				}
			}
			mu.Unlock()

			if hasFailedDep {
				return // Abort workload deployment for this cluster if deps failed
			}

			// 4c. Apply the workload itself
			objCopy := cleanedObj.DeepCopy()
			normalizeImageNames(objCopy)

			_, err = targetClient.Resource(sourceGVR).Namespace(namespace).Create(clusterCtx, objCopy, metav1.CreateOptions{})
			if err != nil {
				// If already exists, try update. Only fall through to Update when
				// Get succeeds; if Get itself fails with a non-NotFound error (e.g.
				// a transient network failure), return BOTH the Create and Get
				// errors so the operator can see the real cause (#6501). Previously
				// a Get-level network error was silently replaced with the Create
				// error message, masking the root failure.
				existing, getErr := targetClient.Resource(sourceGVR).Namespace(namespace).Get(clusterCtx, name, metav1.GetOptions{})
				if getErr != nil {
					mu.Lock()
					failed = append(failed, targetCluster)
					if apierrors.IsNotFound(getErr) {
						// Genuine "does not exist" — the Create error is authoritative.
						errs = append(errs, fmt.Errorf("cluster %s: create failed: %w", targetCluster, err))
					} else {
						// Non-NotFound Get error (network, auth, server) — surface
						// BOTH errors with %w so callers can errors.Is/As either
						// one. Go 1.20+ supports multi-error %w. (#6547)
						errs = append(errs, fmt.Errorf("cluster %s: create failed: %w; also get failed: %w", targetCluster, err, getErr))
					}
					mu.Unlock()
					return
				}
				objCopy.SetResourceVersion(existing.GetResourceVersion())
				_, err = targetClient.Resource(sourceGVR).Namespace(namespace).Update(clusterCtx, objCopy, metav1.UpdateOptions{})
				if err != nil {
					mu.Lock()
					failed = append(failed, targetCluster)
					errs = append(errs, fmt.Errorf("cluster %s: update failed: %w", targetCluster, err))
					mu.Unlock()
					return
				}
			}

			mu.Lock()
			deployed = append(deployed, targetCluster)
			mu.Unlock()
		})
	}

	wg.Wait()

	// Deduplicate dependency results (same dep applied to multiple clusters)
	depResultMap := make(map[string]v1alpha1.DeployedDep)
	for _, dr := range allDepResults {
		key := dr.Kind + "/" + dr.Name
		existing, exists := depResultMap[key]
		if !exists || dr.Action == "failed" {
			depResultMap[key] = dr
		} else if existing.Action == "skipped" && (dr.Action == "created" || dr.Action == "updated") {
			depResultMap[key] = dr
		}
	}
	dedupedDeps := make([]v1alpha1.DeployedDep, 0, len(depResultMap))
	for _, dr := range depResultMap {
		dedupedDeps = append(dedupedDeps, dr)
	}

	resp := &v1alpha1.DeployResponse{
		Success:        len(failed) == 0,
		DeployedTo:     deployed,
		FailedClusters: failed,
		Dependencies:   dedupedDeps,
		Warnings:       bundle.Warnings,
	}

	depSummary := ""
	if len(dedupedDeps) > 0 {
		depSummary = fmt.Sprintf(" (+ %d dependencies)", len(dedupedDeps))
	}

	if len(failed) == 0 {
		resp.Message = fmt.Sprintf("Deployed %s/%s to %d cluster(s)%s", namespace, name, len(deployed), depSummary)
	} else if len(deployed) > 0 {
		resp.Message = fmt.Sprintf("Partially deployed: %d succeeded, %d failed%s: %v", len(deployed), len(failed), depSummary, errors.Join(errs...))
	} else {
		resp.Message = fmt.Sprintf("Deployment failed on all clusters: %v", errors.Join(errs...))
	}

	return resp, nil
}

// ensureNamespace creates the namespace on the target cluster if it doesn't exist
func (m *MultiClusterClient) ensureNamespace(
	ctx context.Context, client dynamic.Interface, namespace string, opts *DeployOptions,
) error {
	_, err := client.Resource(gvrNamespaces).Get(ctx, namespace, metav1.GetOptions{})
	if err == nil {
		return nil // already exists
	}
	if !apierrors.IsNotFound(err) {
		return fmt.Errorf("failed to check namespace %s: %w", namespace, err)
	}
	nsObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Namespace",
			"metadata": map[string]interface{}{
				"name": namespace,
				"labels": map[string]interface{}{
					"kubestellar.io/managed-by": "kubestellar-console",
				},
			},
		},
	}
	if opts != nil && opts.DeployedBy != "" {
		labels := nsObj.GetLabels()
		labels["kubestellar.io/deployed-by"] = opts.DeployedBy
		nsObj.SetLabels(labels)
	}
	_, err = client.Resource(gvrNamespaces).Create(ctx, nsObj, metav1.CreateOptions{})
	if err != nil && apierrors.IsAlreadyExists(err) {
		return nil
	}
	return err
}

// applyDependencies applies each dependency to the target cluster.
// Uses skip-if-exists logic: skips user-managed resources, updates console-managed ones.
func applyDependencies(
	ctx context.Context, client dynamic.Interface, deps []Dependency,
) []v1alpha1.DeployedDep {
	results := make([]v1alpha1.DeployedDep, 0, len(deps))
	for _, dep := range deps {
		if dep.Object == nil {
			continue
		}

		result := v1alpha1.DeployedDep{
			Kind: string(dep.Kind),
			Name: dep.Name,
		}

		objCopy := dep.Object.DeepCopy()
		var resource dynamic.ResourceInterface
		if dep.Namespace != "" {
			resource = client.Resource(dep.GVR).Namespace(dep.Namespace)
		} else {
			resource = client.Resource(dep.GVR)
		}

		// Check if resource already exists on target
		existing, err := resource.Get(ctx, dep.Name, metav1.GetOptions{})
		if err == nil {
			// Resource exists — check if console-managed
			existingLabels := existing.GetLabels()
			if existingLabels["kubestellar.io/managed-by"] != "kubestellar-console" {
				// Not managed by console — skip to avoid overwriting user resources
				result.Action = "skipped"
				results = append(results, result)
				slog.Info("[deploy] skipped (not console-managed)", "kind", dep.Kind, "name", dep.Name)
				continue
			}
			// Console-managed — update
			objCopy.SetResourceVersion(existing.GetResourceVersion())
			_, err = resource.Update(ctx, objCopy, metav1.UpdateOptions{})
			if err != nil {
				result.Action = "failed"
				result.Error = err.Error()
				slog.Error("[deploy] failed to update dependency", "kind", dep.Kind, "name", dep.Name, "error", err)
			} else {
				result.Action = "updated"
				slog.Info("[deploy] updated dependency", "kind", dep.Kind, "name", dep.Name)
			}
		} else if apierrors.IsNotFound(err) {
			// Resource doesn't exist — create
			_, err = resource.Create(ctx, objCopy, metav1.CreateOptions{})
			if err != nil {
				result.Action = "failed"
				result.Error = err.Error()
				slog.Error("[deploy] failed to create dependency", "kind", dep.Kind, "name", dep.Name, "error", err)
			} else {
				result.Action = "created"
				slog.Info("[deploy] created dependency", "kind", dep.Kind, "name", dep.Name)
			}
		} else {
			// Real error (network, RBAC, etc.) — do not assume resource is missing
			result.Action = "failed"
			result.Error = err.Error()
			slog.Error("[deploy] failed to check dependency", "kind", dep.Kind, "name", dep.Name, "error", err)
		}

		results = append(results, result)
	}
	return results
}

// cleanManifestForDeploy strips cluster-specific metadata and adds console labels
func cleanManifestForDeploy(obj *unstructured.Unstructured, sourceCluster string, opts *DeployOptions) *unstructured.Unstructured {
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
	annotations["kubestellar.io/source-cluster"] = sourceCluster
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

// ScaleWorkload scales supported workload types across the specified clusters by
// fetching the workload and updating spec.replicas on the main resource object.
// It tries Deployments and StatefulSets (DaemonSets do not support replicas).
// If targetClusters is empty, all known clusters are tried.
func (m *MultiClusterClient) ScaleWorkload(ctx context.Context, namespace, name string, targetClusters []string, replicas int32) (*v1alpha1.DeployResponse, error) {
	if len(targetClusters) == 0 {
		m.mu.RLock()
		for clusterName := range m.dynamicClients {
			targetClusters = append(targetClusters, clusterName)
		}
		m.mu.RUnlock()
	}
	if len(targetClusters) == 0 {
		return &v1alpha1.DeployResponse{
			Success: false,
			Message: "no target clusters specified or available",
		}, nil
	}

	scalableGVRs := []struct {
		gvr  schema.GroupVersionResource
		kind string
	}{
		{gvrDeployments, "Deployment"},
		{gvrStatefulSets, "StatefulSet"},
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	deployed := make([]string, 0, len(targetClusters))
	failed := make([]string, 0)
	// Collect all per-cluster errors so partial failures report every cluster's
	// error, not just the last one to finish (#10257).
	scaleErrs := make([]error, 0)

	for _, cluster := range targetClusters {
		clusterName := cluster
		wg.Add(1)
		safego.Go(func() {
			defer wg.Done()

			client, err := m.GetDynamicClient(clusterName)
			if err != nil {
				mu.Lock()
				failed = append(failed, clusterName)
				scaleErrs = append(scaleErrs, fmt.Errorf("cluster %s: %w", clusterName, err))
				mu.Unlock()
				return
			}

			// Try each scalable resource type until we find the workload
			var scaled bool
			for _, g := range scalableGVRs {
				// Get current object to verify it exists
				obj, getErr := client.Resource(g.gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
				if getErr != nil {
					if apierrors.IsNotFound(getErr) {
						continue // Try next GVR
					}
					mu.Lock()
					failed = append(failed, clusterName)
					scaleErrs = append(scaleErrs, fmt.Errorf("cluster %s: get %s: %w", clusterName, g.kind, getErr))
					mu.Unlock()
					return
				}

				// Update the replica count via the spec
				spec, ok := obj.Object["spec"].(map[string]interface{})
				if !ok {
					mu.Lock()
					failed = append(failed, clusterName)
					scaleErrs = append(scaleErrs, fmt.Errorf("cluster %s: invalid spec in %s %s/%s", clusterName, g.kind, namespace, name))
					mu.Unlock()
					return
				}
				spec["replicas"] = int64(replicas)

				_, updateErr := client.Resource(g.gvr).Namespace(namespace).Update(ctx, obj, metav1.UpdateOptions{})
				if updateErr != nil {
					mu.Lock()
					failed = append(failed, clusterName)
					scaleErrs = append(scaleErrs, fmt.Errorf("cluster %s: scale %s: %w", clusterName, g.kind, updateErr))
					mu.Unlock()
					return
				}

				scaled = true
				break
			}

			mu.Lock()
			if scaled {
				deployed = append(deployed, clusterName)
			} else {
				failed = append(failed, clusterName)
				scaleErrs = append(scaleErrs, fmt.Errorf("cluster %s: workload %s/%s not found as Deployment or StatefulSet", clusterName, namespace, name))
			}
			mu.Unlock()
		})
	}

	wg.Wait()

	success := len(deployed) > 0
	msg := fmt.Sprintf("Scaled %s/%s to %d replicas on %d/%d clusters", namespace, name, replicas, len(deployed), len(targetClusters))
	if len(scaleErrs) > 0 && !success {
		msg = fmt.Sprintf("Scale failed on all clusters: %v", errors.Join(scaleErrs...))
	} else if len(scaleErrs) > 0 {
		msg = fmt.Sprintf("%s (errors: %v)", msg, errors.Join(scaleErrs...))
	}

	return &v1alpha1.DeployResponse{
		Success:        success,
		Message:        msg,
		DeployedTo:     deployed,
		FailedClusters: failed,
	}, nil
}

// DeleteWorkload deletes a workload from a cluster by trying Deployment, StatefulSet,
// and DaemonSet in order. Returns nil if the resource was deleted or not found.
func (m *MultiClusterClient) DeleteWorkload(ctx context.Context, cluster, namespace, name string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return fmt.Errorf("failed to get dynamic client for %s: %w", cluster, err)
	}

	gvrs := []struct {
		gvr  schema.GroupVersionResource
		kind string
	}{
		{gvrDeployments, "Deployment"},
		{gvrStatefulSets, "StatefulSet"},
		{gvrDaemonSets, "DaemonSet"},
	}

	deletePolicy := metav1.DeletePropagationForeground
	deleteOpts := metav1.DeleteOptions{PropagationPolicy: &deletePolicy}

	for _, g := range gvrs {
		_, getErr := dynamicClient.Resource(g.gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if getErr != nil {
			if apierrors.IsNotFound(getErr) {
				continue // not this kind, try next
			}
			return fmt.Errorf("failed to check %s %s/%s on cluster %s: %w", g.kind, namespace, name, cluster, getErr)
		}

		// Found the resource — delete it
		if err := dynamicClient.Resource(g.gvr).Namespace(namespace).Delete(ctx, name, deleteOpts); err != nil {
			if apierrors.IsNotFound(err) {
				return nil // deleted between Get and Delete — success
			}
			return fmt.Errorf("failed to delete %s %s/%s on cluster %s: %w", g.kind, namespace, name, cluster, err)
		}
		slog.Info("[delete] deleted workload", "kind", g.kind, "namespace", namespace, "name", name, "cluster", cluster)
		return nil
	}

	return fmt.Errorf("workload %s/%s not found in cluster %s (tried Deployment, StatefulSet, DaemonSet)", namespace, name, cluster)
}

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

// LabelClusterNodes labels all nodes in a cluster with the given labels.
// Each node update uses retry-on-conflict to handle transient ResourceVersion
// mismatches. Errors are collected per-node so that one failure does not
// prevent labeling the remaining nodes (#10256).
func (m *MultiClusterClient) LabelClusterNodes(ctx context.Context, cluster string, labels map[string]string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return err
	}

	nodeList, err := dynamicClient.Resource(gvrNodes).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes in %s: %w", cluster, err)
	}

	var errs []error
	for _, node := range nodeList.Items {
		nodeName := node.GetName()
		retryErr := retry.RetryOnConflict(retry.DefaultRetry, func() error {
			// Re-fetch the node to get the latest ResourceVersion.
			fresh, getErr := dynamicClient.Resource(gvrNodes).Get(ctx, nodeName, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("failed to get node %s in %s: %w", nodeName, cluster, getErr)
			}
			existing := fresh.GetLabels()
			if existing == nil {
				existing = make(map[string]string)
			}
			for k, v := range labels {
				existing[k] = v
			}
			fresh.SetLabels(existing)
			_, updateErr := dynamicClient.Resource(gvrNodes).Update(ctx, fresh, metav1.UpdateOptions{})
			return updateErr
		})
		if retryErr != nil {
			slog.Error("[LabelClusterNodes] failed to label node after retries",
				"node", nodeName, "cluster", cluster, "error", retryErr)
			errs = append(errs, fmt.Errorf("node %s: %w", nodeName, retryErr))
		}
	}
	return errors.Join(errs...)
}

// RemoveClusterNodeLabels removes specified labels from all nodes in a cluster.
// Each node update uses retry-on-conflict to handle transient ResourceVersion
// mismatches. Errors are collected per-node so that one failure does not
// prevent updating the remaining nodes (#10256).
func (m *MultiClusterClient) RemoveClusterNodeLabels(ctx context.Context, cluster string, labelKeys []string) error {
	dynamicClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return err
	}

	nodeList, err := dynamicClient.Resource(gvrNodes).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list nodes in %s: %w", cluster, err)
	}

	var errs []error
	for _, node := range nodeList.Items {
		nodeName := node.GetName()
		retryErr := retry.RetryOnConflict(retry.DefaultRetry, func() error {
			// Re-fetch the node to get the latest ResourceVersion.
			fresh, getErr := dynamicClient.Resource(gvrNodes).Get(ctx, nodeName, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("failed to get node %s in %s: %w", nodeName, cluster, getErr)
			}
			existing := fresh.GetLabels()
			if existing == nil {
				return nil // no labels to remove
			}
			changed := false
			for _, k := range labelKeys {
				if _, ok := existing[k]; ok {
					delete(existing, k)
					changed = true
				}
			}
			if !changed {
				return nil // nothing to update
			}
			fresh.SetLabels(existing)
			_, updateErr := dynamicClient.Resource(gvrNodes).Update(ctx, fresh, metav1.UpdateOptions{})
			return updateErr
		})
		if retryErr != nil {
			slog.Error("[RemoveClusterNodeLabels] failed to update node after retries",
				"node", nodeName, "cluster", cluster, "error", retryErr)
			errs = append(errs, fmt.Errorf("node %s: %w", nodeName, retryErr))
		}
	}
	return errors.Join(errs...)
}

// ListBindingPolicies lists binding policies (placeholder)
func (m *MultiClusterClient) ListBindingPolicies(ctx context.Context) (*v1alpha1.BindingPolicyList, error) {
	// Placeholder - would list actual KubeStellar BindingPolicies
	return &v1alpha1.BindingPolicyList{
		Items:      []v1alpha1.BindingPolicy{},
		TotalCount: 0,
	}, nil
}
