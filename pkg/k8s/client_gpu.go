package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

func (m *MultiClusterClient) GetGPUNodes(ctx context.Context, contextName string) ([]GPUNode, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Fetch all pods once upfront to calculate accelerator allocations per node
	// This is much faster than querying pods per-node for large clusters
	allPods, _ := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	// Track allocations by node and accelerator type
	gpuAllocationByNode := make(map[string]int) // GPU allocations
	tpuAllocationByNode := make(map[string]int) // TPU allocations
	aiuAllocationByNode := make(map[string]int) // AIU (IBM AIU) allocations
	xpuAllocationByNode := make(map[string]int) // XPU allocations
	if allPods != nil {
		for _, pod := range allPods.Items {
			nodeName := pod.Spec.NodeName
			if nodeName == "" {
				continue
			}
			for _, container := range pod.Spec.Containers {
				// Check GPU requests (NVIDIA, AMD, Intel GPU, Intel Gaudi/Habana)
				// Intel Gaudi is classified as AcceleratorGPU, so track in gpuAllocationByNode
				if gpuReq, ok := container.Resources.Requests["nvidia.com/gpu"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["amd.com/gpu"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["gpu.intel.com/i915"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["habana.ai/gaudi"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["habana.ai/gaudi2"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["intel.com/gaudi"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				// Check TPU requests (Google Cloud)
				if tpuReq, ok := container.Resources.Requests["google.com/tpu"]; ok {
					tpuAllocationByNode[nodeName] += int(tpuReq.Value())
				}
				// Check XPU requests (Intel)
				if xpuReq, ok := container.Resources.Requests["intel.com/xpu"]; ok {
					xpuAllocationByNode[nodeName] += int(xpuReq.Value())
				}
				// Check IBM AIU requests
				if aiuReq, ok := container.Resources.Requests["ibm.com/aiu"]; ok {
					aiuAllocationByNode[nodeName] += int(aiuReq.Value())
				}
			}
		}
	}

	var gpuNodes []GPUNode
	for _, node := range nodes.Items {
		// Check for various accelerator types in allocatable resources
		// GPUs
		nvidiaGPUQty, hasNvidiaGPU := node.Status.Allocatable["nvidia.com/gpu"]
		amdGPUQty, hasAMDGPU := node.Status.Allocatable["amd.com/gpu"]
		intelGPUQty, hasIntelGPU := node.Status.Allocatable["gpu.intel.com/i915"]
		// TPUs (Google Cloud)
		tpuQty, hasTPU := node.Status.Allocatable["google.com/tpu"]
		// AIUs (Intel Gaudi / Habana)
		gaudiQty, hasGaudi := node.Status.Allocatable["habana.ai/gaudi"]
		gaudi2Qty, hasGaudi2 := node.Status.Allocatable["habana.ai/gaudi2"]
		intelGaudiQty, hasIntelGaudi := node.Status.Allocatable["intel.com/gaudi"]
		// XPUs (Intel)
		xpuQty, hasXPU := node.Status.Allocatable["intel.com/xpu"]
		// AIUs (IBM)
		ibmAIUQty, hasIBMAIU := node.Status.Allocatable["ibm.com/aiu"]

		hasAnyAccelerator := hasNvidiaGPU || hasAMDGPU || hasIntelGPU || hasTPU || hasGaudi || hasGaudi2 || hasIntelGaudi || hasXPU || hasIBMAIU
		if !hasAnyAccelerator {
			continue
		}

		var deviceCount int
		var manufacturer string
		var deviceType string
		var accelType AcceleratorType

		// Check GPUs first
		if hasNvidiaGPU && nvidiaGPUQty.Value() > 0 {
			deviceCount = int(nvidiaGPUQty.Value())
			manufacturer = "NVIDIA"
			accelType = AcceleratorGPU
			// Get GPU type from NVIDIA GPU Feature Discovery labels
			if label, ok := node.Labels["nvidia.com/gpu.product"]; ok {
				deviceType = label
			} else if label, ok := node.Labels["accelerator"]; ok {
				deviceType = label
			} else {
				deviceType = "NVIDIA GPU"
			}
		} else if hasAMDGPU && amdGPUQty.Value() > 0 {
			deviceCount = int(amdGPUQty.Value())
			manufacturer = "AMD"
			accelType = AcceleratorGPU
			if label, ok := node.Labels["amd.com/gpu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "AMD GPU"
			}
		} else if hasIntelGPU && intelGPUQty.Value() > 0 {
			deviceCount = int(intelGPUQty.Value())
			manufacturer = "Intel"
			accelType = AcceleratorGPU
			deviceType = "Intel GPU"
		} else if hasTPU && tpuQty.Value() > 0 {
			// Google TPU
			deviceCount = int(tpuQty.Value())
			manufacturer = "Google"
			accelType = AcceleratorTPU
			// Get TPU type from labels if available
			if label, ok := node.Labels["cloud.google.com/gke-tpu-accelerator"]; ok {
				deviceType = label
			} else if label, ok := node.Labels["cloud.google.com/gke-tpu-topology"]; ok {
				deviceType = "TPU " + label
			} else {
				deviceType = "Google TPU"
			}
		} else if (hasGaudi && gaudiQty.Value() > 0) || (hasGaudi2 && gaudi2Qty.Value() > 0) || (hasIntelGaudi && intelGaudiQty.Value() > 0) {
			// Intel Gaudi accelerators (formerly Habana Labs) - these are GPUs
			manufacturer = "Intel"
			accelType = AcceleratorGPU // Gaudi is classified as GPU-class accelerator
			if hasGaudi2 && gaudi2Qty.Value() > 0 {
				deviceCount = int(gaudi2Qty.Value())
				deviceType = "Intel Gaudi2"
			} else if hasGaudi && gaudiQty.Value() > 0 {
				deviceCount = int(gaudiQty.Value())
				deviceType = "Intel Gaudi"
			} else if hasIntelGaudi && intelGaudiQty.Value() > 0 {
				deviceCount = int(intelGaudiQty.Value())
				// Check for Gaudi generation from labels
				if label, ok := node.Labels["intel.com/gaudi.product"]; ok {
					deviceType = label
				} else {
					deviceType = "Intel Gaudi"
				}
			}
		} else if hasXPU && xpuQty.Value() > 0 {
			// Intel XPU
			deviceCount = int(xpuQty.Value())
			manufacturer = "Intel"
			accelType = AcceleratorXPU
			if label, ok := node.Labels["intel.com/xpu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "Intel XPU"
			}
		} else if hasIBMAIU && ibmAIUQty.Value() > 0 {
			// IBM AIU (Artificial Intelligence Unit)
			deviceCount = int(ibmAIUQty.Value())
			manufacturer = "IBM"
			accelType = AcceleratorAIU
			if label, ok := node.Labels["ibm.com/aiu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "IBM AIU"
			}
		} else {
			continue
		}

		if deviceCount == 0 {
			continue
		}

		// Extract enhanced GPU info from NVIDIA GPU Feature Discovery (GFD) labels
		var gpuMemoryMB int
		var gpuFamily string
		var cudaDriverVersion string
		var cudaRuntimeVersion string
		var migCapable bool
		var migStrategy string

		// GPU memory (in MB)
		if memLabel, ok := node.Labels["nvidia.com/gpu.memory"]; ok {
			fmt.Sscanf(memLabel, "%d", &gpuMemoryMB)
		}

		// GPU architecture family
		if familyLabel, ok := node.Labels["nvidia.com/gpu.family"]; ok {
			gpuFamily = familyLabel
		}

		// CUDA driver version (major.minor.rev)
		driverMajor := node.Labels["nvidia.com/cuda.driver.major"]
		driverMinor := node.Labels["nvidia.com/cuda.driver.minor"]
		driverRev := node.Labels["nvidia.com/cuda.driver.rev"]
		if driverMajor != "" {
			cudaDriverVersion = driverMajor
			if driverMinor != "" {
				cudaDriverVersion += "." + driverMinor
			}
			if driverRev != "" {
				cudaDriverVersion += "." + driverRev
			}
		}

		// CUDA runtime version
		runtimeMajor := node.Labels["nvidia.com/cuda.runtime.major"]
		runtimeMinor := node.Labels["nvidia.com/cuda.runtime.minor"]
		if runtimeMajor != "" {
			cudaRuntimeVersion = runtimeMajor
			if runtimeMinor != "" {
				cudaRuntimeVersion += "." + runtimeMinor
			}
		}

		// MIG capability
		if migLabel, ok := node.Labels["nvidia.com/mig.capable"]; ok {
			migCapable = migLabel == "true"
		}

		// MIG strategy
		if strategyLabel, ok := node.Labels["nvidia.com/mig.strategy"]; ok {
			migStrategy = strategyLabel
		}

		// Get allocated accelerators from pre-computed map based on type
		var allocated int
		switch accelType {
		case AcceleratorGPU:
			allocated = gpuAllocationByNode[node.Name]
		case AcceleratorTPU:
			allocated = tpuAllocationByNode[node.Name]
		case AcceleratorAIU:
			allocated = aiuAllocationByNode[node.Name]
		case AcceleratorXPU:
			allocated = xpuAllocationByNode[node.Name]
		}

		gpuNodes = append(gpuNodes, GPUNode{
			Name:               node.Name,
			Cluster:            contextName,
			GPUType:            deviceType,
			GPUCount:           deviceCount,
			GPUAllocated:       allocated,
			AcceleratorType:    accelType,
			GPUMemoryMB:        gpuMemoryMB,
			GPUFamily:          gpuFamily,
			CUDADriverVersion:  cudaDriverVersion,
			CUDARuntimeVersion: cudaRuntimeVersion,
			MIGCapable:         migCapable,
			MIGStrategy:        migStrategy,
			Manufacturer:       manufacturer,
		})
	}

	return gpuNodes, nil
}

// GPU operator namespace names to search for operator pods
var gpuOperatorNamespaces = []string{
	"nvidia-gpu-operator",
	"gpu-operator",
	"nvidia-device-plugin",
	"kube-system",
}

// GetGPUNodeHealth returns proactive health status for all GPU nodes in a cluster.
// It checks node readiness, scheduling, GPU operator pod health, stuck pods, and GPU reset events.
func (m *MultiClusterClient) GetGPUNodeHealth(ctx context.Context, contextName string) ([]GPUNodeHealthStatus, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// 1. Get GPU nodes using existing method
	gpuNodes, err := m.GetGPUNodes(ctx, contextName)
	if err != nil {
		return nil, fmt.Errorf("listing GPU nodes: %w", err)
	}
	if len(gpuNodes) == 0 {
		return nil, nil
	}

	// 2. Get node objects for condition checks
	nodeList, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing nodes: %w", err)
	}
	nodeMap := make(map[string]corev1.Node, len(nodeList.Items))
	for _, n := range nodeList.Items {
		nodeMap[n.Name] = n
	}

	// 3. Find GPU operator pods across known namespaces
	var operatorPods []corev1.Pod
	for _, ns := range gpuOperatorNamespaces {
		pods, listErr := client.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			continue // namespace may not exist
		}
		operatorPods = append(operatorPods, pods.Items...)
	}

	// 4. Find non-running pods for stuck pod detection (exclude Succeeded/Running)
	allPods, _ := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})

	// 5. Get warning events from the last hour for GPU reset detection
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	events, _ := client.CoreV1().Events("").List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})

	// 6. Build health status for each GPU node
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	var results []GPUNodeHealthStatus

	for _, gpuNode := range gpuNodes {
		nodeObj, exists := nodeMap[gpuNode.Name]
		if !exists {
			continue
		}

		checks := []GPUNodeHealthCheck{}
		issues := []string{}

		// Check 1: Node Ready
		nodeReady := false
		for _, cond := range nodeObj.Status.Conditions {
			if cond.Type == corev1.NodeReady {
				nodeReady = cond.Status == corev1.ConditionTrue
				if !nodeReady {
					msg := "Node is NotReady"
					if cond.Message != "" {
						msg = cond.Message
					}
					checks = append(checks, GPUNodeHealthCheck{Name: "node_ready", Passed: false, Message: msg})
					issues = append(issues, "Node is NotReady")
				} else {
					checks = append(checks, GPUNodeHealthCheck{Name: "node_ready", Passed: true})
				}
				break
			}
		}

		// Check 2: Scheduling enabled
		if nodeObj.Spec.Unschedulable {
			checks = append(checks, GPUNodeHealthCheck{Name: "scheduling", Passed: false, Message: "Node is cordoned (SchedulingDisabled)"})
			issues = append(issues, "Node is cordoned")
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "scheduling", Passed: true})
		}

		// Check 3: gpu-feature-discovery pod
		gfdCheck := checkOperatorPod(operatorPods, gpuNode.Name, "gpu-feature-discovery")
		checks = append(checks, gfdCheck)
		if !gfdCheck.Passed {
			issues = append(issues, "gpu-feature-discovery: "+gfdCheck.Message)
		}

		// Check 4: nvidia-device-plugin pod
		dpCheck := checkOperatorPod(operatorPods, gpuNode.Name, "nvidia-device-plugin")
		checks = append(checks, dpCheck)
		if !dpCheck.Passed {
			issues = append(issues, "nvidia-device-plugin: "+dpCheck.Message)
		}

		// Check 5: dcgm-exporter pod
		dcgmCheck := checkOperatorPod(operatorPods, gpuNode.Name, "dcgm-exporter")
		checks = append(checks, dcgmCheck)
		if !dcgmCheck.Passed {
			issues = append(issues, "dcgm-exporter: "+dcgmCheck.Message)
		}

		// Check 6: Stuck pods on this node
		stuckCount := 0
		if allPods != nil {
			for i := range allPods.Items {
				pod := &allPods.Items[i]
				if pod.Spec.NodeName != gpuNode.Name {
					continue
				}
				if isStuckPod(pod) {
					stuckCount++
				}
			}
		}
		if stuckCount > 0 {
			msg := fmt.Sprintf("%d pods stuck (ContainerStatusUnknown/Terminating)", stuckCount)
			checks = append(checks, GPUNodeHealthCheck{Name: "stuck_pods", Passed: false, Message: msg})
			issues = append(issues, msg)
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "stuck_pods", Passed: true})
		}

		// Check 7: GPU reset events
		gpuResetCount := 0
		if events != nil {
			for i := range events.Items {
				ev := &events.Items[i]
				if ev.LastTimestamp.Time.Before(oneHourAgo) && ev.EventTime.Time.Before(oneHourAgo) {
					continue
				}
				if ev.InvolvedObject.Name != gpuNode.Name {
					continue
				}
				msg := strings.ToLower(ev.Message)
				if strings.Contains(msg, "gpu") && (strings.Contains(msg, "reset") || strings.Contains(msg, "xid") || strings.Contains(msg, "nvlink") || strings.Contains(msg, "ecc")) {
					gpuResetCount++
				}
			}
		}
		if gpuResetCount > 0 {
			msg := fmt.Sprintf("%d GPU warning events in last hour", gpuResetCount)
			checks = append(checks, GPUNodeHealthCheck{Name: "gpu_events", Passed: false, Message: msg})
			issues = append(issues, msg)
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "gpu_events", Passed: true})
		}

		// Derive overall status
		status := deriveGPUNodeStatus(checks)

		results = append(results, GPUNodeHealthStatus{
			NodeName:  gpuNode.Name,
			Cluster:   contextName,
			Status:    status,
			GPUCount:  gpuNode.GPUCount,
			GPUType:   gpuNode.GPUType,
			Checks:    checks,
			Issues:    issues,
			StuckPods: stuckCount,
			CheckedAt: checkedAt,
		})
	}

	return results, nil
}

// checkOperatorPod checks if a specific GPU operator pod is running on a node.
// It searches by pod name prefix and node name match (for DaemonSet pods).
func checkOperatorPod(pods []corev1.Pod, nodeName, podPrefix string) GPUNodeHealthCheck {
	for i := range pods {
		pod := &pods[i]
		if !strings.Contains(pod.Name, podPrefix) {
			continue
		}
		// DaemonSet pods run on specific nodes
		if pod.Spec.NodeName != nodeName {
			continue
		}
		if pod.Status.Phase == corev1.PodRunning {
			// Check for CrashLoopBackOff in container statuses
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
					msg := fmt.Sprintf("CrashLoopBackOff (%d restarts)", cs.RestartCount)
					return GPUNodeHealthCheck{Name: podPrefix, Passed: false, Message: msg}
				}
			}
			return GPUNodeHealthCheck{Name: podPrefix, Passed: true}
		}
		// Not running
		reason := string(pod.Status.Phase)
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				reason = cs.State.Waiting.Reason
				if cs.RestartCount > 0 {
					reason = fmt.Sprintf("%s (%d restarts)", reason, cs.RestartCount)
				}
				break
			}
		}
		return GPUNodeHealthCheck{Name: podPrefix, Passed: false, Message: reason}
	}
	// Pod not found on this node — could be normal if operator not installed
	return GPUNodeHealthCheck{Name: podPrefix, Passed: true, Message: "not found (operator may not be installed)"}
}

// isStuckPod returns true if a pod appears stuck (ContainerStatusUnknown, long-Terminating, etc.)
func isStuckPod(pod *corev1.Pod) bool {
	// Check for ContainerStatusUnknown
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Terminated != nil && cs.State.Terminated.Reason == "ContainerStatusUnknown" {
			return true
		}
	}
	// Check for pods stuck in Terminating (deletion timestamp set but still exists) > 5 min
	if pod.DeletionTimestamp != nil {
		if time.Since(pod.DeletionTimestamp.Time) > 5*time.Minute {
			return true
		}
	}
	// Check for Pending pods stuck > 10 min
	if pod.Status.Phase == corev1.PodPending && pod.CreationTimestamp.Time.Before(time.Now().Add(-10*time.Minute)) {
		return true
	}
	return false
}

// deriveGPUNodeStatus determines overall health from individual checks.
// Critical checks (node_ready, stuck_pods) failing → unhealthy.
// 1-2 non-critical failures → degraded. All pass → healthy.
func deriveGPUNodeStatus(checks []GPUNodeHealthCheck) string {
	criticalFail := false
	failCount := 0
	for _, c := range checks {
		if c.Passed {
			continue
		}
		failCount++
		if c.Name == "node_ready" || c.Name == "stuck_pods" || c.Name == "gpu_events" {
			criticalFail = true
		}
	}
	if criticalFail || failCount >= 3 {
		return "unhealthy"
	}
	if failCount > 0 {
		return "degraded"
	}
	return "healthy"
}

// ============================================================================
// GPU Health CronJob Management
// ============================================================================

// GetGPUHealthCronJobStatus checks if the GPU health CronJob is installed and returns its status.
// It also reads structured results from the ConfigMap and auto-reconciles outdated script versions.
func (m *MultiClusterClient) GetGPUHealthCronJobStatus(ctx context.Context, contextName string) (*GPUHealthCronJobStatus, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	status := &GPUHealthCronJobStatus{
		Cluster: contextName,
	}

	// Check RBAC permissions first
	status.CanInstall = m.canManageCronJobs(ctx, client, gpuHealthDefaultNS)

	// Look for the CronJob in known namespaces
	for _, ns := range []string{gpuHealthDefaultNS, "gpu-operator", "kube-system"} {
		cj, getErr := client.BatchV1().CronJobs(ns).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		if getErr != nil {
			continue // not found or namespace doesn't exist
		}

		// Found it
		status.Installed = true
		status.Namespace = ns
		status.Schedule = cj.Spec.Schedule
		status.ActiveJobs = len(cj.Status.Active)

		// Read version and tier from labels
		if v, ok := cj.Labels["kubestellar-console/script-version"]; ok {
			fmt.Sscanf(v, "%d", &status.Version)
		}
		if t, ok := cj.Labels["kubestellar-console/tier"]; ok {
			fmt.Sscanf(t, "%d", &status.Tier)
		}
		if status.Tier == 0 {
			status.Tier = 1 // legacy CronJobs without tier label
		}

		// Check if update is available
		status.UpdateAvailable = status.Version < gpuHealthScriptVersion

		// Auto-reconcile: update CronJob if version is outdated and user has permissions
		if status.UpdateAvailable && status.CanInstall {
			if reconcileErr := m.InstallGPUHealthCronJob(ctx, contextName, ns, cj.Spec.Schedule, status.Tier); reconcileErr != nil {
				slog.Error(fmt.Sprintf("[GPUHealthCronJob] Auto-reconcile failed for %s: %v", contextName, reconcileErr))
			} else {
				slog.Info(fmt.Sprintf("[GPUHealthCronJob] Auto-reconciled %s to script version %d", contextName, gpuHealthScriptVersion))
				status.Version = gpuHealthScriptVersion
				status.UpdateAvailable = false
			}
		}

		if cj.Status.LastScheduleTime != nil {
			status.LastRun = cj.Status.LastScheduleTime.UTC().Format(time.RFC3339)
		}
		if cj.Status.LastSuccessfulTime != nil {
			status.LastResult = "success"
			status.SuccessJobs = 1
		}

		// Count recent jobs
		jobs, jobErr := client.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{
			LabelSelector: "app=" + gpuHealthCronJobName,
		})
		if jobErr == nil {
			status.SuccessJobs = 0
			status.FailedJobs = 0
			for _, j := range jobs.Items {
				if j.Status.Succeeded > 0 {
					status.SuccessJobs++
				}
				if j.Status.Failed > 0 {
					status.FailedJobs++
				}
			}
			if status.FailedJobs > 0 && status.SuccessJobs == 0 {
				status.LastResult = "failed"
			} else if status.SuccessJobs > 0 {
				status.LastResult = "success"
			}
		}

		// Read structured results from ConfigMap
		status.LastResults = readGPUHealthResults(ctx, client, ns)

		return status, nil
	}

	// Not found
	return status, nil
}

// readGPUHealthResults reads the gpu-health-results ConfigMap and parses the JSON results.
func readGPUHealthResults(ctx context.Context, client kubernetes.Interface, namespace string) []GPUHealthCheckResult {
	cm, err := client.CoreV1().ConfigMaps(namespace).Get(ctx, gpuHealthConfigMapName, metav1.GetOptions{})
	if err != nil {
		return nil
	}

	resultsJSON, ok := cm.Data["results"]
	if !ok {
		return nil
	}

	var wrapper struct {
		Nodes []GPUHealthCheckResult `json:"nodes"`
	}
	if jsonErr := json.Unmarshal([]byte(resultsJSON), &wrapper); jsonErr != nil {
		slog.Error(fmt.Sprintf("[GPUHealthCronJob] Failed to parse ConfigMap results: %v", jsonErr))
		return nil
	}
	return wrapper.Nodes
}

// InstallGPUHealthCronJob installs the GPU health check CronJob on a cluster.
// It creates: Namespace (if needed), ServiceAccount, ClusterRole, ClusterRoleBinding, CronJob.
func (m *MultiClusterClient) InstallGPUHealthCronJob(ctx context.Context, contextName, namespace, schedule string, tier int) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	if namespace == "" {
		namespace = gpuHealthDefaultNS
	}
	if schedule == "" {
		schedule = gpuHealthDefaultSchedule
	}
	if tier < 1 || tier > 4 {
		tier = gpuHealthDefaultTier
	}

	// Ensure namespace exists
	_, nsErr := client.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if nsErr != nil {
		if errors.IsNotFound(nsErr) {
			_, createErr := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
				ObjectMeta: metav1.ObjectMeta{
					Name:   namespace,
					Labels: map[string]string{"app.kubernetes.io/managed-by": "kubestellar-console"},
				},
			}, metav1.CreateOptions{})
			if createErr != nil && !errors.IsAlreadyExists(createErr) {
				return fmt.Errorf("creating namespace %s: %w", namespace, createErr)
			}
		}
	}

	// Create ServiceAccount
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gpuHealthServiceAccount,
			Namespace: namespace,
			Labels:    map[string]string{"app": gpuHealthCronJobName, "app.kubernetes.io/managed-by": "kubestellar-console"},
		},
	}
	if _, saErr := client.CoreV1().ServiceAccounts(namespace).Create(ctx, sa, metav1.CreateOptions{}); saErr != nil && !errors.IsAlreadyExists(saErr) {
		return fmt.Errorf("creating ServiceAccount: %w", saErr)
	}

	// Build RBAC rules based on tier
	rules := []rbacv1.PolicyRule{
		// All tiers: nodes, pods, events, configmaps (for results)
		{APIGroups: []string{""}, Resources: []string{"nodes"}, Verbs: []string{"get", "list"}},
		{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}},
		{APIGroups: []string{""}, Resources: []string{"events"}, Verbs: []string{"get", "list", "create"}},
		{APIGroups: []string{""}, Resources: []string{"configmaps"}, Verbs: []string{"get", "create", "update"}},
	}
	if tier >= 2 {
		rules = append(rules,
			rbacv1.PolicyRule{APIGroups: []string{""}, Resources: []string{"resourcequotas"}, Verbs: []string{"get", "list"}},
		)
	}
	if tier >= 3 {
		rules = append(rules,
			rbacv1.PolicyRule{APIGroups: []string{"batch"}, Resources: []string{"jobs"}, Verbs: []string{"get", "list"}},
		)
	}
	if tier >= 4 {
		rules = append(rules,
			rbacv1.PolicyRule{APIGroups: []string{""}, Resources: []string{"pods/exec"}, Verbs: []string{"create"}},
		)
	}

	// Create/update ClusterRole
	cr := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name:   gpuHealthClusterRole,
			Labels: map[string]string{"app": gpuHealthCronJobName, "app.kubernetes.io/managed-by": "kubestellar-console"},
		},
		Rules: rules,
	}
	if _, crErr := client.RbacV1().ClusterRoles().Create(ctx, cr, metav1.CreateOptions{}); crErr != nil {
		if errors.IsAlreadyExists(crErr) {
			existing, getErr := client.RbacV1().ClusterRoles().Get(ctx, gpuHealthClusterRole, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("getting existing ClusterRole %q for update: %w", gpuHealthClusterRole, getErr)
			}
			existing.Rules = rules
			if _, updateErr := client.RbacV1().ClusterRoles().Update(ctx, existing, metav1.UpdateOptions{}); updateErr != nil {
				return fmt.Errorf("updating ClusterRole %q: %w", gpuHealthClusterRole, updateErr)
			}
		} else {
			return fmt.Errorf("creating ClusterRole: %w", crErr)
		}
	}

	// Create ClusterRoleBinding
	crb := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name:   gpuHealthClusterRoleBinding,
			Labels: map[string]string{"app": gpuHealthCronJobName, "app.kubernetes.io/managed-by": "kubestellar-console"},
		},
		Subjects: []rbacv1.Subject{{
			Kind:      "ServiceAccount",
			Name:      gpuHealthServiceAccount,
			Namespace: namespace,
		}},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     gpuHealthClusterRole,
		},
	}
	if _, crbErr := client.RbacV1().ClusterRoleBindings().Create(ctx, crb, metav1.CreateOptions{}); crbErr != nil && !errors.IsAlreadyExists(crbErr) {
		return fmt.Errorf("creating ClusterRoleBinding: %w", crbErr)
	}

	// Build the tiered health check script
	healthCheckScript := buildGPUHealthCheckScript(namespace)

	backoffLimit := int32(1)
	ttlSeconds := int32(3600) // Clean up finished jobs after 1 hour
	cjLabels := map[string]string{
		"app":                                gpuHealthCronJobName,
		"app.kubernetes.io/managed-by":       "kubestellar-console",
		"app.kubernetes.io/component":        "gpu-health-monitoring",
		"kubestellar-console/script-version": fmt.Sprintf("%d", gpuHealthScriptVersion),
		"kubestellar-console/tier":           fmt.Sprintf("%d", tier),
	}
	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gpuHealthCronJobName,
			Namespace: namespace,
			Labels:    cjLabels,
		},
		Spec: batchv1.CronJobSpec{
			Schedule:          schedule,
			ConcurrencyPolicy: batchv1.ForbidConcurrent,
			JobTemplate: batchv1.JobTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{"app": gpuHealthCronJobName},
				},
				Spec: batchv1.JobSpec{
					BackoffLimit:            &backoffLimit,
					TTLSecondsAfterFinished: &ttlSeconds,
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							ServiceAccountName: gpuHealthServiceAccount,
							RestartPolicy:      corev1.RestartPolicyNever,
							Containers: []corev1.Container{{
								Name:    "gpu-health-checker",
								Image:   gpuHealthCheckerImage,
								Command: []string{"/bin/sh", "-c", healthCheckScript},
								Env: []corev1.EnvVar{
									{Name: "CHECK_TIER", Value: fmt.Sprintf("%d", tier)},
									{Name: "RESULTS_NAMESPACE", Value: namespace},
								},
							}},
						},
					},
				},
			},
		},
	}

	if _, cjErr := client.BatchV1().CronJobs(namespace).Create(ctx, cj, metav1.CreateOptions{}); cjErr != nil {
		if errors.IsAlreadyExists(cjErr) {
			// Update existing CronJob
			existing, getErr := client.BatchV1().CronJobs(namespace).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("getting existing CronJob: %w", getErr)
			}
			existing.Spec = cj.Spec
			existing.Labels = cjLabels
			if _, updateErr := client.BatchV1().CronJobs(namespace).Update(ctx, existing, metav1.UpdateOptions{}); updateErr != nil {
				return fmt.Errorf("updating CronJob: %w", updateErr)
			}
		} else {
			return fmt.Errorf("creating CronJob: %w", cjErr)
		}
	}

	slog.Info(fmt.Sprintf("[GPUHealthCronJob] Installed on cluster %s in namespace %s (schedule=%s, tier=%d, version=%d)", contextName, namespace, schedule, tier, gpuHealthScriptVersion))
	return nil
}

// buildGPUHealthCheckScript returns the tiered health check bash script.
// The CHECK_TIER env var controls which checks run. Results are written to a ConfigMap.
func buildGPUHealthCheckScript(namespace string) string {
	return `#!/bin/sh
set -e
TIER=${CHECK_TIER:-2}
NS=${RESULTS_NAMESPACE:-` + namespace + `}
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "GPU Health Check starting at $TIMESTAMP (Tier $TIER)"

# ---- Discover GPU nodes ----
GPU_NODES=$(kubectl get nodes -l nvidia.com/gpu.present=true -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
if [ -z "$GPU_NODES" ]; then
  GPU_NODES=$(kubectl get nodes -o json | python3 -c "
import json,sys
data=json.load(sys.stdin)
for n in data.get('items',[]):
  alloc=n.get('status',{}).get('allocatable',{})
  if any(k for k in alloc if 'gpu' in k.lower() or 'gaudi' in k.lower()):
    print(n['metadata']['name'])
" 2>/dev/null || echo "")
fi

if [ -z "$GPU_NODES" ]; then
  echo '{"checkedAt":"'"$TIMESTAMP"'","tier":'"$TIER"',"nodes":[]}' > /tmp/results.json
  kubectl create configmap gpu-health-results --from-file=results=/tmp/results.json -n "$NS" --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || true
  echo "No GPU nodes found"
  exit 0
fi

TOTAL_ISSUES=0
RESULTS_JSON='{"checkedAt":"'"$TIMESTAMP"'","tier":'"$TIER"',"nodes":['
FIRST_NODE=true

for NODE in $GPU_NODES; do
  NODE_ISSUES=""
  NODE_CHECKS=""
  NODE_STATUS="healthy"
  FIRST_CHECK=true

  add_check() {
    local name="$1" passed="$2" msg="$3"
    if [ "$FIRST_CHECK" = "true" ]; then FIRST_CHECK=false; else NODE_CHECKS="$NODE_CHECKS,"; fi
    NODE_CHECKS="$NODE_CHECKS"'{"name":"'"$name"'","passed":'"$passed"',"message":"'"$msg"'"}'
    if [ "$passed" = "false" ]; then
      TOTAL_ISSUES=$((TOTAL_ISSUES+1))
      if [ -z "$NODE_ISSUES" ]; then NODE_ISSUES='"'"$msg"'"'; else NODE_ISSUES="$NODE_ISSUES,"'"'"$msg"'"'; fi
      NODE_STATUS="unhealthy"
    fi
  }

  # ---- TIER 1: Critical checks ----
  # Node Ready status
  READY=$(kubectl get node "$NODE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
  if [ "$READY" = "True" ]; then
    add_check "Node Ready" "true" "Node is Ready"
  else
    add_check "Node Ready" "false" "Node $NODE is NotReady"
  fi

  # Cordoned check
  UNSCHEDULABLE=$(kubectl get node "$NODE" -o jsonpath='{.spec.unschedulable}')
  if [ "$UNSCHEDULABLE" = "true" ]; then
    add_check "Cordoned" "false" "Node $NODE is cordoned (unschedulable)"
  else
    add_check "Cordoned" "true" "Node is schedulable"
  fi

  # Stuck pods
  STUCK=$(kubectl get pods --field-selector=spec.nodeName="$NODE" --all-namespaces --no-headers 2>/dev/null | grep -cE "Unknown|Terminating|ContainerStatusUnknown" || echo "0")
  if [ "$STUCK" -gt "0" ]; then
    add_check "Stuck Pods" "false" "$STUCK stuck pods on node $NODE"
  else
    add_check "Stuck Pods" "true" "No stuck pods"
  fi

  # NVIDIA operator pods (GFD, device-plugin, DCGM)
  for COMPONENT in gpu-feature-discovery nvidia-device-plugin dcgm-exporter; do
    POD_STATUS=$(kubectl get pods -A -l app="$COMPONENT" --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | head -1 | awk '{print $4}' || echo "")
    if [ -z "$POD_STATUS" ]; then
      POD_STATUS=$(kubectl get pods -A -l app.kubernetes.io/component="$COMPONENT" --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | head -1 | awk '{print $4}' || echo "")
    fi
    if [ -z "$POD_STATUS" ]; then
      add_check "$COMPONENT" "true" "$COMPONENT not deployed (optional)"
    elif [ "$POD_STATUS" = "Running" ]; then
      add_check "$COMPONENT" "true" "$COMPONENT is running"
    else
      add_check "$COMPONENT" "false" "$COMPONENT pod is $POD_STATUS on $NODE"
    fi
  done

  # GPU reset/XID events (last 1 hour)
  XID_EVENTS=$(kubectl get events -A --field-selector involvedObject.name="$NODE" --no-headers 2>/dev/null | grep -ciE "xid|gpu.?reset|ecc|fallen off the bus" || echo "0")
  if [ "$XID_EVENTS" -gt "0" ]; then
    add_check "GPU Events" "false" "$XID_EVENTS GPU error events on $NODE"
  else
    add_check "GPU Events" "true" "No GPU error events"
  fi

  # ---- TIER 2: Standard checks ----
  if [ "$TIER" -ge "2" ]; then
    # GPU capacity vs allocatable mismatch
    GPU_CAP=$(kubectl get node "$NODE" -o jsonpath='{.status.capacity.nvidia\.com/gpu}' 2>/dev/null || echo "0")
    GPU_ALLOC=$(kubectl get node "$NODE" -o jsonpath='{.status.allocatable.nvidia\.com/gpu}' 2>/dev/null || echo "0")
    if [ "$GPU_CAP" != "$GPU_ALLOC" ] && [ "$GPU_CAP" != "0" ]; then
      add_check "GPU Capacity" "false" "Capacity $GPU_CAP != allocatable $GPU_ALLOC on $NODE"
    else
      add_check "GPU Capacity" "true" "GPU capacity matches allocatable ($GPU_CAP)"
    fi

    # Pending GPU pods
    PENDING_GPU=$(kubectl get pods -A --field-selector=status.phase=Pending -o json 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
count=0
for p in data.get('items',[]):
  for c in p.get('spec',{}).get('containers',[]):
    res=c.get('resources',{}).get('limits',{})
    if any(k for k in res if 'gpu' in k.lower() or 'gaudi' in k.lower()):
      count+=1
      break
print(count)
" 2>/dev/null || echo "0")
    if [ "$PENDING_GPU" -gt "0" ]; then
      add_check "Pending GPU Pods" "false" "$PENDING_GPU pods pending GPU allocation"
    else
      add_check "Pending GPU Pods" "true" "No pending GPU pods"
    fi

    # NVIDIA driver pods
    DRIVER_STATUS=$(kubectl get pods -A -l app=nvidia-driver-daemonset --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | head -1 | awk '{print $4}' || echo "")
    if [ -z "$DRIVER_STATUS" ]; then
      add_check "NVIDIA Driver" "true" "NVIDIA driver daemonset not deployed (may use host driver)"
    elif [ "$DRIVER_STATUS" = "Running" ]; then
      add_check "NVIDIA Driver" "true" "NVIDIA driver pod is running"
    else
      add_check "NVIDIA Driver" "false" "NVIDIA driver pod is $DRIVER_STATUS on $NODE"
    fi

    # Node conditions: DiskPressure, MemoryPressure, PIDPressure
    for COND in DiskPressure MemoryPressure PIDPressure; do
      COND_STATUS=$(kubectl get node "$NODE" -o jsonpath='{.status.conditions[?(@.type=="'"$COND"'")].status}')
      if [ "$COND_STATUS" = "True" ]; then
        add_check "$COND" "false" "$COND detected on $NODE"
      else
        add_check "$COND" "true" "No $COND"
      fi
    done

    # Resource quota exhaustion (any namespace on this node)
    QUOTA_ISSUES=$(kubectl get resourcequotas -A -o json 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
issues=0
for q in data.get('items',[]):
  hard=q.get('status',{}).get('hard',{})
  used=q.get('status',{}).get('used',{})
  for k in hard:
    if 'gpu' in k.lower():
      try:
        h=int(hard[k]);u=int(used.get(k,'0'))
        if h>0 and u>=h: issues+=1
      except: pass
print(issues)
" 2>/dev/null || echo "0")
    if [ "$QUOTA_ISSUES" -gt "0" ]; then
      add_check "GPU Quota" "false" "$QUOTA_ISSUES GPU resource quotas exhausted"
    else
      add_check "GPU Quota" "true" "No GPU quota exhaustion"
    fi
  fi

  # ---- TIER 3: Full checks ----
  if [ "$TIER" -ge "3" ]; then
    # GPU utilization at zero (check via DCGM metrics if available)
    DCGM_POD=$(kubectl get pods -A -l app=dcgm-exporter --field-selector=spec.nodeName="$NODE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    DCGM_NS=$(kubectl get pods -A -l app=dcgm-exporter --field-selector=spec.nodeName="$NODE" -o jsonpath='{.items[0].metadata.namespace}' 2>/dev/null || echo "")
    if [ -n "$DCGM_POD" ] && [ -n "$DCGM_NS" ]; then
      ZERO_UTIL=$(kubectl exec -n "$DCGM_NS" "$DCGM_POD" -- curl -s localhost:9400/metrics 2>/dev/null | grep "DCGM_FI_DEV_GPU_UTIL" | grep -v "^#" | awk '{if($NF==0)count++}END{print count+0}' || echo "0")
      GPU_IN_USE=$(kubectl get pods --field-selector=spec.nodeName="$NODE" -A -o json 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
count=0
for p in data.get('items',[]):
  if p.get('status',{}).get('phase')=='Running':
    for c in p.get('spec',{}).get('containers',[]):
      res=c.get('resources',{}).get('limits',{})
      if any(k for k in res if 'gpu' in k.lower()):
        count+=1; break
print(count)
" 2>/dev/null || echo "0")
      if [ "$ZERO_UTIL" -gt "0" ] && [ "$GPU_IN_USE" -gt "0" ]; then
        add_check "GPU Utilization" "false" "$ZERO_UTIL GPUs at 0% utilization with $GPU_IN_USE GPU pods running"
      else
        add_check "GPU Utilization" "true" "GPU utilization normal"
      fi
    else
      add_check "GPU Utilization" "true" "DCGM not available (skipped)"
    fi

    # MIG config drift
    MIG_STRATEGY=$(kubectl get node "$NODE" -o jsonpath='{.metadata.labels.nvidia\.com/mig\.strategy}' 2>/dev/null || echo "")
    if [ -n "$MIG_STRATEGY" ]; then
      MIG_CONFIG=$(kubectl get node "$NODE" -o jsonpath='{.metadata.labels.nvidia\.com/mig\.config\.state}' 2>/dev/null || echo "")
      if [ "$MIG_CONFIG" = "failed" ]; then
        add_check "MIG Config" "false" "MIG configuration in failed state on $NODE"
      else
        add_check "MIG Config" "true" "MIG config OK (strategy=$MIG_STRATEGY)"
      fi
    fi

    # InfiniBand/RDMA pods
    RDMA_PODS=$(kubectl get pods -A --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | grep -ciE "rdma|infiniband|mellanox|mofed" || echo "0")
    RDMA_ISSUES=$(kubectl get pods -A --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | grep -iE "rdma|infiniband|mellanox|mofed" | grep -cvE "Running|Completed" || echo "0")
    if [ "$RDMA_ISSUES" -gt "0" ]; then
      add_check "RDMA/IB" "false" "$RDMA_ISSUES RDMA/InfiniBand pods not running on $NODE"
    elif [ "$RDMA_PODS" -gt "0" ]; then
      add_check "RDMA/IB" "true" "$RDMA_PODS RDMA/IB pods healthy"
    fi

    # Failed Jobs on GPU nodes
    FAILED_JOBS=$(kubectl get jobs -A --no-headers 2>/dev/null | awk '$3=="0" && $4!="0"{print $2}' | head -5 | while read JOB; do
      kubectl get pods -A -l job-name="$JOB" --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | grep -c "" || true
    done | awk '{s+=$1}END{print s+0}')
    if [ "$FAILED_JOBS" -gt "0" ]; then
      add_check "Failed Jobs" "false" "$FAILED_JOBS failed jobs ran on GPU node $NODE"
    else
      add_check "Failed Jobs" "true" "No failed jobs on GPU node"
    fi

    # Evicted pods
    EVICTED=$(kubectl get pods --field-selector=spec.nodeName="$NODE" -A --no-headers 2>/dev/null | grep -c "Evicted" || echo "0")
    if [ "$EVICTED" -gt "0" ]; then
      add_check "Evicted Pods" "false" "$EVICTED evicted pods on $NODE"
    else
      add_check "Evicted Pods" "true" "No evicted pods"
    fi
  fi

  # ---- TIER 4: Deep checks (requires privileged access) ----
  if [ "$TIER" -ge "4" ]; then
    # nvidia-smi via debug pod
    SMI_OUTPUT=$(kubectl debug node/"$NODE" -it --image=nvidia/cuda:12.2.0-base-ubuntu22.04 -- nvidia-smi --query-gpu=ecc.errors.corrected.volatile.total,temperature.gpu,memory.used,memory.total --format=csv,noheader 2>/dev/null || echo "")
    if [ -n "$SMI_OUTPUT" ]; then
      ECC_ERRORS=$(echo "$SMI_OUTPUT" | awk -F',' '{s+=$1}END{print s+0}')
      MAX_TEMP=$(echo "$SMI_OUTPUT" | awk -F',' '{if($2+0>max)max=$2+0}END{print max+0}')
      if [ "$ECC_ERRORS" -gt "0" ]; then
        add_check "ECC Errors" "false" "$ECC_ERRORS ECC errors detected on $NODE"
      else
        add_check "ECC Errors" "true" "No ECC errors"
      fi
      if [ "$MAX_TEMP" -gt "85" ]; then
        add_check "GPU Temperature" "false" "GPU temperature ${MAX_TEMP}C exceeds 85C on $NODE"
      else
        add_check "GPU Temperature" "true" "GPU temperature normal (${MAX_TEMP}C)"
      fi
    else
      add_check "nvidia-smi" "true" "Could not run nvidia-smi (debug pod failed, skipped)"
    fi

    # dmesg GPU kernel errors (via debug pod)
    DMESG_ERRORS=$(kubectl debug node/"$NODE" -it --image=busybox -- dmesg 2>/dev/null | grep -ciE "nvrm|xid|gpu|fallen off the bus" || echo "0")
    if [ "$DMESG_ERRORS" -gt "0" ]; then
      add_check "Kernel GPU Errors" "false" "$DMESG_ERRORS GPU-related kernel errors on $NODE"
    else
      add_check "Kernel GPU Errors" "true" "No GPU kernel errors in dmesg"
    fi

    # NVLink status
    NVLINK_OUTPUT=$(kubectl debug node/"$NODE" -it --image=nvidia/cuda:12.2.0-base-ubuntu22.04 -- nvidia-smi nvlink -s 2>/dev/null || echo "")
    if echo "$NVLINK_OUTPUT" | grep -qi "inactive\|error"; then
      add_check "NVLink" "false" "NVLink issues detected on $NODE"
    elif [ -n "$NVLINK_OUTPUT" ]; then
      add_check "NVLink" "true" "NVLink status OK"
    fi
  fi

  # Get GPU count for this node
  GPU_COUNT=$(kubectl get node "$NODE" -o jsonpath='{.status.capacity.nvidia\.com/gpu}' 2>/dev/null || echo "0")

  # Determine final node status
  if echo "$NODE_CHECKS" | grep -q '"passed":false'; then
    if echo "$NODE_CHECKS" | grep -q '"name":"Node Ready","passed":false'; then
      NODE_STATUS="unhealthy"
    else
      NODE_STATUS="degraded"
    fi
  fi

  # Append node JSON
  if [ "$FIRST_NODE" = "true" ]; then FIRST_NODE=false; else RESULTS_JSON="$RESULTS_JSON,"; fi
  RESULTS_JSON="$RESULTS_JSON"'{"nodeName":"'"$NODE"'","status":"'"$NODE_STATUS"'","gpuCount":'"$GPU_COUNT"',"checks":['"$NODE_CHECKS"'],"issues":['"$NODE_ISSUES"']}'
done

RESULTS_JSON="$RESULTS_JSON]}"

# ---- Write results to ConfigMap ----
echo "$RESULTS_JSON" > /tmp/results.json
kubectl create configmap gpu-health-results --from-file=results=/tmp/results.json -n "$NS" --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || echo "WARNING: Could not write results ConfigMap"

NODE_COUNT=$(echo $GPU_NODES | wc -w | tr -d ' ')
echo "GPU Health Check complete: $TOTAL_ISSUES issues found across $NODE_COUNT nodes (Tier $TIER)"
if [ "$TOTAL_ISSUES" -gt "0" ]; then exit 1; fi
`
}

// UninstallGPUHealthCronJob removes the GPU health check CronJob and associated RBAC from a cluster.
func (m *MultiClusterClient) UninstallGPUHealthCronJob(ctx context.Context, contextName, namespace string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	if namespace == "" {
		namespace = gpuHealthDefaultNS
	}

	// Delete CronJob
	if delErr := client.BatchV1().CronJobs(namespace).Delete(ctx, gpuHealthCronJobName, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		return fmt.Errorf("deleting CronJob: %w", delErr)
	}

	// Delete results ConfigMap
	if delErr := client.CoreV1().ConfigMaps(namespace).Delete(ctx, gpuHealthConfigMapName, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn(fmt.Sprintf("[GPUHealthCronJob] Warning: could not delete results ConfigMap: %v", delErr))
	}

	// Delete associated Jobs
	if delErr := client.BatchV1().Jobs(namespace).DeleteCollection(ctx, metav1.DeleteOptions{}, metav1.ListOptions{
		LabelSelector: "app=" + gpuHealthCronJobName,
	}); delErr != nil {
		slog.Warn(fmt.Sprintf("[GPUHealthCronJob] Warning: could not clean up jobs: %v", delErr))
	}

	// Delete ClusterRoleBinding
	if delErr := client.RbacV1().ClusterRoleBindings().Delete(ctx, gpuHealthClusterRoleBinding, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn(fmt.Sprintf("[GPUHealthCronJob] Warning: could not delete ClusterRoleBinding: %v", delErr))
	}

	// Delete ClusterRole
	if delErr := client.RbacV1().ClusterRoles().Delete(ctx, gpuHealthClusterRole, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn(fmt.Sprintf("[GPUHealthCronJob] Warning: could not delete ClusterRole: %v", delErr))
	}

	// Delete ServiceAccount
	if delErr := client.CoreV1().ServiceAccounts(namespace).Delete(ctx, gpuHealthServiceAccount, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn(fmt.Sprintf("[GPUHealthCronJob] Warning: could not delete ServiceAccount: %v", delErr))
	}

	slog.Info(fmt.Sprintf("[GPUHealthCronJob] Uninstalled from cluster %s namespace %s", contextName, namespace))
	return nil
}

// canManageCronJobs checks if the current user has permissions to create/delete CronJobs in the given namespace.
func (m *MultiClusterClient) canManageCronJobs(ctx context.Context, client kubernetes.Interface, namespace string) bool {
	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: namespace,
				Verb:      "create",
				Group:     "batch",
				Resource:  "cronjobs",
			},
		},
	}
	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false
	}
	return result.Status.Allowed
}

// GetNodes returns detailed information about all nodes in a cluster

func (m *MultiClusterClient) GetNVIDIAOperatorStatus(ctx context.Context, contextName string) (*NVIDIAOperatorStatus, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	status := &NVIDIAOperatorStatus{
		Cluster: contextName,
	}

	// GPU Operator ClusterPolicy GVR
	clusterPolicyGVR := schema.GroupVersionResource{
		Group:    "nvidia.com",
		Version:  "v1",
		Resource: "clusterpolicies",
	}

	// Try to get ClusterPolicy (GPU Operator)
	clusterPolicies, err := dynamicClient.Resource(clusterPolicyGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(clusterPolicies.Items) > 0 {
		cp := clusterPolicies.Items[0]
		gpuInfo := &GPUOperatorInfo{
			Installed: true,
		}

		// Get metadata
		if labels := cp.GetLabels(); labels != nil {
			if version, ok := labels["app.kubernetes.io/version"]; ok {
				gpuInfo.Version = version
			}
		}
		gpuInfo.Namespace = cp.GetNamespace()
		if gpuInfo.Namespace == "" {
			gpuInfo.Namespace = "gpu-operator"
		}

		// Get status
		if statusObj, found, _ := unstructuredNestedMap(cp.Object, "status"); found {
			if state, ok := statusObj["state"].(string); ok {
				gpuInfo.State = state
				gpuInfo.Ready = strings.EqualFold(state, "ready")
			}
		}

		// Get driver version from spec
		if spec, found, _ := unstructuredNestedMap(cp.Object, "spec"); found {
			if driver, found, _ := unstructuredNestedMap(spec, "driver"); found {
				if version, ok := driver["version"].(string); ok {
					gpuInfo.DriverVersion = version
				}
			}
			if toolkit, found, _ := unstructuredNestedMap(spec, "toolkit"); found {
				if version, ok := toolkit["version"].(string); ok {
					// CUDA version often embedded in toolkit version
					gpuInfo.CUDAVersion = version
				}
			}
		}

		// Get component states from status.conditions
		if conditions, found, _ := unstructuredNestedSlice(cp.Object, "status", "conditions"); found {
			for _, cond := range conditions {
				if condMap, ok := cond.(map[string]interface{}); ok {
					component := OperatorComponent{}
					if t, ok := condMap["type"].(string); ok {
						component.Name = t
					}
					if status, ok := condMap["status"].(string); ok {
						if strings.EqualFold(status, "True") {
							component.Status = "ready"
						} else {
							component.Status = "pending"
						}
					}
					if reason, ok := condMap["reason"].(string); ok {
						component.Reason = reason
					}
					if component.Name != "" {
						gpuInfo.Components = append(gpuInfo.Components, component)
					}
				}
			}
		}

		status.GPUOperator = gpuInfo
	}

	// Network Operator NicClusterPolicy GVR
	nicClusterPolicyGVR := schema.GroupVersionResource{
		Group:    "mellanox.com",
		Version:  "v1alpha1",
		Resource: "nicclusterpolicies",
	}

	// Try to get NicClusterPolicy (Network Operator)
	nicPolicies, err := dynamicClient.Resource(nicClusterPolicyGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(nicPolicies.Items) > 0 {
		ncp := nicPolicies.Items[0]
		netInfo := &NetworkOperatorInfo{
			Installed: true,
		}

		// Get metadata
		if labels := ncp.GetLabels(); labels != nil {
			if version, ok := labels["app.kubernetes.io/version"]; ok {
				netInfo.Version = version
			}
		}
		netInfo.Namespace = ncp.GetNamespace()
		if netInfo.Namespace == "" {
			netInfo.Namespace = "nvidia-network-operator"
		}

		// Get status
		if statusObj, found, _ := unstructuredNestedMap(ncp.Object, "status"); found {
			if state, ok := statusObj["state"].(string); ok {
				netInfo.State = state
				netInfo.Ready = strings.EqualFold(state, "ready")
			}
		}

		// Get component states
		if conditions, found, _ := unstructuredNestedSlice(ncp.Object, "status", "conditions"); found {
			for _, cond := range conditions {
				if condMap, ok := cond.(map[string]interface{}); ok {
					component := OperatorComponent{}
					if t, ok := condMap["type"].(string); ok {
						component.Name = t
					}
					if status, ok := condMap["status"].(string); ok {
						if strings.EqualFold(status, "True") {
							component.Status = "ready"
						} else {
							component.Status = "pending"
						}
					}
					if reason, ok := condMap["reason"].(string); ok {
						component.Reason = reason
					}
					if component.Name != "" {
						netInfo.Components = append(netInfo.Components, component)
					}
				}
			}
		}

		status.NetworkOperator = netInfo
	}

	return status, nil
}

// Helper function to get nested map from unstructured object
func unstructuredNestedMap(obj map[string]interface{}, fields ...string) (map[string]interface{}, bool, error) {
	var val interface{} = obj
	for _, field := range fields {
		if m, ok := val.(map[string]interface{}); ok {
			var found bool
			val, found = m[field]
			if !found {
				return nil, false, nil
			}
		} else {
			return nil, false, nil
		}
	}
	if result, ok := val.(map[string]interface{}); ok {
		return result, true, nil
	}
	return nil, false, nil
}

// Helper function to get nested slice from unstructured object
func unstructuredNestedSlice(obj map[string]interface{}, fields ...string) ([]interface{}, bool, error) {
	var val interface{} = obj
	for _, field := range fields {
		if m, ok := val.(map[string]interface{}); ok {
			var found bool
			val, found = m[field]
			if !found {
				return nil, false, nil
			}
		} else {
			return nil, false, nil
		}
	}
	if result, ok := val.([]interface{}); ok {
		return result, true, nil
	}
	return nil, false, nil
}
