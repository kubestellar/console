/**
 * MSW (Mock Service Worker) handlers for KubeStellar Console
 * 
 * SECURITY NOTE: This file contains mock data for E2E testing and UI development.
 * - All tokens/credentials here are FAKE and used only for testing
 * - No real credentials or secrets should ever be placed in this file
 * - This file is excluded from production builds
 * 
 * Provides mock API responses without requiring backend connectivity.
 */

// ---------------------------------------------------------------------------
// Kubara catalog fixture — realistic snapshot of the GitHub Contents API
// response for kubara-io/kubara/contents/helm. Each entry includes the full
// set of fields returned by the API (sha, size, URLs) so that components
// exercising those fields work correctly in demo mode (#8486).
// ---------------------------------------------------------------------------
export const kubaraCatalogFixture = [
  {
    name: 'prometheus-stack',
    path: 'helm/prometheus-stack',
    sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/prometheus-stack?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/prometheus-stack',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/a1b2c3d',
    download_url: null,
    type: 'dir',
    description: 'Production Prometheus + Grafana + Alertmanager monitoring stack',
  },
  {
    name: 'cert-manager',
    path: 'helm/cert-manager',
    sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/cert-manager?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/cert-manager',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/b2c3d4e',
    download_url: null,
    type: 'dir',
    description: 'Automated TLS certificate management with Let\'s Encrypt and custom CAs',
  },
  {
    name: 'falco-runtime-security',
    path: 'helm/falco-runtime-security',
    sha: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/falco-runtime-security?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/falco-runtime-security',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/c3d4e5f',
    download_url: null,
    type: 'dir',
    description: 'Runtime threat detection and incident response for containers',
  },
  {
    name: 'kyverno-policies',
    path: 'helm/kyverno-policies',
    sha: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/kyverno-policies?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/kyverno-policies',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/d4e5f6a',
    download_url: null,
    type: 'dir',
    description: 'Kubernetes-native policy engine for admission control and governance',
  },
  {
    name: 'argocd-gitops',
    path: 'helm/argocd-gitops',
    sha: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/argocd-gitops?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/argocd-gitops',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/e5f6a1b',
    download_url: null,
    type: 'dir',
    description: 'Declarative GitOps continuous delivery with Argo CD',
  },
  {
    name: 'istio-service-mesh',
    path: 'helm/istio-service-mesh',
    sha: 'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/istio-service-mesh?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/istio-service-mesh',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/f6a1b2c',
    download_url: null,
    type: 'dir',
    description: 'Service mesh for traffic management, mTLS, and observability',
  },
  {
    name: 'velero-backups',
    path: 'helm/velero-backups',
    sha: 'a7b8c9d0e1f2a7b8c9d0e1f2a7b8c9d0e1f2a7b8',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/velero-backups?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/velero-backups',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/a7b8c9d',
    download_url: null,
    type: 'dir',
    description: 'Cluster backup, disaster recovery, and migration tooling',
  },
  {
    name: 'external-secrets',
    path: 'helm/external-secrets',
    sha: 'b8c9d0e1f2a7b8c9d0e1f2a7b8c9d0e1f2a7b8c9',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/external-secrets?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/external-secrets',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/b8c9d0e',
    download_url: null,
    type: 'dir',
    description: 'Sync secrets from AWS Secrets Manager, Vault, GCP, and Azure Key Vault',
  },
  {
    name: 'trivy-vulnerability-scanner',
    path: 'helm/trivy-vulnerability-scanner',
    sha: 'c9d0e1f2a7b8c9d0e1f2a7b8c9d0e1f2a7b8c9d0',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/trivy-vulnerability-scanner?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/trivy-vulnerability-scanner',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/c9d0e1f',
    download_url: null,
    type: 'dir',
    description: 'Container image and filesystem vulnerability scanning',
  },
  {
    name: 'fluent-bit-logging',
    path: 'helm/fluent-bit-logging',
    sha: 'd0e1f2a7b8c9d0e1f2a7b8c9d0e1f2a7b8c9d0e1',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/fluent-bit-logging?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/fluent-bit-logging',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/d0e1f2a',
    download_url: null,
    type: 'dir',
    description: 'Lightweight log processor and forwarder for Kubernetes',
  },
  {
    name: 'harbor-registry',
    path: 'helm/harbor-registry',
    sha: 'e1f2a7b8c9d0e1f2a7b8c9d0e1f2a7b8c9d0e1f2',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/harbor-registry?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/harbor-registry',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/e1f2a7b',
    download_url: null,
    type: 'dir',
    description: 'Enterprise container registry with vulnerability scanning and RBAC',
  },
  {
    name: 'crossplane-infra',
    path: 'helm/crossplane-infra',
    sha: 'f2a7b8c9d0e1f2a7b8c9d0e1f2a7b8c9d0e1f2a7',
    size: 0,
    url: 'https://api.github.com/repos/kubara-io/kubara/contents/helm/crossplane-infra?ref=main',
    html_url: 'https://github.com/kubara-io/kubara/tree/main/helm/crossplane-infra',
    git_url: 'https://api.github.com/repos/kubara-io/kubara/git/trees/f2a7b8c',
    download_url: null,
    type: 'dir',
    description: 'Infrastructure-as-code with Kubernetes-native resource provisioning',
  },
]

// Demo data - one cluster for each provider type to showcase all icons
export const demoClusters = [
  { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50, distribution: 'kind' },
  { name: 'minikube', context: 'minikube', healthy: true, source: 'kubeconfig', nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20, distribution: 'minikube' },
  { name: 'k3s-edge', context: 'k3s-edge', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100, distribution: 'k3s' },
  { name: 'eks-prod-us-east-1', context: 'eks-prod', healthy: true, source: 'kubeconfig', nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000, server: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', distribution: 'eks' },
  { name: 'gke-staging', context: 'gke-staging', healthy: true, source: 'kubeconfig', nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000, distribution: 'gke' },
  { name: 'aks-dev-westeu', context: 'aks-dev', healthy: true, source: 'kubeconfig', nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500, server: 'https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443', distribution: 'aks' },
  { name: 'openshift-prod', context: 'ocp-prod', healthy: true, source: 'kubeconfig', nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500, server: 'api.openshift-prod.example.com:6443', distribution: 'openshift', namespaces: ['openshift-operators', 'openshift-monitoring'] },
  { name: 'oci-oke-phoenix', context: 'oke-phoenix', healthy: true, source: 'kubeconfig', nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800, server: 'https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: 'oci' },
  { name: 'alibaba-ack-shanghai', context: 'ack-shanghai', healthy: false, source: 'kubeconfig', nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200, distribution: 'alibaba' },
  { name: 'do-nyc1-prod', context: 'do-nyc1', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300, distribution: 'digitalocean' },
  { name: 'rancher-mgmt', context: 'rancher-mgmt', healthy: true, source: 'kubeconfig', nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400, distribution: 'rancher' },
  { name: 'vllm-gpu-cluster', context: 'vllm-d', healthy: true, source: 'kubeconfig', nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000, distribution: 'kubernetes' },
]

export const demoPodIssues = [
  {
    name: 'api-server-7d8f9c6b5-x2k4m',
    namespace: 'production',
    cluster: 'prod-east',
    status: 'CrashLoopBackOff',
    reason: 'Error',
    issues: ['Container restarting', 'OOMKilled'],
    restarts: 15,
  },
  {
    name: 'worker-5c6d7e8f9-n3p2q',
    namespace: 'batch',
    cluster: 'vllm-d',
    status: 'ImagePullBackOff',
    reason: 'ImagePullBackOff',
    issues: ['Failed to pull image'],
    restarts: 0,
  },
  {
    name: 'cache-redis-0',
    namespace: 'data',
    cluster: 'staging',
    status: 'Pending',
    reason: 'Unschedulable',
    issues: ['Insufficient memory'],
    restarts: 0,
  },
]

export const demoDeploymentIssues = [
  {
    name: 'api-gateway',
    namespace: 'production',
    cluster: 'prod-east',
    replicas: 3,
    readyReplicas: 1,
    reason: 'Unavailable',
    message: 'Deployment does not have minimum availability',
  },
  {
    name: 'worker-service',
    namespace: 'batch',
    cluster: 'vllm-d',
    replicas: 5,
    readyReplicas: 3,
    reason: 'Progressing',
    message: 'ReplicaSet is progressing',
  },
]

export const demoEvents = [
  {
    type: 'Warning',
    reason: 'FailedScheduling',
    message: 'No nodes available to schedule pod',
    object: 'Pod/worker-5c6d7e8f9-n3p2q',
    namespace: 'batch',
    cluster: 'vllm-d',
    count: 3,
    firstSeen: '2025-01-15T10:00:00Z',
    lastSeen: '2025-01-16T12:30:00Z',
  },
  {
    type: 'Normal',
    reason: 'Scheduled',
    message: 'Successfully assigned pod to node-2',
    object: 'Pod/api-server-7d8f9c6b5-abc12',
    namespace: 'production',
    cluster: 'prod-east',
    count: 1,
    firstSeen: '2025-01-16T11:00:00Z',
    lastSeen: '2025-01-16T11:00:00Z',
  },
  {
    type: 'Warning',
    reason: 'BackOff',
    message: 'Back-off restarting failed container',
    object: 'Pod/api-server-7d8f9c6b5-x2k4m',
    namespace: 'production',
    cluster: 'prod-east',
    count: 15,
    firstSeen: '2025-01-15T08:00:00Z',
    lastSeen: '2025-01-16T12:45:00Z',
  },
  {
    type: 'Warning',
    reason: 'Unhealthy',
    message: 'Readiness probe failed: connection refused',
    object: 'Pod/cache-redis-0',
    namespace: 'data',
    cluster: 'staging',
    count: 8,
    firstSeen: '2025-01-16T09:00:00Z',
    lastSeen: '2025-01-16T12:50:00Z',
  },
]

export const demoGPUNodes = [
  // vllm-gpu-cluster - Large GPU cluster for AI/ML workloads
  // gpu-node-1 is tainted `dedicated=ofer:NoSchedule` so the taint-aware filter
  // on the GPU Utilization / GPU Inventory cards has something to gate on
  // (issue #8172 — matches Mike Spreitzer's reported scenario).
  { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, taints: [{ key: 'dedicated', value: 'ofer', effect: 'NoSchedule' }] },
  { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8 },
  { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4 },
  { name: 'gpu-node-4', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 7 },
  // EKS - Production ML inference
  { name: 'eks-gpu-1', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 3 },
  { name: 'eks-gpu-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 4 },
  // GKE - Training workloads
  { name: 'gke-gpu-pool-1', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1 },
  { name: 'gke-gpu-pool-2', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2 },
  // AKS - Dev/test GPUs
  { name: 'aks-gpu-node', cluster: 'aks-dev-westeu', gpuType: 'NVIDIA V100', gpuCount: 2, gpuAllocated: 1 },
  // OpenShift - Enterprise ML
  { name: 'ocp-gpu-worker-1', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 4 },
  { name: 'ocp-gpu-worker-2', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2 },
  // OCI - Oracle GPU shapes
  { name: 'oke-gpu-node', cluster: 'oci-oke-phoenix', gpuType: 'NVIDIA A10', gpuCount: 4, gpuAllocated: 3 },
  // Alibaba - China region ML
  { name: 'ack-gpu-worker', cluster: 'alibaba-ack-shanghai', gpuType: 'NVIDIA V100', gpuCount: 8, gpuAllocated: 6 },
  // Rancher - Managed GPU pool
  { name: 'rancher-gpu-1', cluster: 'rancher-mgmt', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1 },
]

export const demoSecurityIssues = [
  {
    name: 'api-server-7d8f9c6b5-x2k4m',
    namespace: 'production',
    cluster: 'prod-east',
    issue: 'Privileged container',
    severity: 'high',
    details: 'Container running in privileged mode',
  },
  {
    name: 'worker-deployment',
    namespace: 'batch',
    cluster: 'vllm-d',
    issue: 'Running as root',
    severity: 'high',
    details: 'Container running as root user',
  },
  {
    name: 'nginx-ingress',
    namespace: 'ingress',
    cluster: 'prod-east',
    issue: 'Host network enabled',
    severity: 'medium',
    details: 'Pod using host network namespace',
  },
]

// Stored user data
export const currentUser = {
  id: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
  onboarded: true,
}

// Stored card configurations for sharing tests.
// Capped to prevent unbounded memory growth in long-running sessions (#7418).
/** Maximum number of entries in each in-memory share registry */
export const MAX_SHARE_REGISTRY_ENTRIES = 500
export let savedCards: Record<string, unknown> = {}
export let sharedDashboards: Record<string, unknown> = {}

// ---------------------------------------------------------------------------
// Demo time-offset constants — used in Date.now() ± N for realistic timestamps
// ---------------------------------------------------------------------------
export const DEMO_30_SEC_MS    = 30_000
export const DEMO_45_SEC_MS    = 45_000
export const DEMO_1_MIN_MS     = 60_000
export const DEMO_90_SEC_MS    = 90_000
export const DEMO_2_MIN_MS     = 120_000
export const DEMO_150_SEC_MS   = 150_000
export const DEMO_3_MIN_MS     = 180_000
export const DEMO_4_MIN_MS     = 240_000
export const DEMO_5_MIN_MS     = 300_000
export const DEMO_6_MIN_MS     = 360_000
export const DEMO_7_MIN_MS     = 420_000
export const DEMO_8_MIN_MS     = 480_000
export const DEMO_10_MIN_MS    = 600_000
export const DEMO_15_MIN_MS    = 900_000
export const DEMO_20_MIN_MS    = 1_200_000
export const DEMO_30_MIN_MS    = 1_800_000
export const DEMO_45_MIN_MS    = 2_700_000
export const DEMO_50_MIN_MS    = 3_000_000
export const DEMO_1_HOUR_MS    = 3_600_000
export const DEMO_75_MIN_MS    = 4_500_000
export const DEMO_90_MIN_MS    = 5_400_000
export const DEMO_2_HOUR_MS    = 7_200_000
export const DEMO_150_MIN_MS   = 9_000_000
export const DEMO_3_HOUR_MS    = 10_800_000
export const DEMO_4_HOUR_MS    = 14_400_000
export const DEMO_8_HOUR_MS    = 28_800_000
export const DEMO_12_HOUR_MS   = 43_200_000
export const DEMO_1_DAY_MS     = 86_400_000
export const DEMO_2_DAY_MS     = 172_800_000
export const DEMO_3_DAY_MS     = 259_200_000
export const DEMO_5_DAY_MS     = 432_000_000
export const DEMO_1_WEEK_MS    = 604_800_000
export const DEMO_30_DAY_MS    = 2_592_000_000


/** Evict oldest entries when registry exceeds MAX_SHARE_REGISTRY_ENTRIES */
export function pruneRegistry(registry: Record<string, unknown>) {
  const keys = Object.keys(registry)
  if (keys.length > MAX_SHARE_REGISTRY_ENTRIES) {
    const excess = keys.length - MAX_SHARE_REGISTRY_ENTRIES
    for (let i = 0; i < excess; i++) {
      delete registry[keys[i]]
    }
  }
}

/**
 * Reset share registries to prevent cross-test pollution.
 * Should be called in test beforeEach hooks to ensure each test starts
 * with a clean registry state (#11035).
 */
export function resetShareRegistries() {
  Object.keys(savedCards).forEach(key => delete savedCards[key])
  Object.keys(sharedDashboards).forEach(key => delete sharedDashboards[key])
}

/** Get default state for savedCards (empty object) */
export function getDefaultSavedCards(): Record<string, unknown> {
  return {}
}

/** Get default state for sharedDashboards (empty object) */
export function getDefaultSharedDashboards(): Record<string, unknown> {
  return {}
}

