package k8s

// GPU health CronJob constants
const (
	gpuHealthCronJobName        = "gpu-health-check"
	gpuHealthServiceAccount     = "gpu-health-checker"
	gpuHealthClusterRole        = "gpu-health-checker"
	gpuHealthClusterRoleBinding = "gpu-health-checker"
	gpuHealthDefaultSchedule    = "*/5 * * * *" // every 5 minutes
	gpuHealthDefaultNS          = "nvidia-gpu-operator"
	// Supply-chain hardening (#6693): pin the GPU health checker image by
	// digest so a compromised or unexpected :latest retag cannot change the
	// binary that runs as cluster-admin via the configured RBAC.
	gpuHealthCheckerImage  = "bitnami/kubectl@sha256:59ad45e8bd79e7af7592ff2852b32adcb0da50792bc52ce44679d5c5f1b4d415"
	gpuHealthConfigMapName = "gpu-health-results"
	gpuHealthScriptVersion = 2 // bump when script changes
	gpuHealthDefaultTier   = 2 // standard tier by default
)
