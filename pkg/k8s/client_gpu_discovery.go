package k8s

import (
	"context"
	"fmt"
	"log/slog"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (m *MultiClusterClient) GetGPUNodes(ctx context.Context, contextName string) ([]GPUNode, error) {
	nodes, _, err := m.getGPUNodesWithPods(ctx, contextName)
	return nodes, err
}

// getGPUNodesWithPods is the shared implementation of GetGPUNodes that also
// returns the cluster-wide pod list it fetched for allocation accounting.
// Callers that need the same pod list for subsequent analysis (e.g. stuck-pod
// detection in GetGPUNodeHealth, #9339) can reuse it instead of issuing a
// second cluster-wide Pods("").List call.
//
// The returned pod list may be nil on a listing failure; in that case the
// node inventory is still returned with zero allocations and the listing
// error is logged (#9091). Callers that rely on the pod list must handle nil.
func (m *MultiClusterClient) getGPUNodesWithPods(ctx context.Context, contextName string) ([]GPUNode, *corev1.PodList, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, nil, err
	}

	// Fetch all pods once upfront to calculate accelerator allocations per node
	// This is much faster than querying pods per-node for large clusters.
	// A failure here is non-fatal — we still return the node inventory with
	// zero allocations, but we log the error so operators can see RBAC /
	// connectivity problems rather than seeing silently wrong allocation
	// numbers in the UI (issue #9091).
	allPods, allPodsErr := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if allPodsErr != nil {
		slog.Error("[GPUNodes] failed to list pods for allocation accounting",
			"cluster", contextName, "error", allPodsErr)
	}
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
				// Sum GPU requests (NVIDIA, AMD, Intel GPU, Intel Gaudi/Habana)
				// via the shared GPUResourceNames list in gpu_resources.go so this
				// path and the pod-level tracker in client_resources.go cannot
				// drift. Intel Gaudi is classified as AcceleratorGPU, so it rolls
				// into gpuAllocationByNode alongside nvidia/amd/i915.
				gpuAllocationByNode[nodeName] += SumGPURequested(container.Resources.Requests)
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

		// Collect scheduling-gating taints so the UI can offer taint-aware
		// filtering of "available" GPUs. Only NoSchedule and
		// NoExecute gate scheduling; PreferNoSchedule is advisory and is
		// intentionally dropped here.
		var nodeTaints []GPUTaint
		for _, t := range node.Spec.Taints {
			if t.Effect != corev1.TaintEffectNoSchedule && t.Effect != corev1.TaintEffectNoExecute {
				continue
			}
			nodeTaints = append(nodeTaints, GPUTaint{
				Key:    t.Key,
				Value:  t.Value,
				Effect: string(t.Effect),
			})
		}

		gpuNodes = append(gpuNodes, GPUNode{
			Name:               node.Name,
			Cluster:            contextName,
			GPUType:            deviceType,
			GPUCount:           deviceCount,
			GPUAllocated:       allocated,
			AcceleratorType:    accelType,
			Taints:             nodeTaints,
			GPUMemoryMB:        gpuMemoryMB,
			GPUFamily:          gpuFamily,
			CUDADriverVersion:  cudaDriverVersion,
			CUDARuntimeVersion: cudaRuntimeVersion,
			MIGCapable:         migCapable,
			MIGStrategy:        migStrategy,
			Manufacturer:       manufacturer,
		})
	}

	return gpuNodes, allPods, nil
}
