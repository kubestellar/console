package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (m *MultiClusterClient) GetPods(ctx context.Context, contextName, namespace string) ([]PodInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PodInfo
	for _, pod := range pods.Items {
		ready := 0
		total := len(pod.Spec.Containers)
		restarts := 0

		// Build container status map
		statusMap := make(map[string]corev1.ContainerStatus)
		for _, cs := range pod.Status.ContainerStatuses {
			statusMap[cs.Name] = cs
			if cs.Ready {
				ready++
			}
			restarts += int(cs.RestartCount)
		}

		// Build container info
		var containers []ContainerInfo
		for _, c := range pod.Spec.Containers {
			ci := ContainerInfo{
				Name:  c.Name,
				Image: c.Image,
			}
			if cs, ok := statusMap[c.Name]; ok {
				ci.Ready = cs.Ready
				if cs.State.Running != nil {
					ci.State = "running"
				} else if cs.State.Waiting != nil {
					ci.State = "waiting"
					ci.Reason = cs.State.Waiting.Reason
					ci.Message = cs.State.Waiting.Message
				} else if cs.State.Terminated != nil {
					ci.State = "terminated"
					ci.Reason = cs.State.Terminated.Reason
					ci.Message = cs.State.Terminated.Message
				}
			}
			// Check for GPU / accelerator resource requests using the shared
			// SumGPURequested helper (pkg/k8s/gpu_resources.go). Sums across ALL
			// known GPU resource names so containers requesting more than one
			// accelerator type (e.g., nvidia.com/gpu=1 + habana.ai/gaudi=2) are
			// counted correctly. Previously each matching name overwrote the
			// previous, so the final value depended on map iteration order
			// (flagged on PR Issue 9204 follow-up review).
			ci.GPURequested = SumGPURequested(c.Resources.Requests)
			if ci.GPURequested == 0 {
				ci.GPURequested = SumGPURequested(c.Resources.Limits)
			}
			containers = append(containers, ci)
		}

		result = append(result, PodInfo{
			Name:        pod.Name,
			Namespace:   pod.Namespace,
			Cluster:     contextName,
			Status:      string(pod.Status.Phase),
			Ready:       fmt.Sprintf("%d/%d", ready, total),
			Restarts:    restarts,
			Age:         formatDuration(time.Since(pod.CreationTimestamp.Time)),
			Node:        pod.Spec.NodeName,
			Labels:      pod.Labels,
			Annotations: pod.Annotations,
			Containers:  containers,
		})
	}

	return result, nil
}

// FindPodIssues returns pods with issues
func (m *MultiClusterClient) FindPodIssues(ctx context.Context, contextName, namespace string) ([]PodIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Waiting reasons that indicate a problem
	problemWaitingReasons := map[string]bool{
		"CrashLoopBackOff":           true,
		"ImagePullBackOff":           true,
		"ErrImagePull":               true,
		"CreateContainerConfigError": true,
		"InvalidImageName":           true,
		"CreateContainerError":       true,
		"RunContainerError":          true,
		"PostStartHookError":         true,
	}

	now := time.Now()

	var issues []PodIssue
	for _, pod := range pods.Items {
		// Skip completed/succeeded pods (e.g. finished Jobs)
		if pod.Status.Phase == corev1.PodSucceeded {
			continue
		}

		var podIssues []string
		restarts := 0

		// Determine effective status (mirrors kubectl logic)
		effectiveStatus := string(pod.Status.Phase)

		// Check init container statuses
		for i, cs := range pod.Status.InitContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				if problemWaitingReasons[cs.State.Waiting.Reason] {
					podIssues = append(podIssues, fmt.Sprintf("Init:%s", cs.State.Waiting.Reason))
					effectiveStatus = fmt.Sprintf("Init:%s", cs.State.Waiting.Reason)
				}
			}
			if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
				podIssues = append(podIssues, fmt.Sprintf("Init container %d failed (exit %d)", i, cs.State.Terminated.ExitCode))
			}
			if cs.LastTerminationState.Terminated != nil && cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
				podIssues = append(podIssues, "Init:OOMKilled")
			}
		}

		// Check container statuses
		for _, cs := range pod.Status.ContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				reason := cs.State.Waiting.Reason
				if problemWaitingReasons[reason] {
					podIssues = append(podIssues, reason)
					effectiveStatus = reason
				}
			}

			if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
				podIssues = append(podIssues, fmt.Sprintf("Exit code %d", cs.State.Terminated.ExitCode))
				if cs.State.Terminated.Reason != "" {
					effectiveStatus = cs.State.Terminated.Reason
				}
			}

			if cs.LastTerminationState.Terminated != nil {
				if cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
					podIssues = append(podIssues, "OOMKilled")
				}
			}

			// Container running but not ready for over 5 minutes
			if cs.State.Running != nil && !cs.Ready {
				age := now.Sub(cs.State.Running.StartedAt.Time)
				if age > podIssueAgeThreshold {
					podIssues = append(podIssues, "Not ready")
				}
			}

			if cs.RestartCount > 5 {
				podIssues = append(podIssues, fmt.Sprintf("High restarts (%d)", cs.RestartCount))
			}
		}

		// Check pod conditions for scheduling failures
		for _, cond := range pod.Status.Conditions {
			if cond.Type == corev1.PodScheduled && cond.Status == corev1.ConditionFalse {
				msg := cond.Reason
				if cond.Message != "" {
					msg = cond.Message
				}
				podIssues = append(podIssues, fmt.Sprintf("Unschedulable: %s", msg))
				effectiveStatus = "Unschedulable"
			}
		}

		// Check pod phase
		if pod.Status.Phase == corev1.PodPending {
			// Only add "Pending" if no more specific issue was found
			if len(podIssues) == 0 {
				// Pending for over 2 minutes is suspicious
				if pod.CreationTimestamp.Time.Before(now.Add(-podPendingAgeThreshold)) {
					podIssues = append(podIssues, "Pending")
				}
			}
		}
		if pod.Status.Phase == corev1.PodFailed {
			reason := "Failed"
			if pod.Status.Reason != "" {
				reason = pod.Status.Reason
			}
			podIssues = append(podIssues, reason)
			effectiveStatus = reason
		}

		// Stuck terminating (has deletion timestamp but still exists)
		if pod.DeletionTimestamp != nil {
			age := now.Sub(pod.DeletionTimestamp.Time)
			if age > podIssueAgeThreshold {
				podIssues = append(podIssues, fmt.Sprintf("Stuck terminating (%dm)", int(age.Minutes())))
				effectiveStatus = "Terminating"
			}
		}

		if len(podIssues) > 0 {
			issues = append(issues, PodIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Status:    effectiveStatus,
				Restarts:  restarts,
				Issues:    podIssues,
			})
		}
	}

	return issues, nil
}

// GetEvents returns events from a cluster
func (m *MultiClusterClient) GetEvents(ctx context.Context, contextName, namespace string, limit int, fieldSelectors ...string) ([]Event, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	listOpts := metav1.ListOptions{}
	if len(fieldSelectors) > 0 && fieldSelectors[0] != "" {
		listOpts.FieldSelector = fieldSelectors[0]
	}
	events, err := client.CoreV1().Events(namespace).List(ctx, listOpts)
	if err != nil {
		return nil, err
	}

	// Sort by effective event time descending (prefers modern EventTime,
	// falls back to LastTimestamp for older clusters). See issue #6042.
	sort.Slice(events.Items, func(i, j int) bool {
		return EffectiveEventTime(&events.Items[i]).After(EffectiveEventTime(&events.Items[j]))
	})

	var result []Event
	for i, event := range events.Items {
		if limit > 0 && i >= limit {
			break
		}
		evt := event
		lastSeen := EffectiveEventTime(&evt)
		e := Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
		}
		if !lastSeen.IsZero() {
			e.Age = formatDuration(time.Since(lastSeen))
			e.LastSeen = lastSeen.Format(time.RFC3339)
		}
		if !event.FirstTimestamp.IsZero() {
			e.FirstSeen = event.FirstTimestamp.Time.Format(time.RFC3339)
		}
		result = append(result, e)
	}

	return result, nil
}

// GetWarningEvents returns warning events from a cluster
func (m *MultiClusterClient) GetWarningEvents(ctx context.Context, contextName, namespace string, limit int) ([]Event, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	events, err := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})
	if err != nil {
		return nil, err
	}

	// Sort by effective event time descending (prefers modern EventTime,
	// falls back to LastTimestamp for older clusters). See issue #6042.
	sort.Slice(events.Items, func(i, j int) bool {
		return EffectiveEventTime(&events.Items[i]).After(EffectiveEventTime(&events.Items[j]))
	})

	var result []Event
	for i, event := range events.Items {
		if limit > 0 && i >= limit {
			break
		}
		evt := event
		lastSeen := EffectiveEventTime(&evt)
		e := Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
		}
		if !lastSeen.IsZero() {
			e.Age = formatDuration(time.Since(lastSeen))
			e.LastSeen = lastSeen.Format(time.RFC3339)
		}
		if !event.FirstTimestamp.IsZero() {
			e.FirstSeen = event.FirstTimestamp.Time.Format(time.RFC3339)
		}
		result = append(result, e)
	}

	return result, nil
}

// GetGPUNodes returns nodes with GPU resources

func (m *MultiClusterClient) GetNodes(ctx context.Context, contextName string) ([]NodeInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var nodeInfos []NodeInfo
	for _, node := range nodes.Items {
		info := NodeInfo{
			Name:           node.Name,
			Cluster:        contextName,
			KubeletVersion: node.Status.NodeInfo.KubeletVersion,
			OS:             node.Status.NodeInfo.OperatingSystem,
			OSImage:        node.Status.NodeInfo.OSImage,
			Architecture:   node.Status.NodeInfo.Architecture,
			Unschedulable:  node.Spec.Unschedulable,
		}

		// Get container runtime
		info.ContainerRuntime = node.Status.NodeInfo.ContainerRuntimeVersion

		// Get roles from labels
		for label := range node.Labels {
			if strings.HasPrefix(label, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(label, "node-role.kubernetes.io/")
				if role != "" {
					info.Roles = append(info.Roles, role)
				}
			}
		}
		if len(info.Roles) == 0 {
			info.Roles = []string{"worker"}
		}

		// Get IPs
		for _, addr := range node.Status.Addresses {
			switch addr.Type {
			case "InternalIP":
				info.InternalIP = addr.Address
			case "ExternalIP":
				info.ExternalIP = addr.Address
			}
		}

		// Get capacity
		if cpu, ok := node.Status.Capacity["cpu"]; ok {
			info.CPUCapacity = cpu.String()
		}
		if mem, ok := node.Status.Capacity["memory"]; ok {
			info.MemoryCapacity = mem.String()
		}
		if storage, ok := node.Status.Capacity["ephemeral-storage"]; ok {
			info.StorageCapacity = storage.String()
		}
		if pods, ok := node.Status.Capacity["pods"]; ok {
			info.PodCapacity = pods.String()
		}

		// Get GPU count from allocatable resources (nvidia, amd, intel)
		if gpu, ok := node.Status.Allocatable["nvidia.com/gpu"]; ok {
			info.GPUCount = int(gpu.Value())
			// Get GPU type from labels
			if gpuType, ok := node.Labels["nvidia.com/gpu.product"]; ok {
				info.GPUType = gpuType
			}
		} else if gpu, ok := node.Status.Allocatable["amd.com/gpu"]; ok {
			info.GPUCount = int(gpu.Value())
			info.GPUType = "AMD GPU"
		} else if gpu, ok := node.Status.Allocatable["gpu.intel.com/i915"]; ok {
			info.GPUCount = int(gpu.Value())
			info.GPUType = "Intel GPU"
		}

		// Get NIC/InfiniBand count from allocatable resources and labels
		// Check for Mellanox InfiniBand HCAs (common on HGX systems)
		for key, val := range node.Status.Allocatable {
			keyStr := string(key)
			if strings.HasPrefix(keyStr, "rdma/") || strings.Contains(keyStr, "hca") {
				info.InfiniBandCount += int(val.Value())
			}
			// NVIDIA ConnectX NICs
			if strings.Contains(keyStr, "mellanox") || strings.Contains(keyStr, "connectx") {
				info.NICCount += int(val.Value())
			}
		}
		// Fallback: count from NFD labels (feature.node.kubernetes.io/pci-15b3.present = Mellanox)
		if info.InfiniBandCount == 0 {
			for key := range node.Labels {
				if strings.Contains(key, "pci-15b3") || strings.Contains(key, "infiniband") {
					info.InfiniBandCount = 1 // At least one present
					break
				}
			}
		}

		// Get NVME count from NFD labels or allocatable resources
		for key := range node.Labels {
			if strings.Contains(key, "nvme") && strings.Contains(key, "present") {
				info.NVMECount = 1 // NFD marks presence, count from capacity if available
				break
			}
		}
		// Check allocatable for explicit NVME count (some device plugins expose this)
		for key, val := range node.Status.Allocatable {
			keyStr := string(key)
			if strings.Contains(keyStr, "nvme") {
				info.NVMECount = int(val.Value())
				break
			}
		}

		// Get conditions
		info.Status = "Unknown"
		for _, cond := range node.Status.Conditions {
			info.Conditions = append(info.Conditions, NodeCondition{
				Type:    string(cond.Type),
				Status:  string(cond.Status),
				Reason:  cond.Reason,
				Message: cond.Message,
			})
			if cond.Type == "Ready" {
				if cond.Status == "True" {
					info.Status = "Ready"
				} else {
					info.Status = "NotReady"
				}
			}
		}

		// Get labels (filter out some verbose ones, but keep topology labels for region detection)
		info.Labels = make(map[string]string)
		for k, v := range node.Labels {
			// Always include topology labels needed for region/zone detection
			if strings.HasPrefix(k, "topology.kubernetes.io/") ||
				strings.HasPrefix(k, "failure-domain.beta.kubernetes.io/") ||
				strings.Contains(k, "region") ||
				strings.Contains(k, "zone") {
				info.Labels[k] = v
				continue
			}
			// Skip very long or system labels
			if !strings.HasPrefix(k, "node.kubernetes.io/") &&
				!strings.HasPrefix(k, "kubernetes.io/") &&
				!strings.HasPrefix(k, "beta.kubernetes.io/") &&
				len(v) < 100 {
				info.Labels[k] = v
			}
		}

		// Get taints
		for _, taint := range node.Spec.Taints {
			taintStr := fmt.Sprintf("%s=%s:%s", taint.Key, taint.Value, taint.Effect)
			info.Taints = append(info.Taints, taintStr)
		}

		// Calculate age
		age := time.Since(node.CreationTimestamp.Time)
		if age.Hours() >= 24*365 {
			info.Age = fmt.Sprintf("%.0fy", age.Hours()/(24*365))
		} else if age.Hours() >= 24 {
			info.Age = fmt.Sprintf("%.0fd", age.Hours()/24)
		} else if age.Hours() >= 1 {
			info.Age = fmt.Sprintf("%.0fh", age.Hours())
		} else {
			info.Age = fmt.Sprintf("%.0fm", age.Minutes())
		}

		nodeInfos = append(nodeInfos, info)
	}

	return nodeInfos, nil
}

// GetFlatcarNodes returns information about nodes running Flatcar Container Linux
// in the given cluster. Detection is based on OSImage containing "flatcar"
// (case-insensitive).
func (m *MultiClusterClient) GetFlatcarNodes(ctx context.Context, contextName string) ([]FlatcarNodeInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []FlatcarNodeInfo
	for _, node := range nodes.Items {
		osImage := node.Status.NodeInfo.OSImage
		if strings.Contains(strings.ToLower(osImage), "flatcar") {
			result = append(result, FlatcarNodeInfo{
				NodeName:      node.Name,
				Cluster:       contextName,
				OSImage:       osImage,
				KernelVersion: node.Status.NodeInfo.KernelVersion,
			})
		}
	}
	return result, nil
}

// FindDeploymentIssues returns deployments with issues
func (m *MultiClusterClient) FindDeploymentIssues(ctx context.Context, contextName, namespace string) ([]DeploymentIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var issues []DeploymentIssue
	for _, deploy := range deployments.Items {
		// Check for issues
		var reason, message string

		// Kubernetes defaults Replicas to 1 when unset
		desiredReplicas := int32(1)
		if deploy.Spec.Replicas != nil {
			desiredReplicas = *deploy.Spec.Replicas
		}

		// Check if not all replicas are ready
		if deploy.Status.ReadyReplicas < desiredReplicas {
			// Check conditions for more details. Progressing=False
			// (ProgressDeadlineExceeded) is the more severe/specific condition
			// and must take precedence over Available=False regardless of slice
			// order (#4470). Use a two-pass scan: look for Progressing=False
			// first, then fall back to Available=False.
			for _, condition := range deploy.Status.Conditions {
				if condition.Type == appsv1.DeploymentProgressing && condition.Status == corev1.ConditionFalse {
					reason = "ProgressDeadlineExceeded"
					message = condition.Message
					break
				}
			}
			if reason == "" {
				for _, condition := range deploy.Status.Conditions {
					if condition.Type == appsv1.DeploymentAvailable && condition.Status == corev1.ConditionFalse {
						reason = "Unavailable"
						message = condition.Message
						break
					}
				}
			}

			// If we found no condition, use generic
			if reason == "" {
				reason = "Unavailable"
				message = fmt.Sprintf("%d/%d replicas ready", deploy.Status.ReadyReplicas, desiredReplicas)
			}

			issues = append(issues, DeploymentIssue{
				Name:          deploy.Name,
				Namespace:     deploy.Namespace,
				Cluster:       contextName,
				Replicas:      desiredReplicas,
				ReadyReplicas: deploy.Status.ReadyReplicas,
				Reason:        reason,
				Message:       message,
			})
		}
	}

	return issues, nil
}

// GetDeployments returns all deployments with rollout status
func (m *MultiClusterClient) GetDeployments(ctx context.Context, contextName, namespace string) ([]Deployment, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Deployment
	for _, deploy := range deployments.Items {
		// Kubernetes defaults Replicas to 1 when unset
		desired := int32(1)
		if deploy.Spec.Replicas != nil {
			desired = *deploy.Spec.Replicas
		}

		// Determine status
		status := "running"
		if deploy.Status.ReadyReplicas < desired {
			status = "deploying"
			// Only mark as failed when Progressing=False (ProgressDeadlineExceeded).
			// Available=False alone is a transient state during normal rolling updates
			// and should remain "deploying", not "failed", to avoid false positives
			// that contradict live drilldown data (#4470).
			for _, condition := range deploy.Status.Conditions {
				if condition.Type == appsv1.DeploymentProgressing && condition.Status == corev1.ConditionFalse {
					status = "failed"
					break
				}
			}
		}

		// Calculate progress — desired already set above
		progress := 100
		if desired > 0 {
			progress = int((float64(deploy.Status.ReadyReplicas) / float64(desired)) * 100)
		}

		// Get primary container image
		image := ""
		if len(deploy.Spec.Template.Spec.Containers) > 0 {
			image = deploy.Spec.Template.Spec.Containers[0].Image
		}

		// Calculate age
		age := ""
		if !deploy.CreationTimestamp.IsZero() {
			duration := time.Since(deploy.CreationTimestamp.Time)
			if duration.Hours() > 24 {
				age = fmt.Sprintf("%dd", int(duration.Hours()/24))
			} else if duration.Hours() > 1 {
				age = fmt.Sprintf("%dh", int(duration.Hours()))
			} else {
				age = fmt.Sprintf("%dm", int(duration.Minutes()))
			}
		}

		result = append(result, Deployment{
			Name:              deploy.Name,
			Namespace:         deploy.Namespace,
			Cluster:           contextName,
			Status:            status,
			Replicas:          desired,
			ReadyReplicas:     deploy.Status.ReadyReplicas,
			UpdatedReplicas:   deploy.Status.UpdatedReplicas,
			AvailableReplicas: deploy.Status.AvailableReplicas,
			Progress:          progress,
			Image:             image,
			Age:               age,
			Labels:            deploy.Labels,
			Annotations:       deploy.Annotations,
		})
	}

	return result, nil
}

// GetServices returns all services in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetServices(ctx context.Context, contextName, namespace string) ([]Service, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	services, err := client.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Fetch the corresponding core/v1 Endpoints objects so we can report the
	// real number of ready addresses backing each service. We list in the
	// same namespace scope as the Services list call so the result set is
	// comparable. If this call fails we still return services with
	// Endpoints=0 rather than failing the whole request (issue #6150), but
	// we log the error so operators can see RBAC / connectivity problems
	// instead of silently seeing every service report zero ready endpoints
	// (issue #9091).
	endpointReadyCounts := make(map[string]int) // key: "<namespace>/<name>"
	if epList, epErr := client.CoreV1().Endpoints(namespace).List(ctx, metav1.ListOptions{}); epErr == nil {
		for _, ep := range epList.Items {
			ready := 0
			for _, subset := range ep.Subsets {
				ready += len(subset.Addresses)
			}
			endpointReadyCounts[ep.Namespace+"/"+ep.Name] = ready
		}
	} else {
		slog.Error("[Services] failed to list endpoints for readiness counts",
			"cluster", contextName, "namespace", namespace, "error", epErr)
	}

	var result []Service
	for _, svc := range services.Items {
		// Build ports list. We populate both the legacy flat []string
		// form (existing consumers) and the structured PortDetails form
		// which preserves the port Name (issue #6163).
		var ports []string
		var portDetails []ServicePortDetail
		for _, p := range svc.Spec.Ports {
			portStr := fmt.Sprintf("%d/%s", p.Port, p.Protocol)
			if p.NodePort != 0 {
				portStr = fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol)
			}
			ports = append(ports, portStr)
			portDetails = append(portDetails, ServicePortDetail{
				Name:     p.Name,
				Port:     p.Port,
				Protocol: string(p.Protocol),
				NodePort: p.NodePort,
			})
		}

		// Resolve external IP and LoadBalancer provisioning status.
		// For LoadBalancer services, if status.loadBalancer.ingress is
		// empty we mark the service as Provisioning and leave ExternalIP
		// blank (issue #6153). status.loadBalancer.ingress.ip takes
		// precedence over hostname, and spec.externalIPs (statically
		// assigned) overrides both.
		externalIP := ""
		lbStatus := ""
		if len(svc.Status.LoadBalancer.Ingress) > 0 {
			if svc.Status.LoadBalancer.Ingress[0].IP != "" {
				externalIP = svc.Status.LoadBalancer.Ingress[0].IP
			} else if svc.Status.LoadBalancer.Ingress[0].Hostname != "" {
				externalIP = svc.Status.LoadBalancer.Ingress[0].Hostname
			}
		}
		if len(svc.Spec.ExternalIPs) > 0 {
			externalIP = svc.Spec.ExternalIPs[0]
		}
		if svc.Spec.Type == corev1.ServiceTypeLoadBalancer {
			if externalIP == "" {
				lbStatus = LBStatusProvisioning
			} else {
				lbStatus = LBStatusReady
			}
		}

		// Calculate age
		age := formatAge(svc.CreationTimestamp.Time)

		result = append(result, Service{
			Name:        svc.Name,
			Namespace:   svc.Namespace,
			Cluster:     contextName,
			Type:        string(svc.Spec.Type),
			ClusterIP:   svc.Spec.ClusterIP,
			ExternalIP:  externalIP,
			Ports:       ports,
			PortDetails: portDetails,
			Endpoints:   endpointReadyCounts[svc.Namespace+"/"+svc.Name],
			LBStatus:    lbStatus,
			Selector:    svc.Spec.Selector,
			Age:         age,
			Labels:      svc.Labels,
			Annotations: svc.Annotations,
		})
	}

	return result, nil
}

// GetJobs returns all jobs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetJobs(ctx context.Context, contextName, namespace string) ([]Job, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	jobs, err := client.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Job
	for _, job := range jobs.Items {
		// Determine status
		status := "Running"
		if job.Status.Succeeded > 0 {
			status = "Complete"
		} else if job.Status.Failed > 0 {
			status = "Failed"
		}

		// Completions
		completions := "0/1"
		if job.Spec.Completions != nil {
			completions = fmt.Sprintf("%d/%d", job.Status.Succeeded, *job.Spec.Completions)
		}

		// Duration
		duration := ""
		if job.Status.StartTime != nil {
			endTime := time.Now()
			if job.Status.CompletionTime != nil {
				endTime = job.Status.CompletionTime.Time
			}
			dur := endTime.Sub(job.Status.StartTime.Time)
			if dur.Hours() > 1 {
				duration = fmt.Sprintf("%dh%dm", int(dur.Hours()), int(dur.Minutes())%60)
			} else if dur.Minutes() > 1 {
				duration = fmt.Sprintf("%dm%ds", int(dur.Minutes()), int(dur.Seconds())%60)
			} else {
				duration = fmt.Sprintf("%ds", int(dur.Seconds()))
			}
		}

		// Calculate age
		age := formatAge(job.CreationTimestamp.Time)

		result = append(result, Job{
			Name:        job.Name,
			Namespace:   job.Namespace,
			Cluster:     contextName,
			Status:      status,
			Completions: completions,
			Duration:    duration,
			Age:         age,
			Labels:      job.Labels,
			Annotations: job.Annotations,
		})
	}

	return result, nil
}

// GetHPAs returns all HPAs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetHPAs(ctx context.Context, contextName, namespace string) ([]HPA, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	hpas, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []HPA
	for _, hpa := range hpas.Items {
		// Get target reference
		reference := fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name)

		// Get min/max replicas
		minReplicas := int32(1)
		if hpa.Spec.MinReplicas != nil {
			minReplicas = *hpa.Spec.MinReplicas
		}

		// Get target/current CPU
		targetCPU := ""
		currentCPU := ""
		for _, metric := range hpa.Spec.Metrics {
			if metric.Type == "Resource" && metric.Resource != nil && metric.Resource.Name == "cpu" {
				if metric.Resource.Target.AverageUtilization != nil {
					targetCPU = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
				}
			}
		}
		for _, condition := range hpa.Status.CurrentMetrics {
			if condition.Type == "Resource" && condition.Resource != nil && condition.Resource.Name == "cpu" {
				if condition.Resource.Current.AverageUtilization != nil {
					currentCPU = fmt.Sprintf("%d%%", *condition.Resource.Current.AverageUtilization)
				}
			}
		}

		// Calculate age
		age := formatAge(hpa.CreationTimestamp.Time)

		result = append(result, HPA{
			Name:            hpa.Name,
			Namespace:       hpa.Namespace,
			Cluster:         contextName,
			Reference:       reference,
			MinReplicas:     minReplicas,
			MaxReplicas:     hpa.Spec.MaxReplicas,
			CurrentReplicas: hpa.Status.CurrentReplicas,
			TargetCPU:       targetCPU,
			CurrentCPU:      currentCPU,
			Age:             age,
			Labels:          hpa.Labels,
			Annotations:     hpa.Annotations,
		})
	}

	return result, nil
}

// GetConfigMaps returns all ConfigMaps in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetConfigMaps(ctx context.Context, contextName, namespace string) ([]ConfigMap, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	configmaps, err := client.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ConfigMap
	for _, cm := range configmaps.Items {
		// Calculate age
		age := formatAge(cm.CreationTimestamp.Time)

		result = append(result, ConfigMap{
			Name:        cm.Name,
			Namespace:   cm.Namespace,
			Cluster:     contextName,
			DataCount:   len(cm.Data) + len(cm.BinaryData),
			Age:         age,
			Labels:      cm.Labels,
			Annotations: cm.Annotations,
		})
	}

	return result, nil
}

// GetSecrets returns all Secrets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetSecrets(ctx context.Context, contextName, namespace string) ([]Secret, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	secrets, err := client.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Secret
	for _, secret := range secrets.Items {
		// Calculate age
		age := formatAge(secret.CreationTimestamp.Time)

		result = append(result, Secret{
			Name:        secret.Name,
			Namespace:   secret.Namespace,
			Cluster:     contextName,
			Type:        string(secret.Type),
			DataCount:   len(secret.Data),
			Age:         age,
			Labels:      secret.Labels,
			Annotations: secret.Annotations,
		})
	}

	return result, nil
}

// GetServiceAccounts returns ServiceAccounts from a cluster
func (m *MultiClusterClient) GetServiceAccounts(ctx context.Context, contextName, namespace string) ([]ServiceAccount, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	serviceAccounts, err := client.CoreV1().ServiceAccounts(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ServiceAccount
	for _, sa := range serviceAccounts.Items {
		// Calculate age
		age := formatAge(sa.CreationTimestamp.Time)

		// Get secret names
		var secrets []string
		for _, s := range sa.Secrets {
			secrets = append(secrets, s.Name)
		}

		// Get image pull secret names
		var imagePullSecrets []string
		for _, s := range sa.ImagePullSecrets {
			imagePullSecrets = append(imagePullSecrets, s.Name)
		}

		result = append(result, ServiceAccount{
			Name:             sa.Name,
			Namespace:        sa.Namespace,
			Cluster:          contextName,
			Secrets:          secrets,
			ImagePullSecrets: imagePullSecrets,
			Age:              age,
			Labels:           sa.Labels,
			Annotations:      sa.Annotations,
		})
	}

	return result, nil
}

// GetPVCs returns all PersistentVolumeClaims in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetPVCs(ctx context.Context, contextName, namespace string) ([]PVC, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pvcs, err := client.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PVC
	for _, pvc := range pvcs.Items {
		age := formatAge(pvc.CreationTimestamp.Time)

		// Get capacity
		var capacity string
		if pvc.Status.Capacity != nil {
			if storage, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
				capacity = storage.String()
			}
		}

		// Get access modes
		var accessModes []string
		for _, mode := range pvc.Spec.AccessModes {
			accessModes = append(accessModes, string(mode))
		}

		// Get storage class
		storageClass := ""
		if pvc.Spec.StorageClassName != nil {
			storageClass = *pvc.Spec.StorageClassName
		}

		result = append(result, PVC{
			Name:         pvc.Name,
			Namespace:    pvc.Namespace,
			Cluster:      contextName,
			Status:       string(pvc.Status.Phase),
			Capacity:     capacity,
			StorageClass: storageClass,
			VolumeName:   pvc.Spec.VolumeName,
			AccessModes:  accessModes,
			Age:          age,
			Labels:       pvc.Labels,
		})
	}

	return result, nil
}

// GetPVs returns all PersistentVolumes
func (m *MultiClusterClient) GetPVs(ctx context.Context, contextName string) ([]PV, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pvs, err := client.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PV
	for _, pv := range pvs.Items {
		age := formatAge(pv.CreationTimestamp.Time)

		// Get capacity
		var capacity string
		if pv.Spec.Capacity != nil {
			if storage, ok := pv.Spec.Capacity[corev1.ResourceStorage]; ok {
				capacity = storage.String()
			}
		}

		// Get access modes
		var accessModes []string
		for _, mode := range pv.Spec.AccessModes {
			accessModes = append(accessModes, string(mode))
		}

		// Get claim reference
		claimRef := ""
		if pv.Spec.ClaimRef != nil {
			claimRef = pv.Spec.ClaimRef.Namespace + "/" + pv.Spec.ClaimRef.Name
		}

		// Get volume mode
		volumeMode := ""
		if pv.Spec.VolumeMode != nil {
			volumeMode = string(*pv.Spec.VolumeMode)
		}

		result = append(result, PV{
			Name:          pv.Name,
			Cluster:       contextName,
			Status:        string(pv.Status.Phase),
			Capacity:      capacity,
			StorageClass:  pv.Spec.StorageClassName,
			ReclaimPolicy: string(pv.Spec.PersistentVolumeReclaimPolicy),
			AccessModes:   accessModes,
			ClaimRef:      claimRef,
			VolumeMode:    volumeMode,
			Age:           age,
			Labels:        pv.Labels,
		})
	}

	return result, nil
}

// GetReplicaSets returns all ReplicaSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetReplicaSets(ctx context.Context, contextName, namespace string) ([]ReplicaSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	rsList, err := client.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ReplicaSet
	for _, rs := range rsList.Items {
		replicas := int32(0)
		if rs.Spec.Replicas != nil {
			replicas = *rs.Spec.Replicas
		}
		ownerName, ownerKind := "", ""
		if len(rs.OwnerReferences) > 0 {
			ownerName = rs.OwnerReferences[0].Name
			ownerKind = rs.OwnerReferences[0].Kind
		}
		result = append(result, ReplicaSet{
			Name:          rs.Name,
			Namespace:     rs.Namespace,
			Cluster:       contextName,
			Replicas:      replicas,
			ReadyReplicas: rs.Status.ReadyReplicas,
			OwnerName:     ownerName,
			OwnerKind:     ownerKind,
			Age:           formatAge(rs.CreationTimestamp.Time),
			Labels:        rs.Labels,
		})
	}

	return result, nil
}

// GetStatefulSets returns all StatefulSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetStatefulSets(ctx context.Context, contextName, namespace string) ([]StatefulSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ssList, err := client.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []StatefulSet
	for _, ss := range ssList.Items {
		replicas := int32(0)
		if ss.Spec.Replicas != nil {
			replicas = *ss.Spec.Replicas
		}
		status := "running"
		if ss.Status.ReadyReplicas < replicas {
			status = "deploying"
		}
		if replicas > 0 && ss.Status.ReadyReplicas == 0 {
			status = "failed"
		}
		image := ""
		if len(ss.Spec.Template.Spec.Containers) > 0 {
			image = ss.Spec.Template.Spec.Containers[0].Image
		}
		result = append(result, StatefulSet{
			Name:          ss.Name,
			Namespace:     ss.Namespace,
			Cluster:       contextName,
			Replicas:      replicas,
			ReadyReplicas: ss.Status.ReadyReplicas,
			Status:        status,
			Image:         image,
			Age:           formatAge(ss.CreationTimestamp.Time),
			Labels:        ss.Labels,
		})
	}

	return result, nil
}

// GetDaemonSets returns all DaemonSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetDaemonSets(ctx context.Context, contextName, namespace string) ([]DaemonSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	dsList, err := client.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []DaemonSet
	for _, ds := range dsList.Items {
		status := "running"
		if ds.Status.NumberReady < ds.Status.DesiredNumberScheduled {
			status = "degraded"
		}
		if ds.Status.DesiredNumberScheduled > 0 && ds.Status.NumberReady == 0 {
			status = "failed"
		}
		result = append(result, DaemonSet{
			Name:             ds.Name,
			Namespace:        ds.Namespace,
			Cluster:          contextName,
			DesiredScheduled: ds.Status.DesiredNumberScheduled,
			CurrentScheduled: ds.Status.CurrentNumberScheduled,
			Ready:            ds.Status.NumberReady,
			Status:           status,
			Age:              formatAge(ds.CreationTimestamp.Time),
			Labels:           ds.Labels,
		})
	}

	return result, nil
}

// GetCronJobs returns all CronJobs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetCronJobs(ctx context.Context, contextName, namespace string) ([]CronJob, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	cronList, err := client.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []CronJob
	for _, cj := range cronList.Items {
		lastSchedule := ""
		if cj.Status.LastScheduleTime != nil {
			lastSchedule = formatAge(cj.Status.LastScheduleTime.Time) + " ago"
		}
		suspend := false
		if cj.Spec.Suspend != nil {
			suspend = *cj.Spec.Suspend
		}
		result = append(result, CronJob{
			Name:         cj.Name,
			Namespace:    cj.Namespace,
			Cluster:      contextName,
			Schedule:     cj.Spec.Schedule,
			Suspend:      suspend,
			Active:       len(cj.Status.Active),
			LastSchedule: lastSchedule,
			Age:          formatAge(cj.CreationTimestamp.Time),
			Labels:       cj.Labels,
		})
	}

	return result, nil
}

// GetIngresses returns all Ingresses in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetIngresses(ctx context.Context, contextName, namespace string) ([]Ingress, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ingList, err := client.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Ingress
	for _, ing := range ingList.Items {
		var hosts []string
		for _, rule := range ing.Spec.Rules {
			if rule.Host != "" {
				hosts = append(hosts, rule.Host)
			}
		}
		var address string
		if len(ing.Status.LoadBalancer.Ingress) > 0 {
			lb := ing.Status.LoadBalancer.Ingress[0]
			if lb.Hostname != "" {
				address = lb.Hostname
			} else if lb.IP != "" {
				address = lb.IP
			}
		}
		ingressClass := ""
		if ing.Spec.IngressClassName != nil {
			ingressClass = *ing.Spec.IngressClassName
		}
		result = append(result, Ingress{
			Name:      ing.Name,
			Namespace: ing.Namespace,
			Cluster:   contextName,
			Class:     ingressClass,
			Hosts:     hosts,
			Address:   address,
			Age:       formatAge(ing.CreationTimestamp.Time),
			Labels:    ing.Labels,
		})
	}

	return result, nil
}

// GetNetworkPolicies returns all NetworkPolicies in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetNetworkPolicies(ctx context.Context, contextName, namespace string) ([]NetworkPolicy, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	npList, err := client.NetworkingV1().NetworkPolicies(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NetworkPolicy
	for _, np := range npList.Items {
		var policyTypes []string
		for _, pt := range np.Spec.PolicyTypes {
			policyTypes = append(policyTypes, string(pt))
		}
		podSelector := ""
		if len(np.Spec.PodSelector.MatchLabels) > 0 {
			var parts []string
			for k, v := range np.Spec.PodSelector.MatchLabels {
				parts = append(parts, k+"="+v)
			}
			podSelector = strings.Join(parts, ",")
		} else {
			podSelector = "(all pods)"
		}
		result = append(result, NetworkPolicy{
			Name:        np.Name,
			Namespace:   np.Namespace,
			Cluster:     contextName,
			PolicyTypes: policyTypes,
			PodSelector: podSelector,
			Age:         formatAge(np.CreationTimestamp.Time),
			Labels:      np.Labels,
		})
	}

	return result, nil
}

// GetResourceQuotas returns all ResourceQuotas in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetResourceQuotas(ctx context.Context, contextName, namespace string) ([]ResourceQuota, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	quotas, err := client.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ResourceQuota
	for _, quota := range quotas.Items {
		age := formatAge(quota.CreationTimestamp.Time)

		// Convert resource quantities to strings
		hard := make(map[string]string)
		for name, quantity := range quota.Status.Hard {
			hard[string(name)] = quantity.String()
		}

		used := make(map[string]string)
		for name, quantity := range quota.Status.Used {
			used[string(name)] = quantity.String()
		}

		result = append(result, ResourceQuota{
			Name:        quota.Name,
			Namespace:   quota.Namespace,
			Cluster:     contextName,
			Hard:        hard,
			Used:        used,
			Age:         age,
			Labels:      quota.Labels,
			Annotations: quota.Annotations,
		})
	}

	return result, nil
}

// GetLimitRanges returns all LimitRanges in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetLimitRanges(ctx context.Context, contextName, namespace string) ([]LimitRange, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	limitRanges, err := client.CoreV1().LimitRanges(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []LimitRange
	for _, lr := range limitRanges.Items {
		age := formatAge(lr.CreationTimestamp.Time)

		var limits []LimitRangeItem
		for _, limit := range lr.Spec.Limits {
			item := LimitRangeItem{
				Type: string(limit.Type),
			}

			// Convert Default
			if limit.Default != nil {
				item.Default = make(map[string]string)
				for name, quantity := range limit.Default {
					item.Default[string(name)] = quantity.String()
				}
			}

			// Convert DefaultRequest
			if limit.DefaultRequest != nil {
				item.DefaultRequest = make(map[string]string)
				for name, quantity := range limit.DefaultRequest {
					item.DefaultRequest[string(name)] = quantity.String()
				}
			}

			// Convert Max
			if limit.Max != nil {
				item.Max = make(map[string]string)
				for name, quantity := range limit.Max {
					item.Max[string(name)] = quantity.String()
				}
			}

			// Convert Min
			if limit.Min != nil {
				item.Min = make(map[string]string)
				for name, quantity := range limit.Min {
					item.Min[string(name)] = quantity.String()
				}
			}

			limits = append(limits, item)
		}

		result = append(result, LimitRange{
			Name:      lr.Name,
			Namespace: lr.Namespace,
			Cluster:   contextName,
			Limits:    limits,
			Age:       age,
			Labels:    lr.Labels,
		})
	}

	return result, nil
}

// ResourceQuotaSpec represents the desired spec for creating/updating a ResourceQuota
type ResourceQuotaSpec struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Hard        map[string]string `json:"hard"` // Resource limits to set
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"` // Reservation metadata
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota in a namespace
func (m *MultiClusterClient) CreateOrUpdateResourceQuota(ctx context.Context, contextName string, spec ResourceQuotaSpec) (*ResourceQuota, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// Convert string values to resource quantities
	hard := make(corev1.ResourceList)
	for name, value := range spec.Hard {
		quantity, err := resource.ParseQuantity(value)
		if err != nil {
			return nil, fmt.Errorf("invalid quantity for %s: %v", name, err)
		}
		hard[corev1.ResourceName(name)] = quantity
	}

	// Build the ResourceQuota object
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:        spec.Name,
			Namespace:   spec.Namespace,
			Labels:      spec.Labels,
			Annotations: spec.Annotations,
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: hard,
		},
	}

	// Try to get existing quota first
	existing, err := client.CoreV1().ResourceQuotas(spec.Namespace).Get(ctx, spec.Name, metav1.GetOptions{})
	if err == nil {
		// Update existing quota
		existing.Spec.Hard = hard
		if spec.Labels != nil {
			existing.Labels = spec.Labels
		}
		if spec.Annotations != nil {
			if existing.Annotations == nil {
				existing.Annotations = make(map[string]string)
			}
			for k, v := range spec.Annotations {
				existing.Annotations[k] = v
			}
		}
		updated, err := client.CoreV1().ResourceQuotas(spec.Namespace).Update(ctx, existing, metav1.UpdateOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to update ResourceQuota: %v", err)
		}

		// Convert to our response type
		resultHard := make(map[string]string)
		for name, quantity := range updated.Status.Hard {
			resultHard[string(name)] = quantity.String()
		}
		used := make(map[string]string)
		for name, quantity := range updated.Status.Used {
			used[string(name)] = quantity.String()
		}

		return &ResourceQuota{
			Name:        updated.Name,
			Namespace:   updated.Namespace,
			Cluster:     contextName,
			Hard:        resultHard,
			Used:        used,
			Age:         formatAge(updated.CreationTimestamp.Time),
			Labels:      updated.Labels,
			Annotations: updated.Annotations,
		}, nil
	}

	// Create new quota
	created, err := client.CoreV1().ResourceQuotas(spec.Namespace).Create(ctx, quota, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create ResourceQuota: %v", err)
	}

	// Convert to our response type
	resultHard := make(map[string]string)
	for name, quantity := range created.Spec.Hard {
		resultHard[string(name)] = quantity.String()
	}

	return &ResourceQuota{
		Name:        created.Name,
		Namespace:   created.Namespace,
		Cluster:     contextName,
		Hard:        resultHard,
		Used:        make(map[string]string), // New quota has no usage yet
		Age:         formatAge(created.CreationTimestamp.Time),
		Labels:      created.Labels,
		Annotations: created.Annotations,
	}, nil
}

// DeleteResourceQuota deletes a ResourceQuota from a namespace
func (m *MultiClusterClient) DeleteResourceQuota(ctx context.Context, contextName, namespace, name string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	err = client.CoreV1().ResourceQuotas(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete ResourceQuota: %v", err)
	}

	return nil
}

// EnsureNamespaceExists creates a namespace if it doesn't already exist.
// Used by GPU reservation flow to auto-create namespaces for users who don't have direct K8s RBAC.
func (m *MultiClusterClient) EnsureNamespaceExists(ctx context.Context, contextName, namespace string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	_, err = client.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err == nil {
		return nil // already exists
	}
	if !errors.IsNotFound(err) {
		return fmt.Errorf("failed to check namespace %s: %w", namespace, err)
	}

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: namespace,
			Labels: map[string]string{
				"kubestellar.io/managed-by": "kubestellar-console",
			},
		},
	}
	_, err = client.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil && errors.IsAlreadyExists(err) {
		return nil
	}
	return err
}

// GetPodLogs returns logs from a pod
func (m *MultiClusterClient) GetPodLogs(ctx context.Context, contextName, namespace, podName, container string, tailLines int64) (string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return "", err
	}

	opts := &corev1.PodLogOptions{}
	if tailLines > 0 {
		opts.TailLines = &tailLines
	}
	if container != "" {
		opts.Container = container
	}

	req := client.CoreV1().Pods(namespace).GetLogs(podName, opts)
	logs, err := req.DoRaw(ctx)
	if err != nil {
		return "", err
	}

	return string(logs), nil
}

// formatAge formats a time.Time as a human-readable age string
