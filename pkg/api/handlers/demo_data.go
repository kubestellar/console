package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
)

// isDemoMode checks if the request has the X-Demo-Mode header set to "true"
// When demo mode is enabled, handlers should return demo data immediately
// without attempting to connect to real clusters
func isDemoMode(c *fiber.Ctx) bool {
	return c.Get("X-Demo-Mode") == "true"
}

// Demo cluster data - matches frontend getDemoClusters() for consistency
func getDemoClusters() []k8s.ClusterInfo {
	return []k8s.ClusterInfo{
		{Name: "kind-local", Context: "kind-local", Healthy: true, Source: "kubeconfig", NodeCount: 1, PodCount: 15},
		{Name: "minikube", Context: "minikube", Healthy: true, Source: "kubeconfig", NodeCount: 1, PodCount: 12},
		{Name: "k3s-edge", Context: "k3s-edge", Healthy: true, Source: "kubeconfig", NodeCount: 3, PodCount: 28},
		{Name: "eks-prod-us-east-1", Context: "eks-prod", Healthy: true, Source: "kubeconfig", NodeCount: 12, PodCount: 156, Server: "https://ABC123.gr7.us-east-1.eks.amazonaws.com"},
		{Name: "gke-staging", Context: "gke-staging", Healthy: true, Source: "kubeconfig", NodeCount: 6, PodCount: 78},
		{Name: "aks-dev-westeu", Context: "aks-dev", Healthy: true, Source: "kubeconfig", NodeCount: 4, PodCount: 45, Server: "https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443"},
		{Name: "openshift-prod", Context: "ocp-prod", Healthy: true, Source: "kubeconfig", NodeCount: 9, PodCount: 234, Server: "api.openshift-prod.example.com:6443"},
		{Name: "oci-oke-phoenix", Context: "oke-phoenix", Healthy: true, Source: "kubeconfig", NodeCount: 5, PodCount: 67, Server: "https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443"},
		{Name: "alibaba-ack-shanghai", Context: "ack-shanghai", Healthy: false, Source: "kubeconfig", NodeCount: 8, PodCount: 112},
		{Name: "do-nyc1-prod", Context: "do-nyc1", Healthy: true, Source: "kubeconfig", NodeCount: 3, PodCount: 34},
		{Name: "rancher-mgmt", Context: "rancher-mgmt", Healthy: true, Source: "kubeconfig", NodeCount: 3, PodCount: 89},
		{Name: "vllm-gpu-cluster", Context: "vllm-d", Healthy: true, Source: "kubeconfig", NodeCount: 8, PodCount: 124},
	}
}

// Demo cluster health data
func getDemoClusterHealth(cluster string) *k8s.ClusterHealth {
	healthMap := map[string]*k8s.ClusterHealth{
		"kind-local":           {Cluster: "kind-local", Healthy: true, Reachable: true, NodeCount: 1, PodCount: 15, CpuCores: 4, MemoryGB: 8},
		"minikube":             {Cluster: "minikube", Healthy: true, Reachable: true, NodeCount: 1, PodCount: 12, CpuCores: 2, MemoryGB: 4},
		"k3s-edge":             {Cluster: "k3s-edge", Healthy: true, Reachable: true, NodeCount: 3, PodCount: 28, CpuCores: 6, MemoryGB: 12},
		"eks-prod-us-east-1":   {Cluster: "eks-prod-us-east-1", Healthy: true, Reachable: true, NodeCount: 12, PodCount: 156, CpuCores: 96, MemoryGB: 384},
		"gke-staging":          {Cluster: "gke-staging", Healthy: true, Reachable: true, NodeCount: 6, PodCount: 78, CpuCores: 48, MemoryGB: 192},
		"aks-dev-westeu":       {Cluster: "aks-dev-westeu", Healthy: true, Reachable: true, NodeCount: 4, PodCount: 45, CpuCores: 32, MemoryGB: 128},
		"openshift-prod":       {Cluster: "openshift-prod", Healthy: true, Reachable: true, NodeCount: 9, PodCount: 234, CpuCores: 72, MemoryGB: 288},
		"oci-oke-phoenix":      {Cluster: "oci-oke-phoenix", Healthy: true, Reachable: true, NodeCount: 5, PodCount: 67, CpuCores: 40, MemoryGB: 160},
		"alibaba-ack-shanghai": {Cluster: "alibaba-ack-shanghai", Healthy: false, Reachable: true, NodeCount: 8, PodCount: 112, CpuCores: 64, MemoryGB: 256},
		"do-nyc1-prod":         {Cluster: "do-nyc1-prod", Healthy: true, Reachable: true, NodeCount: 3, PodCount: 34, CpuCores: 12, MemoryGB: 48},
		"rancher-mgmt":         {Cluster: "rancher-mgmt", Healthy: true, Reachable: true, NodeCount: 3, PodCount: 89, CpuCores: 24, MemoryGB: 96},
		"vllm-gpu-cluster":     {Cluster: "vllm-gpu-cluster", Healthy: true, Reachable: true, NodeCount: 8, PodCount: 124, CpuCores: 256, MemoryGB: 2048},
	}
	if health, ok := healthMap[cluster]; ok {
		return health
	}
	// Return default health for unknown clusters
	return &k8s.ClusterHealth{Cluster: cluster, Healthy: true, Reachable: true, NodeCount: 3, PodCount: 25, CpuCores: 12, MemoryGB: 48}
}

// Demo pod data
func getDemoPods() []k8s.PodInfo {
	return []k8s.PodInfo{
		{Name: "frontend-7d8f9b6c5d-x2k4m", Namespace: "production", Cluster: "eks-prod-us-east-1", Status: "Running", Ready: "1/1", Restarts: 0, Age: "3d"},
		{Name: "api-server-5f6g7h8i9j-a1b2c", Namespace: "production", Cluster: "eks-prod-us-east-1", Status: "Running", Ready: "1/1", Restarts: 1, Age: "2d"},
		{Name: "worker-84d5f6g7h8-k3l4m", Namespace: "production", Cluster: "gke-staging", Status: "Running", Ready: "1/1", Restarts: 0, Age: "1d"},
		{Name: "redis-cache-0", Namespace: "cache", Cluster: "eks-prod-us-east-1", Status: "Running", Ready: "1/1", Restarts: 0, Age: "7d"},
		{Name: "postgres-0", Namespace: "database", Cluster: "aks-dev-westeu", Status: "Running", Ready: "1/1", Restarts: 0, Age: "14d"},
		{Name: "nginx-ingress-controller-abc12", Namespace: "ingress-nginx", Cluster: "openshift-prod", Status: "Running", Ready: "1/1", Restarts: 2, Age: "30d"},
		{Name: "prometheus-server-0", Namespace: "monitoring", Cluster: "rancher-mgmt", Status: "Running", Ready: "1/1", Restarts: 0, Age: "7d"},
		{Name: "grafana-6f7g8h9i0j-p5q6r", Namespace: "monitoring", Cluster: "rancher-mgmt", Status: "Running", Ready: "1/1", Restarts: 0, Age: "7d"},
		{Name: "vllm-inference-0", Namespace: "ai-workloads", Cluster: "vllm-gpu-cluster", Status: "Running", Ready: "1/1", Restarts: 0, Age: "12h"},
		{Name: "vllm-inference-1", Namespace: "ai-workloads", Cluster: "vllm-gpu-cluster", Status: "Running", Ready: "1/1", Restarts: 0, Age: "12h"},
	}
}

// Demo pod issues
func getDemoPodIssues() []k8s.PodIssue {
	return []k8s.PodIssue{
		{Name: "worker-crashed-abc12", Namespace: "production", Cluster: "gke-staging", Status: "CrashLoopBackOff", Reason: "Container crash", Issues: []string{"Back-off restarting failed container"}, Restarts: 15},
		{Name: "api-pending-xyz89", Namespace: "staging", Cluster: "aks-dev-westeu", Status: "Pending", Reason: "Insufficient memory", Issues: []string{"0/4 nodes available: insufficient memory"}, Restarts: 0},
		{Name: "batch-job-failed-123", Namespace: "batch", Cluster: "eks-prod-us-east-1", Status: "Error", Reason: "Container exited", Issues: []string{"Container exited with code 1"}, Restarts: 3},
		{Name: "oom-killed-pod-456", Namespace: "production", Cluster: "openshift-prod", Status: "OOMKilled", Reason: "OOM", Issues: []string{"Container was killed due to OOM"}, Restarts: 8},
	}
}

// Demo events
func getDemoEvents() []k8s.Event {
	return []k8s.Event{
		{Type: "Normal", Reason: "Scheduled", Message: "Successfully assigned production/frontend-7d8f9b6c5d-x2k4m to node-1", Namespace: "production", Cluster: "eks-prod-us-east-1", Age: "1h", Count: 1},
		{Type: "Normal", Reason: "Pulled", Message: "Container image already present on machine", Namespace: "production", Cluster: "eks-prod-us-east-1", Age: "1h", Count: 1},
		{Type: "Normal", Reason: "Started", Message: "Started container frontend", Namespace: "production", Cluster: "eks-prod-us-east-1", Age: "1h", Count: 1},
		{Type: "Warning", Reason: "BackOff", Message: "Back-off restarting failed container", Namespace: "production", Cluster: "gke-staging", Age: "30m", Count: 15},
		{Type: "Warning", Reason: "FailedScheduling", Message: "0/3 nodes are available: insufficient memory", Namespace: "staging", Cluster: "aks-dev-westeu", Age: "15m", Count: 5},
		{Type: "Normal", Reason: "ScalingReplicaSet", Message: "Scaled up replica set api-server-5f6g7h8i9j to 3", Namespace: "production", Cluster: "eks-prod-us-east-1", Age: "2h", Count: 1},
		{Type: "Warning", Reason: "Unhealthy", Message: "Readiness probe failed: connection refused", Namespace: "monitoring", Cluster: "rancher-mgmt", Age: "45m", Count: 3},
		{Type: "Normal", Reason: "SuccessfulCreate", Message: "Created pod: batch-job-abc123", Namespace: "batch", Cluster: "openshift-prod", Age: "3h", Count: 1},
	}
}

// Demo warning events (filtered from events)
func getDemoWarningEvents() []k8s.Event {
	events := getDemoEvents()
	var warnings []k8s.Event
	for _, e := range events {
		if e.Type == "Warning" {
			warnings = append(warnings, e)
		}
	}
	return warnings
}

// Demo nodes
func getDemoNodes() []k8s.NodeInfo {
	return []k8s.NodeInfo{
		{Name: "node-1", Cluster: "eks-prod-us-east-1", Status: "Ready", Roles: []string{"worker"}, CPUCapacity: "8", MemoryCapacity: "32Gi", GPUCount: 0},
		{Name: "node-2", Cluster: "eks-prod-us-east-1", Status: "Ready", Roles: []string{"worker"}, CPUCapacity: "8", MemoryCapacity: "32Gi", GPUCount: 0},
		{Name: "node-3", Cluster: "eks-prod-us-east-1", Status: "Ready", Roles: []string{"worker"}, CPUCapacity: "8", MemoryCapacity: "32Gi", GPUCount: 0},
		{Name: "gpu-node-1", Cluster: "vllm-gpu-cluster", Status: "Ready", Roles: []string{"worker"}, CPUCapacity: "32", MemoryCapacity: "256Gi", GPUCount: 8, GPUType: "nvidia.com/gpu"},
		{Name: "gpu-node-2", Cluster: "vllm-gpu-cluster", Status: "Ready", Roles: []string{"worker"}, CPUCapacity: "32", MemoryCapacity: "256Gi", GPUCount: 8, GPUType: "nvidia.com/gpu"},
		{Name: "worker-1", Cluster: "gke-staging", Status: "Ready", Roles: []string{"worker"}, CPUCapacity: "4", MemoryCapacity: "16Gi", GPUCount: 0},
		{Name: "worker-2", Cluster: "gke-staging", Status: "NotReady", Roles: []string{"worker"}, CPUCapacity: "4", MemoryCapacity: "16Gi", GPUCount: 0},
	}
}

// Demo deployments
func getDemoDeployments() []k8s.Deployment {
	return []k8s.Deployment{
		{Name: "frontend", Namespace: "production", Cluster: "eks-prod-us-east-1", Status: "running", Replicas: 3, ReadyReplicas: 3, UpdatedReplicas: 3, AvailableReplicas: 3, Progress: 100},
		{Name: "api-server", Namespace: "production", Cluster: "eks-prod-us-east-1", Status: "running", Replicas: 5, ReadyReplicas: 5, UpdatedReplicas: 5, AvailableReplicas: 5, Progress: 100},
		{Name: "worker", Namespace: "production", Cluster: "gke-staging", Status: "deploying", Replicas: 2, ReadyReplicas: 1, UpdatedReplicas: 2, AvailableReplicas: 1, Progress: 50},
		{Name: "nginx-ingress-controller", Namespace: "ingress-nginx", Cluster: "openshift-prod", Status: "running", Replicas: 2, ReadyReplicas: 2, UpdatedReplicas: 2, AvailableReplicas: 2, Progress: 100},
		{Name: "prometheus", Namespace: "monitoring", Cluster: "rancher-mgmt", Status: "running", Replicas: 1, ReadyReplicas: 1, UpdatedReplicas: 1, AvailableReplicas: 1, Progress: 100},
		{Name: "grafana", Namespace: "monitoring", Cluster: "rancher-mgmt", Status: "running", Replicas: 1, ReadyReplicas: 1, UpdatedReplicas: 1, AvailableReplicas: 1, Progress: 100},
	}
}

// Demo deployment issues
func getDemoDeploymentIssues() []k8s.DeploymentIssue {
	return []k8s.DeploymentIssue{
		{Name: "worker", Namespace: "production", Cluster: "gke-staging", Replicas: 2, ReadyReplicas: 1, Reason: "ReplicasMismatch", Message: "Only 1 of 2 replicas are ready"},
		{Name: "batch-processor", Namespace: "batch", Cluster: "eks-prod-us-east-1", Replicas: 3, ReadyReplicas: 0, Reason: "ImagePullBackOff", Message: "Failed to pull image"},
	}
}

// Demo services
func getDemoServices() []k8s.Service {
	return []k8s.Service{
		{Name: "frontend-svc", Namespace: "production", Cluster: "eks-prod-us-east-1", Type: "LoadBalancer", ClusterIP: "10.0.0.1", Ports: []string{"80:30080/TCP", "443:30443/TCP"}},
		{Name: "api-server-svc", Namespace: "production", Cluster: "eks-prod-us-east-1", Type: "ClusterIP", ClusterIP: "10.0.0.2", Ports: []string{"8080/TCP"}},
		{Name: "redis-svc", Namespace: "cache", Cluster: "eks-prod-us-east-1", Type: "ClusterIP", ClusterIP: "10.0.0.3", Ports: []string{"6379/TCP"}},
		{Name: "postgres-svc", Namespace: "database", Cluster: "aks-dev-westeu", Type: "ClusterIP", ClusterIP: "10.0.0.4", Ports: []string{"5432/TCP"}},
	}
}

// Demo security issues
func getDemoSecurityIssues() []k8s.SecurityIssue {
	return []k8s.SecurityIssue{
		{Name: "frontend-7d8f9b6c5d-x2k4m", Namespace: "production", Cluster: "eks-prod-us-east-1", Issue: "RunningAsRoot", Severity: "high", Details: "Container is running as root user"},
		{Name: "api-server", Namespace: "production", Cluster: "eks-prod-us-east-1", Issue: "NoResourceLimits", Severity: "medium", Details: "No CPU/memory limits defined"},
		{Name: "batch-job", Namespace: "batch", Cluster: "gke-staging", Issue: "PrivilegedContainer", Severity: "critical", Details: "Container is running in privileged mode"},
		{Name: "debug-pod", Namespace: "default", Cluster: "aks-dev-westeu", Issue: "HostNetwork", Severity: "high", Details: "Pod is using host network"},
	}
}

// Demo jobs
func getDemoJobs() []k8s.Job {
	return []k8s.Job{
		{Name: "data-migration-job", Namespace: "batch", Cluster: "eks-prod-us-east-1", Status: "Complete", Completions: "1/1", Duration: "2m30s", Age: "2h"},
		{Name: "backup-job", Namespace: "backup", Cluster: "openshift-prod", Status: "Complete", Completions: "1/1", Duration: "5m12s", Age: "6h"},
		{Name: "report-generator", Namespace: "analytics", Cluster: "gke-staging", Status: "Running", Completions: "2/3", Duration: "1h2m", Age: "1h"},
	}
}

// Demo HPAs
func getDemoHPAs() []k8s.HPA {
	return []k8s.HPA{
		{Name: "frontend-hpa", Namespace: "production", Cluster: "eks-prod-us-east-1", Reference: "deployment/frontend", MinReplicas: 2, MaxReplicas: 10, CurrentReplicas: 3, TargetCPU: "70%", CurrentCPU: "45%"},
		{Name: "api-server-hpa", Namespace: "production", Cluster: "eks-prod-us-east-1", Reference: "deployment/api-server", MinReplicas: 3, MaxReplicas: 20, CurrentReplicas: 5, TargetCPU: "75%", CurrentCPU: "62%"},
		{Name: "worker-hpa", Namespace: "production", Cluster: "gke-staging", Reference: "deployment/worker", MinReplicas: 1, MaxReplicas: 5, CurrentReplicas: 2, TargetCPU: "80%", CurrentCPU: "85%"},
	}
}

// Demo ConfigMaps
func getDemoConfigMaps() []k8s.ConfigMap {
	return []k8s.ConfigMap{
		{Name: "app-config", Namespace: "production", Cluster: "eks-prod-us-east-1", DataCount: 2, Age: "30d"},
		{Name: "nginx-config", Namespace: "ingress-nginx", Cluster: "openshift-prod", DataCount: 1, Age: "60d"},
		{Name: "prometheus-config", Namespace: "monitoring", Cluster: "rancher-mgmt", DataCount: 2, Age: "14d"},
	}
}

// Demo Secrets (names only, no actual secret data)
func getDemoSecrets() []k8s.Secret {
	return []k8s.Secret{
		{Name: "db-credentials", Namespace: "database", Cluster: "aks-dev-westeu", Type: "Opaque", DataCount: 2},
		{Name: "tls-cert", Namespace: "ingress-nginx", Cluster: "openshift-prod", Type: "kubernetes.io/tls", DataCount: 2},
		{Name: "docker-registry", Namespace: "production", Cluster: "eks-prod-us-east-1", Type: "kubernetes.io/dockerconfigjson", DataCount: 1},
		{Name: "api-token", Namespace: "production", Cluster: "eks-prod-us-east-1", Type: "Opaque", DataCount: 1},
	}
}

// Demo ServiceAccounts
func getDemoServiceAccounts() []k8s.ServiceAccount {
	return []k8s.ServiceAccount{
		{Name: "default", Namespace: "production", Cluster: "eks-prod-us-east-1"},
		{Name: "prometheus", Namespace: "monitoring", Cluster: "rancher-mgmt"},
		{Name: "nginx-ingress", Namespace: "ingress-nginx", Cluster: "openshift-prod"},
		{Name: "batch-runner", Namespace: "batch", Cluster: "gke-staging"},
	}
}

// Demo PVCs
func getDemoPVCs() []k8s.PVC {
	return []k8s.PVC{
		{Name: "postgres-data", Namespace: "database", Cluster: "aks-dev-westeu", Status: "Bound", Capacity: "100Gi", StorageClass: "standard"},
		{Name: "redis-data", Namespace: "cache", Cluster: "eks-prod-us-east-1", Status: "Bound", Capacity: "10Gi", StorageClass: "gp2"},
		{Name: "prometheus-data", Namespace: "monitoring", Cluster: "rancher-mgmt", Status: "Bound", Capacity: "50Gi", StorageClass: "standard"},
		{Name: "model-cache", Namespace: "ai-workloads", Cluster: "vllm-gpu-cluster", Status: "Bound", Capacity: "500Gi", StorageClass: "fast-ssd"},
	}
}

// Demo PVs
func getDemoPVs() []k8s.PV {
	return []k8s.PV{
		{Name: "pv-postgres-data", Cluster: "aks-dev-westeu", Capacity: "100Gi", Status: "Bound", StorageClass: "standard", ReclaimPolicy: "Retain"},
		{Name: "pv-redis-data", Cluster: "eks-prod-us-east-1", Capacity: "10Gi", Status: "Bound", StorageClass: "gp2", ReclaimPolicy: "Delete"},
		{Name: "pv-prometheus-data", Cluster: "rancher-mgmt", Capacity: "50Gi", Status: "Bound", StorageClass: "standard", ReclaimPolicy: "Retain"},
		{Name: "pv-model-cache", Cluster: "vllm-gpu-cluster", Capacity: "500Gi", Status: "Bound", StorageClass: "fast-ssd", ReclaimPolicy: "Retain"},
	}
}

// Demo ResourceQuotas
func getDemoResourceQuotas() []k8s.ResourceQuota {
	return []k8s.ResourceQuota{
		{Name: "production-quota", Namespace: "production", Cluster: "eks-prod-us-east-1", Hard: map[string]string{"cpu": "100", "memory": "200Gi", "pods": "100"}, Used: map[string]string{"cpu": "45", "memory": "120Gi", "pods": "67"}},
		{Name: "staging-quota", Namespace: "staging", Cluster: "gke-staging", Hard: map[string]string{"cpu": "20", "memory": "40Gi", "pods": "50"}, Used: map[string]string{"cpu": "8", "memory": "16Gi", "pods": "23"}},
	}
}

// Demo LimitRanges
func getDemoLimitRanges() []k8s.LimitRange {
	return []k8s.LimitRange{
		{Name: "default-limits", Namespace: "production", Cluster: "eks-prod-us-east-1", Limits: []k8s.LimitRangeItem{{Type: "Container", Default: map[string]string{"cpu": "500m", "memory": "512Mi"}}}},
		{Name: "staging-limits", Namespace: "staging", Cluster: "gke-staging", Limits: []k8s.LimitRangeItem{{Type: "Container", Default: map[string]string{"cpu": "250m", "memory": "256Mi"}}}},
	}
}

// Demo GPU nodes
func getDemoGPUNodeHealth() []k8s.GPUNodeHealthStatus {
	return []k8s.GPUNodeHealthStatus{
		{
			NodeName: "gpu-node-1", Cluster: "vllm-gpu-cluster", Status: "healthy",
			GPUCount: 8, GPUType: "NVIDIA A100-SXM4-80GB",
			Checks: []k8s.GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "scheduling", Passed: true},
				{Name: "gpu-feature-discovery", Passed: true},
				{Name: "nvidia-device-plugin", Passed: true},
				{Name: "dcgm-exporter", Passed: true},
				{Name: "stuck_pods", Passed: true},
				{Name: "gpu_events", Passed: true},
			},
			CheckedAt: "2026-02-18T12:00:00Z",
		},
		{
			NodeName: "gpu-node-2", Cluster: "vllm-gpu-cluster", Status: "degraded",
			GPUCount: 8, GPUType: "NVIDIA A100-SXM4-80GB",
			Checks: []k8s.GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "scheduling", Passed: true},
				{Name: "gpu-feature-discovery", Passed: false, Message: "CrashLoopBackOff (12 restarts)"},
				{Name: "nvidia-device-plugin", Passed: true},
				{Name: "dcgm-exporter", Passed: true},
				{Name: "stuck_pods", Passed: true},
				{Name: "gpu_events", Passed: true},
			},
			Issues:    []string{"gpu-feature-discovery: CrashLoopBackOff (12 restarts)"},
			CheckedAt: "2026-02-18T12:00:00Z",
		},
		{
			NodeName: "gpu-node-3", Cluster: "eks-prod-us-east-1", Status: "unhealthy",
			GPUCount: 4, GPUType: "NVIDIA V100",
			Checks: []k8s.GPUNodeHealthCheck{
				{Name: "node_ready", Passed: false, Message: "Node is NotReady"},
				{Name: "scheduling", Passed: false, Message: "Node is cordoned (SchedulingDisabled)"},
				{Name: "gpu-feature-discovery", Passed: false, Message: "CrashLoopBackOff (128 restarts)"},
				{Name: "nvidia-device-plugin", Passed: false, Message: "CrashLoopBackOff (64 restarts)"},
				{Name: "dcgm-exporter", Passed: true},
				{Name: "stuck_pods", Passed: false, Message: "54 pods stuck (ContainerStatusUnknown/Terminating)"},
				{Name: "gpu_events", Passed: false, Message: "3 GPU warning events in last hour"},
			},
			Issues:    []string{"Node is NotReady", "Node is cordoned", "gpu-feature-discovery: CrashLoopBackOff (128 restarts)", "nvidia-device-plugin: CrashLoopBackOff (64 restarts)", "54 pods stuck (ContainerStatusUnknown/Terminating)", "3 GPU warning events in last hour"},
			StuckPods: 54,
			CheckedAt: "2026-02-18T12:00:00Z",
		},
	}
}

func getDemoGPUNodes() []k8s.GPUNode {
	return []k8s.GPUNode{
		{Name: "gpu-node-1", Cluster: "vllm-gpu-cluster", GPUCount: 8, GPUType: "nvidia.com/gpu", GPUAllocated: 6, GPUMemoryMB: 81920, GPUFamily: "ampere", Manufacturer: "NVIDIA"},
		{Name: "gpu-node-2", Cluster: "vllm-gpu-cluster", GPUCount: 8, GPUType: "nvidia.com/gpu", GPUAllocated: 4, GPUMemoryMB: 81920, GPUFamily: "ampere", Manufacturer: "NVIDIA"},
		{Name: "gpu-node-3", Cluster: "eks-prod-us-east-1", GPUCount: 4, GPUType: "nvidia.com/gpu", GPUAllocated: 2, GPUMemoryMB: 16384, GPUFamily: "volta", Manufacturer: "NVIDIA"},
	}
}

// Demo NVIDIA Operator Status
func getDemoNVIDIAOperatorStatus() []*k8s.NVIDIAOperatorStatus {
	return []*k8s.NVIDIAOperatorStatus{
		{
			Cluster: "vllm-gpu-cluster",
			GPUOperator: &k8s.GPUOperatorInfo{
				Installed:     true,
				Version:       "v23.9.1",
				State:         "ready",
				Ready:         true,
				DriverVersion: "535.104.12",
				CUDAVersion:   "12.2",
				Namespace:     "gpu-operator",
			},
			NetworkOperator: &k8s.NetworkOperatorInfo{
				Installed: true,
				Version:   "v23.10.0",
				State:     "ready",
				Ready:     true,
				Namespace: "nvidia-network-operator",
			},
		},
	}
}

// Demo pod logs
func getDemoPodLogs() string {
	return `2024-01-15T10:30:00Z INFO  Starting application...
2024-01-15T10:30:01Z INFO  Loading configuration from /etc/config/app.yaml
2024-01-15T10:30:02Z INFO  Connecting to database at postgres-svc:5432
2024-01-15T10:30:03Z INFO  Database connection established
2024-01-15T10:30:04Z INFO  Starting HTTP server on :8080
2024-01-15T10:30:05Z INFO  Server is ready to accept connections
2024-01-15T10:31:00Z INFO  Health check passed
2024-01-15T10:32:00Z INFO  Health check passed
2024-01-15T10:33:00Z INFO  Health check passed
2024-01-15T10:34:15Z INFO  Received request: GET /api/v1/users
2024-01-15T10:34:16Z INFO  Request completed in 45ms`
}

// getDemoAllClusterHealth returns health for all demo clusters
func getDemoAllClusterHealth() []k8s.ClusterHealth {
	clusters := getDemoClusters()
	var health []k8s.ClusterHealth
	for _, c := range clusters {
		h := getDemoClusterHealth(c.Name)
		health = append(health, *h)
	}
	return health
}

// Helper function to return demo data response
func demoResponse(c *fiber.Ctx, key string, data interface{}) error {
	return c.JSON(fiber.Map{key: data, "source": "demo"})
}
