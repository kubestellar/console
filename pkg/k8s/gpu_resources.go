package k8s

import (
	corev1 "k8s.io/api/core/v1"
)

// GPUResourceNames lists every Kubernetes resource name the console treats
// as a "GPU" / AI accelerator for tracking purposes. Single source of truth
// shared between:
//   - client_resources.go (pod-level GPURequested sums)
//   - client_gpu.go (node-level inventory sums)
//
// Both paths must read from the same list so pod views and node views can't
// drift (Issue 9090). Keep this sorted by vendor for readability.
var GPUResourceNames = []corev1.ResourceName{
	"nvidia.com/gpu",
	"amd.com/gpu",
	"gpu.intel.com/i915",
	"habana.ai/gaudi",
	"habana.ai/gaudi2",
	"intel.com/gaudi",
}

// IsGPUResourceName reports whether the given Kubernetes resource name is a
// known GPU / AI accelerator. Exact match; no vendor-prefix heuristics.
func IsGPUResourceName(name corev1.ResourceName) bool {
	for _, n := range GPUResourceNames {
		if name == n {
			return true
		}
	}
	return false
}

// SumGPURequested returns the total count of GPU / accelerator devices
// requested by a container's resource map across ALL known GPU resource
// names. This matters when a single container requests more than one
// accelerator type (e.g., nvidia.com/gpu=1 and habana.ai/gaudi=2) — the
// previous GetPods loop overwrote per-name, so the final value depended on
// map iteration order and undercounted the total.
func SumGPURequested(rl corev1.ResourceList) int {
	total := 0
	for _, name := range GPUResourceNames {
		if qty, ok := rl[name]; ok {
			total += int(qty.Value())
		}
	}
	return total
}
