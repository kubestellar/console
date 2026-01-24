package k8s

import (
	"context"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
)

// KubeStellar-related GVRs
var (
	bindingPolicyGVR = schema.GroupVersionResource{
		Group:    "control.kubestellar.io",
		Version:  "v1alpha1",
		Resource: "bindingpolicies",
	}

	// WECs (Workload Execution Clusters) in KubeStellar are represented via SyncTargets
	syncTargetGVR = schema.GroupVersionResource{
		Group:    "workload.kcp.io",
		Version:  "v1alpha1",
		Resource: "synctargets",
	}

	// Alternative: Using Location objects from KubeStellar
	locationGVR = schema.GroupVersionResource{
		Group:    "scheduling.kcp.io",
		Version:  "v1alpha1",
		Resource: "locations",
	}
)

// KubeStellar controller deployments to check
var kubeStellarControllers = []string{
	"kubestellar-controller-manager",
	"ks-controller-manager",
	"transport-controller",
	"placement-translator",
}

// KubeStellar namespaces to check
var kubeStellarNamespaces = []string{
	"kubestellar-system",
	"ks-system",
	"kubestellar",
}

// IsControlCluster checks if the given cluster is a KubeStellar control cluster
func (m *MultiClusterClient) IsControlCluster(ctx context.Context, contextName string) (bool, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return false, err
	}

	// Check for BindingPolicy CRD (indicates KubeStellar control plane)
	_, err = dynamicClient.Resource(bindingPolicyGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err == nil {
		return true, nil
	}

	// Check for KubeStellar controller deployments
	client, err := m.GetClient(contextName)
	if err != nil {
		return false, nil
	}

	for _, ns := range kubeStellarNamespaces {
		for _, controller := range kubeStellarControllers {
			_, err := client.AppsV1().Deployments(ns).Get(ctx, controller, metav1.GetOptions{})
			if err == nil {
				return true, nil
			}
		}
	}

	return false, nil
}

// GetControlClusterInfo returns detailed information about the control cluster
func (m *MultiClusterClient) GetControlClusterInfo(ctx context.Context, contextName string) (*v1alpha1.ControlClusterInfo, error) {
	info := &v1alpha1.ControlClusterInfo{
		Name:             contextName,
		IsControlCluster: false,
		ControllerStatus: make(map[string]v1alpha1.ControllerState),
		LastUpdated:      time.Now(),
	}

	isControl, err := m.IsControlCluster(ctx, contextName)
	if err != nil {
		return info, err
	}
	info.IsControlCluster = isControl

	if !isControl {
		return info, nil
	}

	client, err := m.GetClient(contextName)
	if err != nil {
		return info, nil
	}

	// Get controller status
	for _, ns := range kubeStellarNamespaces {
		deployments, err := client.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}

		for _, deploy := range deployments.Items {
			// Check if this is a KubeStellar controller
			isKsController := false
			for _, controller := range kubeStellarControllers {
				if strings.Contains(deploy.Name, controller) || strings.HasPrefix(deploy.Name, "ks-") {
					isKsController = true
					break
				}
			}

			if isKsController {
				state := v1alpha1.ControllerState{
					Ready:     deploy.Status.ReadyReplicas > 0,
					Replicas:  int(deploy.Status.Replicas),
					Available: int(deploy.Status.AvailableReplicas),
					LastSeen:  time.Now(),
				}
				if deploy.Status.ReadyReplicas < deploy.Status.Replicas {
					state.Message = "Not all replicas ready"
				}
				info.ControllerStatus[deploy.Name] = state
			}
		}
	}

	// Count BindingPolicies
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err == nil {
		bindings, err := dynamicClient.Resource(bindingPolicyGVR).List(ctx, metav1.ListOptions{})
		if err == nil {
			info.TotalBindings = len(bindings.Items)
		}
	}

	// Get managed cluster count (via SyncTargets or Locations)
	info.ManagedClusters = m.countManagedClustersWithClient(ctx, dynamicClient)

	return info, nil
}

// countManagedClustersWithClient attempts to count managed clusters via various KubeStellar/kcp resources
func (m *MultiClusterClient) countManagedClustersWithClient(ctx context.Context, dynamicClient dynamic.Interface) int {
	// Try SyncTargets
	list, err := dynamicClient.Resource(syncTargetGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(list.Items) > 0 {
		return len(list.Items)
	}

	// Try Locations
	list, err = dynamicClient.Resource(locationGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(list.Items) > 0 {
		return len(list.Items)
	}

	return 0
}

// ListRegisteredClusters lists all clusters registered with KubeStellar
func (m *MultiClusterClient) ListRegisteredClusters(ctx context.Context) (*v1alpha1.ClusterRegistrationList, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	var mu sync.Mutex
	registrations := make([]v1alpha1.ClusterRegistration, 0)

	for _, clusterName := range clusters {
		wg.Add(1)
		go func(c string) {
			defer wg.Done()

			reg := v1alpha1.ClusterRegistration{
				Name:         c,
				ClusterType:  v1alpha1.ClusterTypeUnknown,
				Status:       v1alpha1.ClusterRegistrationStatusUnknown,
				RegisteredAt: time.Now(),
			}

			// Check if it's a control cluster
			isControl, _ := m.IsControlCluster(ctx, c)
			if isControl {
				reg.ClusterType = v1alpha1.ClusterTypeControl
			} else {
				reg.ClusterType = v1alpha1.ClusterTypeWorkload
			}

			// Get cluster info
			client, err := m.GetClient(c)
			if err != nil {
				reg.Status = v1alpha1.ClusterRegistrationStatusOffline
			} else {
				// Check connectivity via server version
				version, err := client.Discovery().ServerVersion()
				if err != nil {
					reg.Status = v1alpha1.ClusterRegistrationStatusOffline
				} else {
					reg.Status = v1alpha1.ClusterRegistrationStatusReady
					reg.KubernetesVersion = version.GitVersion
					reg.LastHeartbeat = time.Now()
				}

				// Get node info for platform detection
				nodes, err := m.GetNodes(ctx, c)
				if err == nil && len(nodes) > 0 {
					// Try to detect platform from labels
					for _, node := range nodes {
						if provider, ok := node.Labels["node.kubernetes.io/instance-type"]; ok {
							if strings.Contains(provider, "eks") || strings.Contains(strings.ToLower(node.Labels["kubernetes.io/os"]), "eks") {
								reg.Platform = "EKS"
								break
							}
						}
						if _, ok := node.Labels["cloud.google.com/gke-nodepool"]; ok {
							reg.Platform = "GKE"
							break
						}
						if _, ok := node.Labels["kubernetes.azure.com/cluster"]; ok {
							reg.Platform = "AKS"
							break
						}
						if _, ok := node.Labels["node.openshift.io/os_id"]; ok {
							reg.Platform = "OpenShift"
							break
						}
					}

					// Try to detect region
					if reg.Region == "" {
						if region, ok := nodes[0].Labels["topology.kubernetes.io/region"]; ok {
							reg.Region = region
						} else if region, ok := nodes[0].Labels["failure-domain.beta.kubernetes.io/region"]; ok {
							reg.Region = region
						}
					}
				}
			}

			mu.Lock()
			registrations = append(registrations, reg)
			mu.Unlock()
		}(clusterName)
	}

	wg.Wait()

	return &v1alpha1.ClusterRegistrationList{
		Items:      registrations,
		TotalCount: len(registrations),
	}, nil
}

// GetPropagationStatus gets propagation status for workloads (placeholder)
func (m *MultiClusterClient) GetPropagationStatus(ctx context.Context, namespace, workloadName string) (*v1alpha1.PropagationStatus, error) {
	// This would query BindingPolicies and their status to determine propagation
	// For now, return a placeholder
	return &v1alpha1.PropagationStatus{
		WorkloadName:   workloadName,
		Namespace:      namespace,
		TotalTargets:   0,
		SyncedTargets:  0,
		LastUpdated:    time.Now(),
	}, nil
}

// DetectControlCluster finds which cluster is the control cluster
func (m *MultiClusterClient) DetectControlCluster(ctx context.Context) (string, error) {
	m.mu.RLock()
	clusters := make([]string, 0, len(m.clients))
	for name := range m.clients {
		clusters = append(clusters, name)
	}
	m.mu.RUnlock()

	for _, cluster := range clusters {
		isControl, err := m.IsControlCluster(ctx, cluster)
		if err != nil {
			continue
		}
		if isControl {
			return cluster, nil
		}
	}

	return "", nil
}
