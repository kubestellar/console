package k8s

import "github.com/kubestellar/console/pkg/k8s/gpu"

// Type aliases for backward compatibility — all GPU types now live in pkg/k8s/gpu.
type (
	AcceleratorType         = gpu.AcceleratorType
	GPUTaint                = gpu.GPUTaint
	GPUNode                 = gpu.GPUNode
	GPUNodeHealthCheck      = gpu.GPUNodeHealthCheck
	GPUNodeHealthStatus     = gpu.GPUNodeHealthStatus
	GPUHealthCronJobStatus  = gpu.GPUHealthCronJobStatus
	GPUHealthCheckResult    = gpu.GPUHealthCheckResult
)

// Accelerator type constants re-exported for backward compatibility.
const (
	AcceleratorGPU = gpu.AcceleratorGPU
	AcceleratorTPU = gpu.AcceleratorTPU
	AcceleratorAIU = gpu.AcceleratorAIU
	AcceleratorXPU = gpu.AcceleratorXPU
)

// GPU resource functions re-exported for backward compatibility.
var (
	GPUResourceNames  = gpu.GPUResourceNames
	IsGPUResourceName = gpu.IsGPUResourceName
	SumGPURequested   = gpu.SumGPURequested
)
