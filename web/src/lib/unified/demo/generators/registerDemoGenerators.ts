/**
 * Register Demo Data Generators
 *
 * This file registers all existing demo data generators with the
 * unified demo system. Call registerAllDemoGenerators() at app startup.
 */

import { registerDemoDataBatch } from '../demoDataRegistry'
import type { DemoDataEntry } from '../types'

// Import existing demo data functions (these are scattered across the codebase)
// We'll reference them here for registration

/**
 * Demo cluster data - 12 clusters with varied providers
 */
function getDemoClusters() {
  return [
    { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50, distribution: 'kind' },
    { name: 'minikube', context: 'minikube', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20, distribution: 'minikube' },
    { name: 'k3s-edge', context: 'k3s-edge', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100, distribution: 'k3s' },
    { name: 'eks-prod-us-east-1', context: 'eks-prod', healthy: true, source: 'kubeconfig', nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000, server: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', distribution: 'eks' },
    { name: 'gke-staging', context: 'gke-staging', healthy: true, source: 'kubeconfig', nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000, distribution: 'gke' },
    { name: 'aks-dev-westeu', context: 'aks-dev', healthy: true, source: 'kubeconfig', nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500, server: 'https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443', distribution: 'aks' },
    { name: 'openshift-prod', context: 'ocp-prod', healthy: true, source: 'kubeconfig', nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500, server: 'api.openshift-prod.example.com:6443', distribution: 'openshift' },
    { name: 'oci-oke-phoenix', context: 'oke-phoenix', healthy: true, source: 'kubeconfig', nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800, server: 'https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: 'oci' },
    { name: 'alibaba-ack-shanghai', context: 'ack-shanghai', healthy: false, source: 'kubeconfig', nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200, distribution: 'alibaba' },
    { name: 'do-nyc1-prod', context: 'do-nyc1', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300, distribution: 'digitalocean' },
    { name: 'rancher-mgmt', context: 'rancher-mgmt', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400, distribution: 'rancher' },
    { name: 'vllm-gpu-cluster', context: 'vllm-d', healthy: true, source: 'kubeconfig', nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000, distribution: 'kubernetes' },
  ]
}

/**
 * Demo pod issues data
 */
function getDemoPodIssues() {
  return [
    { name: 'api-gateway-7d9f5b8c4-xk2vm', namespace: 'production', cluster: 'eks-prod-us-east-1', status: 'CrashLoopBackOff', restarts: 15, message: 'Container exited with code 137 (OOMKilled)' },
    { name: 'worker-processor-5c8d7b6f9-ln3mp', namespace: 'batch', cluster: 'gke-staging', status: 'ImagePullBackOff', restarts: 0, message: 'Failed to pull image: unauthorized' },
    { name: 'cache-redis-0', namespace: 'cache', cluster: 'aks-dev-westeu', status: 'Pending', restarts: 0, message: 'Insufficient memory' },
    { name: 'ml-inference-7f8c9d5e3-qr4st', namespace: 'ai', cluster: 'vllm-gpu-cluster', status: 'Error', restarts: 3, message: 'GPU allocation failed' },
    { name: 'logging-fluentd-ds-abc12', namespace: 'logging', cluster: 'openshift-prod', status: 'CrashLoopBackOff', restarts: 8, message: 'Config validation failed' },
  ]
}

/**
 * Demo deployment issues data
 */
function getDemoDeploymentIssues() {
  return [
    { name: 'api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', replicas: '2/3', status: 'Degraded', message: '1 pod failing health checks' },
    { name: 'auth-service', namespace: 'auth', cluster: 'gke-staging', replicas: '0/2', status: 'Failed', message: 'All pods in CrashLoopBackOff' },
    { name: 'notification-service', namespace: 'notifications', cluster: 'aks-dev-westeu', replicas: '1/3', status: 'Progressing', message: 'Rolling update in progress' },
  ]
}

/**
 * Demo events data
 */
function getDemoEvents() {
  const now = Date.now()
  return [
    { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', name: 'api-gateway-7d9f5b8c4-xk2vm', namespace: 'production' }, cluster: 'eks-prod-us-east-1', timestamp: now - 60000 },
    { type: 'Warning', reason: 'FailedScheduling', message: 'Insufficient memory', involvedObject: { kind: 'Pod', name: 'cache-redis-0', namespace: 'cache' }, cluster: 'aks-dev-westeu', timestamp: now - 120000 },
    { type: 'Normal', reason: 'Pulled', message: 'Successfully pulled image', involvedObject: { kind: 'Pod', name: 'web-frontend-5c4d3b2a1-mn9op', namespace: 'frontend' }, cluster: 'gke-staging', timestamp: now - 180000 },
    { type: 'Normal', reason: 'ScalingReplicaSet', message: 'Scaled up replica set to 3', involvedObject: { kind: 'Deployment', name: 'notification-service', namespace: 'notifications' }, cluster: 'aks-dev-westeu', timestamp: now - 300000 },
    { type: 'Warning', reason: 'Unhealthy', message: 'Liveness probe failed', involvedObject: { kind: 'Pod', name: 'worker-processor-5c8d7b6f9-ln3mp', namespace: 'batch' }, cluster: 'gke-staging', timestamp: now - 600000 },
  ]
}

/**
 * Demo security issues data
 */
function getDemoSecurityIssues() {
  return [
    { severity: 'critical', type: 'Privileged Container', resource: 'debug-shell', namespace: 'system', cluster: 'eks-prod-us-east-1', message: 'Container running in privileged mode' },
    { severity: 'high', type: 'Running as Root', resource: 'legacy-app', namespace: 'apps', cluster: 'gke-staging', message: 'Container running as root user' },
    { severity: 'medium', type: 'No Resource Limits', resource: 'batch-job', namespace: 'batch', cluster: 'aks-dev-westeu', message: 'No CPU/memory limits defined' },
    { severity: 'low', type: 'Missing Labels', resource: 'temp-pod', namespace: 'default', cluster: 'kind-local', message: 'Pod missing required labels' },
  ]
}

/**
 * Demo GPU nodes data
 */
function getDemoGPUNodes() {
  return [
    { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuCount: 8, gpuType: 'NVIDIA A100', gpuAllocated: 6, gpuAvailable: 2, memory: '80GB', status: 'Ready' },
    { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuCount: 8, gpuType: 'NVIDIA A100', gpuAllocated: 8, gpuAvailable: 0, memory: '80GB', status: 'Ready' },
    { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuCount: 4, gpuType: 'NVIDIA V100', gpuAllocated: 2, gpuAvailable: 2, memory: '32GB', status: 'Ready' },
    { name: 'ml-worker-1', cluster: 'eks-prod-us-east-1', gpuCount: 4, gpuType: 'NVIDIA T4', gpuAllocated: 4, gpuAvailable: 0, memory: '16GB', status: 'Ready' },
  ]
}

/**
 * Demo helm releases data
 */
function getDemoHelmReleases() {
  return [
    { name: 'nginx-ingress', namespace: 'ingress', cluster: 'eks-prod-us-east-1', chart: 'nginx-ingress', version: '4.7.1', status: 'deployed', updated: Date.now() - 86400000 },
    { name: 'prometheus-stack', namespace: 'monitoring', cluster: 'gke-staging', chart: 'kube-prometheus-stack', version: '45.7.1', status: 'deployed', updated: Date.now() - 172800000 },
    { name: 'redis', namespace: 'cache', cluster: 'aks-dev-westeu', chart: 'redis', version: '17.11.3', status: 'failed', updated: Date.now() - 3600000 },
    { name: 'cert-manager', namespace: 'cert-manager', cluster: 'openshift-prod', chart: 'cert-manager', version: '1.12.0', status: 'deployed', updated: Date.now() - 604800000 },
  ]
}

/**
 * Demo operators data
 */
function getDemoOperators() {
  return [
    { name: 'prometheus-operator', namespace: 'monitoring', cluster: 'eks-prod-us-east-1', version: 'v0.65.1', status: 'Installed', phase: 'Succeeded' },
    { name: 'elastic-cloud-eck', namespace: 'elastic-system', cluster: 'gke-staging', version: '2.8.0', status: 'Installed', phase: 'Succeeded' },
    { name: 'strimzi-kafka-operator', namespace: 'kafka', cluster: 'aks-dev-westeu', version: '0.35.0', status: 'Installing', phase: 'InstallReady' },
    { name: 'gpu-operator', namespace: 'gpu-operator', cluster: 'vllm-gpu-cluster', version: '23.3.2', status: 'Installed', phase: 'Succeeded' },
  ]
}

/**
 * Demo network services data
 */
function getDemoServices() {
  return [
    { name: 'api-gateway', namespace: 'production', cluster: 'eks-prod-us-east-1', type: 'LoadBalancer', ports: '443:31443/TCP', externalIP: '54.123.45.67' },
    { name: 'frontend', namespace: 'web', cluster: 'gke-staging', type: 'ClusterIP', ports: '80:80/TCP', externalIP: '-' },
    { name: 'database', namespace: 'data', cluster: 'aks-dev-westeu', type: 'ClusterIP', ports: '5432:5432/TCP', externalIP: '-' },
    { name: 'metrics', namespace: 'monitoring', cluster: 'openshift-prod', type: 'NodePort', ports: '9090:30090/TCP', externalIP: '-' },
  ]
}

/**
 * Register all demo data generators with the unified demo system
 */
export function registerAllDemoGenerators() {
  const entries: DemoDataEntry[] = [
    // Cluster data
    {
      id: 'clusters',
      category: 'card',
      description: 'Demo clusters with varied providers',
      config: { generate: getDemoClusters },
    },
    {
      id: 'cluster_health',
      category: 'card',
      description: 'Cluster health status',
      config: { generate: getDemoClusters },
    },

    // Workload data
    {
      id: 'pod_issues',
      category: 'card',
      description: 'Pods with issues',
      config: { generate: getDemoPodIssues },
    },
    {
      id: 'deployment_issues',
      category: 'card',
      description: 'Deployments with issues',
      config: { generate: getDemoDeploymentIssues },
    },

    // Events
    {
      id: 'events',
      category: 'card',
      description: 'Cluster events',
      config: { generate: getDemoEvents },
    },
    {
      id: 'event_stream',
      category: 'card',
      description: 'Event stream',
      config: { generate: getDemoEvents },
    },
    {
      id: 'warning_events',
      category: 'card',
      description: 'Warning events',
      config: { generate: () => getDemoEvents().filter(e => e.type === 'Warning') },
    },

    // Security
    {
      id: 'security_issues',
      category: 'card',
      description: 'Security issues',
      config: { generate: getDemoSecurityIssues },
    },

    // GPU/Compute
    {
      id: 'gpu_inventory',
      category: 'card',
      description: 'GPU node inventory',
      config: { generate: getDemoGPUNodes },
    },
    {
      id: 'gpu_status',
      category: 'card',
      description: 'GPU status',
      config: { generate: getDemoGPUNodes },
    },

    // GitOps
    {
      id: 'helm_release_status',
      category: 'card',
      description: 'Helm releases',
      config: { generate: getDemoHelmReleases },
    },

    // Operators
    {
      id: 'operator_status',
      category: 'card',
      description: 'OLM operators',
      config: { generate: getDemoOperators },
    },

    // Network
    {
      id: 'service_status',
      category: 'card',
      description: 'Kubernetes services',
      config: { generate: getDemoServices },
    },
  ]

  registerDemoDataBatch(entries)
}

// Export individual generators for direct use
export {
  getDemoClusters,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoEvents,
  getDemoSecurityIssues,
  getDemoGPUNodes,
  getDemoHelmReleases,
  getDemoOperators,
  getDemoServices,
}
