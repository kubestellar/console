package gpu

// AcceleratorType represents the category of accelerator (GPU, TPU, AIU, XPU)
type AcceleratorType string

const (
	AcceleratorGPU AcceleratorType = "GPU"
	AcceleratorTPU AcceleratorType = "TPU"
	AcceleratorAIU AcceleratorType = "AIU" // Intel Gaudi
	AcceleratorXPU AcceleratorType = "XPU" // Intel XPU
)

// GPUTaint describes a scheduling-gating taint on a GPU node.
// Only taint effects that actually gate pod scheduling (NoSchedule, NoExecute)
// are surfaced — PreferNoSchedule is advisory and is intentionally omitted.
type GPUTaint struct {
	Key    string `json:"key"`
	Value  string `json:"value,omitempty"`
	Effect string `json:"effect"` // NoSchedule or NoExecute
}

// GPUNode represents a node with accelerator resources (GPU, TPU, AIU, XPU)
type GPUNode struct {
	Name            string          `json:"name"`
	Cluster         string          `json:"cluster"`
	GPUType         string          `json:"gpuType"`                   // Display name of accelerator (e.g., "NVIDIA A100", "Intel Gaudi2")
	GPUCount        int             `json:"gpuCount"`                  // Number of accelerators
	GPUAllocated    int             `json:"gpuAllocated"`              // Number of allocated accelerators
	AcceleratorType AcceleratorType `json:"acceleratorType,omitempty"` // GPU, TPU, AIU, or XPU
	// Scheduling-gating taints on the underlying node.
	// Empty when the node has no NoSchedule/NoExecute taints.
	Taints []GPUTaint `json:"taints,omitempty"`
	// Enhanced GPU info from NVIDIA GPU Feature Discovery
	GPUMemoryMB        int    `json:"gpuMemoryMB,omitempty"`        // GPU memory in MB
	GPUFamily          string `json:"gpuFamily,omitempty"`          // GPU architecture family (e.g., ampere, hopper)
	CUDADriverVersion  string `json:"cudaDriverVersion,omitempty"`  // CUDA driver version
	CUDARuntimeVersion string `json:"cudaRuntimeVersion,omitempty"` // CUDA runtime version
	MIGCapable         bool   `json:"migCapable,omitempty"`         // Whether MIG is supported
	MIGStrategy        string `json:"migStrategy,omitempty"`        // MIG strategy if enabled
	Manufacturer       string `json:"manufacturer,omitempty"`       // Manufacturer (NVIDIA, AMD, Intel, Google)
}

// GPUNodeHealthCheck represents a single health check result for a GPU node
type GPUNodeHealthCheck struct {
	Name    string `json:"name"` // e.g., "node_ready", "gpu_feature_discovery"
	Passed  bool   `json:"passed"`
	Message string `json:"message,omitempty"` // e.g., "CrashLoopBackOff (128 restarts)"
}

// GPUNodeHealthStatus represents the proactive health status of a GPU node
type GPUNodeHealthStatus struct {
	NodeName  string               `json:"nodeName"`
	Cluster   string               `json:"cluster"`
	Status    string               `json:"status"` // healthy, degraded, unhealthy
	GPUCount  int                  `json:"gpuCount"`
	GPUType   string               `json:"gpuType"`
	Checks    []GPUNodeHealthCheck `json:"checks"`
	Issues    []string             `json:"issues"`    // human-readable issue list
	StuckPods int                  `json:"stuckPods"` // count of stuck pods on this node
	CheckedAt string               `json:"checkedAt"` // RFC3339 timestamp
}

// GPUHealthCronJobStatus represents the status of the GPU health check CronJob on a cluster
type GPUHealthCronJobStatus struct {
	Installed       bool                   `json:"installed"`
	Cluster         string                 `json:"cluster"`
	Namespace       string                 `json:"namespace,omitempty"`
	Schedule        string                 `json:"schedule,omitempty"`
	Tier            int                    `json:"tier"`                  // 1-4: check depth level
	Version         int                    `json:"version"`               // installed script version
	UpdateAvailable bool                   `json:"updateAvailable"`       // newer script version exists
	LastRun         string                 `json:"lastRun,omitempty"`     // RFC3339 timestamp of last job completion
	LastResult      string                 `json:"lastResult,omitempty"`  // "success" or "failed"
	NextRun         string                 `json:"nextRun,omitempty"`     // RFC3339 timestamp of next scheduled run
	CanInstall      bool                   `json:"canInstall"`            // user has RBAC permissions to manage CronJobs
	ActiveJobs      int                    `json:"activeJobs"`            // currently running jobs
	FailedJobs      int                    `json:"failedJobs"`            // recent failed jobs
	SuccessJobs     int                    `json:"successJobs"`           // recent successful jobs
	LastResults     []GPUHealthCheckResult `json:"lastResults,omitempty"` // structured results from ConfigMap
}

// GPUHealthCheckResult represents health check results for a single GPU node from the CronJob ConfigMap
type GPUHealthCheckResult struct {
	NodeName string               `json:"nodeName"`
	Status   string               `json:"status"` // healthy, degraded, unhealthy
	Checks   []GPUNodeHealthCheck `json:"checks"`
	Issues   []string             `json:"issues"`
}

