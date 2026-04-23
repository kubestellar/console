import { http, HttpResponse, delay, passthrough } from 'msw'

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
const kubaraCatalogFixture = [
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
const demoClusters = [
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

const demoPodIssues = [
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

const demoDeploymentIssues = [
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

const demoEvents = [
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

const demoGPUNodes = [
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

const demoSecurityIssues = [
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
const currentUser = {
  id: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
  onboarded: true,
}

// Stored card configurations for sharing tests.
// Capped to prevent unbounded memory growth in long-running sessions (#7418).
/** Maximum number of entries in each in-memory share registry */
const MAX_SHARE_REGISTRY_ENTRIES = 500
const savedCards: Record<string, unknown> = {}
const sharedDashboards: Record<string, unknown> = {}

/** Evict oldest entries when registry exceeds MAX_SHARE_REGISTRY_ENTRIES */
function pruneRegistry(registry: Record<string, unknown>) {
  const keys = Object.keys(registry)
  if (keys.length > MAX_SHARE_REGISTRY_ENTRIES) {
    const excess = keys.length - MAX_SHARE_REGISTRY_ENTRIES
    for (let i = 0; i < excess; i++) {
      delete registry[keys[i]]
    }
  }
}

export const handlers = [
  // ── Analytics passthrough ─────────────────────────────────────────
  // Explicitly pass through GA4/analytics requests so the service worker
  // does not intercept them. Without this, cross-origin passthrough fails
  // in some browsers, breaking UTM campaign tracking (intern affiliate links).
  http.all('https://www.google-analytics.com/*', () => passthrough()),
  http.all('https://analytics.google.com/*', () => passthrough()),
  http.all('https://www.googletagmanager.com/*', () => passthrough()),
  http.all(/^https:\/\/[^/]*google-analytics\.com\//, () => passthrough()),

  // ── External resource passthrough ──────────────────────────────────
  // Pass through external resources so MSW doesn't warn about them
  http.all('https://api.dicebear.com/*', () => passthrough()),
  http.all('https://fonts.gstatic.com/*', () => passthrough()),
  http.all('https://fonts.googleapis.com/*', () => passthrough()),
  http.all('https://img.youtube.com/*', () => passthrough()),
  // GitHub avatar URLs — return transparent 1x1 PNG to avoid CSP violation
  // (connect-src doesn't include github.com on Netlify)
  http.get('https://github.com/*.png', () => {
    const TRANSPARENT_1X1_PNG = new Uint8Array([
      137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,
      31,21,196,137,0,0,0,10,73,68,65,84,120,156,98,0,0,0,6,0,5,130,217,36,0,0,
      0,0,73,69,78,68,174,66,96,130,
    ])
    return new HttpResponse(TRANSPARENT_1X1_PNG, { headers: { 'Content-Type': 'image/png' } })
  }),
  http.get('https://avatars.githubusercontent.com/*', () => passthrough()),

  // ── Auth refresh (OAuth token exchange) ────────────────────────────
  // Mock the /auth/refresh endpoint used by AuthCallback and silent token refresh
  http.post('/auth/refresh', async () => {
    await delay(100)
    return HttpResponse.json({
      token: 'mock-jwt-token-for-testing-only', // SECURITY: Safe - NOT A REAL TOKEN
      onboarded: true,
    })
  }),

  // Auth endpoints
  http.get('/api/auth/me', async () => {
    await delay(100)
    return HttpResponse.json({ user: currentUser })
  }),

  // Also handle /api/me (used by auth.tsx)
  http.get('/api/me', async () => {
    await delay(100)
    return HttpResponse.json(currentUser)
  }),

  http.post('/api/auth/login', async () => {
    await delay(200)
    return HttpResponse.json({
      user: currentUser,
      token: 'mock-jwt-token-for-testing-only', // SECURITY: Safe - NOT A REAL TOKEN - Mock data for E2E tests only
    })
  }),

  http.post('/api/auth/logout', async () => {
    await delay(100)
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/auth/github', async () => {
    await delay(100)
    return HttpResponse.json({ url: '/auth/callback?code=mock-code' })
  }),

  http.get('/auth/callback', async () => {
    await delay(100)
    return HttpResponse.json({
      user: currentUser,
      token: 'mock-jwt-token-for-testing-only', // SECURITY: Safe - NOT A REAL TOKEN - Mock data for E2E tests only
    })
  }),

  // Health check
  http.get('/api/health', async () => {
    await delay(50)
    return HttpResponse.json({ status: 'ok', version: 'demo' })
  }),

  // Active users (for presence tracking) — return demo count when MSW is active
  // POST heartbeat is accepted but no-op in mock mode
  http.get('/api/active-users', () => {
    return HttpResponse.json({ activeUsers: 3, totalConnections: 3 })
  }),
  http.post('/api/active-users', () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Permissions
  // #7993 Phase 6: Permissions endpoints (/permissions/summary, /rbac/can-i,
  // /rbac/permissions) moved to kc-agent. The frontend hooks short-circuit
  // via isBackendUnavailable() in demo mode, so no MSW handler is required.
  // Keeping a no-op stub for legacy `/api/permissions/summary` callers in
  // case any are added during demo flows.
  http.get('/api/permissions/summary', async () => {
    await delay(50)
    const clusterPermissions = {
      isClusterAdmin: true,
      canListNodes: true,
      canListNamespaces: true,
      canCreateNamespaces: true,
      canManageRBAC: true,
      canViewSecrets: true,
      accessibleNamespaces: ['default', 'kube-system'],
    }
    return HttpResponse.json({
      clusters: {
        'kind-local': clusterPermissions,
        'minikube': clusterPermissions,
        'k3s-edge': clusterPermissions,
        'eks-prod-us-east-1': clusterPermissions,
        'gke-staging': clusterPermissions,
        'aks-dev-westeu': clusterPermissions,
        'openshift-prod': clusterPermissions,
        'oci-oke-phoenix': clusterPermissions,
        'alibaba-ack-shanghai': clusterPermissions,
        'do-nyc1-prod': clusterPermissions,
        'rancher-mgmt': clusterPermissions,
        'vllm-gpu-cluster': clusterPermissions,
      },
    })
  }),

  // Notifications
  http.get('/api/notifications/unread-count', async () => {
    await delay(50)
    return HttpResponse.json({ count: 0 })
  }),

  // MCP Status
  http.get('/api/mcp/status', async () => {
    await delay(100)
    return HttpResponse.json({
      opsClient: { available: true, toolCount: 25 },
      deployClient: { available: true, toolCount: 12 },
    })
  }),

  // Clusters
  http.get('/api/mcp/clusters', async () => {
    await delay(150)
    return HttpResponse.json({ clusters: demoClusters })
  }),

  http.get('/api/mcp/clusters/:cluster/health', async ({ params }) => {
    await delay(100)
    const cluster = demoClusters.find((c) => c.name === params.cluster)
    return HttpResponse.json({
      cluster: params.cluster,
      healthy: cluster?.healthy ?? true,
      nodeCount: cluster?.nodeCount ?? 3,
      readyNodes: cluster?.healthy ? cluster.nodeCount : (cluster?.nodeCount ?? 3) - 1,
      podCount: cluster?.podCount ?? 45,
      issues: cluster?.healthy ? [] : ['Node not ready'],
    })
  }),

  // Pod issues
  http.get('/api/mcp/pod-issues', async () => {
    await delay(150)
    return HttpResponse.json({ issues: demoPodIssues })
  }),

  // Deployment issues
  http.get('/api/mcp/deployment-issues', async () => {
    await delay(150)
    return HttpResponse.json({ issues: demoDeploymentIssues })
  }),

  // Pods list (for cluster-specific queries)
  http.get('/api/mcp/pods', async () => {
    await delay(100)
    return HttpResponse.json({
      pods: [
        { name: 'nginx-abc123', namespace: 'default', status: 'Running', cluster: 'kind-local' },
        { name: 'redis-xyz789', namespace: 'cache', status: 'Running', cluster: 'kind-local' },
        { name: 'api-server-456', namespace: 'backend', status: 'Running', cluster: 'kind-local' },
      ],
    })
  }),

  // Pod logs (tail container output) — see issue #6045
  http.get('/api/mcp/pods/logs', async ({ request }) => {
    await delay(100)
    const url = new URL(request.url)
    const pod = url.searchParams.get('pod') || 'unknown-pod'
    return HttpResponse.json({
      source: 'mock',
      logs: [
        `[mock] Tail logs for pod=${pod}`,
        '2024-01-01T00:00:00Z INFO  starting container',
        '2024-01-01T00:00:01Z INFO  listening on :8080',
        '2024-01-01T00:00:02Z INFO  handling request GET /',
      ].join('\n'),
    })
  }),

  // Deployments list (for cluster-specific queries)
  http.get('/api/mcp/deployments', async () => {
    await delay(100)
    return HttpResponse.json({
      deployments: [
        { name: 'nginx', namespace: 'default', cluster: 'kind-local', status: 'running', replicas: 3, readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3, progress: 100 },
        { name: 'redis', namespace: 'cache', cluster: 'kind-local', status: 'running', replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, progress: 100 },
        { name: 'api-server', namespace: 'backend', cluster: 'kind-local', status: 'deploying', replicas: 5, readyReplicas: 3, updatedReplicas: 5, availableReplicas: 3, progress: 60 },
      ],
    })
  }),

  // Events
  http.get('/api/mcp/events', async () => {
    await delay(100)
    return HttpResponse.json({ events: demoEvents })
  }),

  http.get('/api/mcp/events/warnings', async () => {
    await delay(100)
    return HttpResponse.json({
      events: demoEvents.filter((e) => e.type === 'Warning'),
    })
  }),

  // GPU nodes
  http.get('/api/mcp/gpu-nodes', async () => {
    await delay(100)
    return HttpResponse.json({ nodes: demoGPUNodes })
  }),

  // GPU node SSE stream — served by kc-agent (not the Go backend).
  // In demo mode there is no kc-agent, so return an empty SSE stream
  // that closes immediately; cards will fall back to demo data.
  http.get('/gpu-nodes/stream', () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: []\n\n'))
        controller.close()
      },
    })
    return new HttpResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }),

  // Security issues
  http.get('/api/mcp/security-issues', async () => {
    await delay(150)
    return HttpResponse.json({ issues: demoSecurityIssues })
  }),

  // User preferences (AI mode, theme, etc.)
  http.get('/api/user/preferences', async () => {
    await delay(100)
    return HttpResponse.json({
      aiMode: 'medium',
      theme: 'dark',
      tokenLimit: 10000,
      tokenUsed: 2500,
    })
  }),

  http.put('/api/user/preferences', async ({ request }) => {
    await delay(100)
    const body = await request.json()
    return HttpResponse.json({ success: true, preferences: body })
  }),

  // ── Compliance Frameworks ──────────────────────────────────────────
  http.get('/api/compliance/frameworks/', async () => {
    await delay(150)
    return HttpResponse.json([
      {
        id: 'pci-dss-4.0',
        name: 'PCI-DSS 4.0',
        version: '4.0',
        description: 'Payment Card Industry Data Security Standard — protects cardholder data across networks, applications, and storage.',
        category: 'Financial',
        controls: 12,
        checks: 42,
      },
      {
        id: 'soc2-type2',
        name: 'SOC 2 Type II',
        version: '2024',
        description: 'Service Organization Control 2 — trust service criteria for security, availability, and confidentiality.',
        category: 'Financial',
        controls: 9,
        checks: 31,
      },
      {
        id: 'hipaa-security',
        name: 'HIPAA Security Rule',
        version: '2024',
        description: 'Health Insurance Portability and Accountability Act — technical safeguards for electronic protected health information.',
        category: 'Healthcare',
        controls: 5,
        checks: 18,
      },
      {
        id: 'nist-800-53',
        name: 'NIST 800-53 Rev 5',
        version: 'Rev 5',
        description: 'Security and Privacy Controls for Information Systems and Organizations.',
        category: 'Government',
        controls: 20,
        checks: 56,
      },
    ])
  }),

  http.post('/api/compliance/frameworks/:id/evaluate', async ({ params }) => {
    await delay(300)
    const fwId = params.id as string
    const fwNames: Record<string, string> = {
      'pci-dss-4.0': 'PCI-DSS 4.0',
      'soc2-type2': 'SOC 2 Type II',
      'hipaa-security': 'HIPAA Security Rule',
      'nist-800-53': 'NIST 800-53 Rev 5',
    }
    return HttpResponse.json({
      framework_id: fwId,
      framework_name: fwNames[fwId] ?? fwId,
      cluster: 'prod-east',
      score: 78,
      passed: 28,
      failed: 6,
      partial: 5,
      skipped: 3,
      total_checks: 42,
      controls: [
        {
          id: 'req-1', name: 'Network Segmentation', status: 'pass',
          checks: [
            { id: 'c1', name: 'NetworkPolicy coverage', type: 'kubernetes', status: 'pass', message: 'All namespaces have NetworkPolicies', remediation: '', severity: 'high' },
            { id: 'c2', name: 'Default deny ingress', type: 'kubernetes', status: 'pass', message: 'Default deny policies in place', remediation: '', severity: 'high' },
          ],
        },
        {
          id: 'req-3', name: 'Protect Stored Data', status: 'partial',
          checks: [
            { id: 'c3', name: 'Encryption at rest', type: 'kubernetes', status: 'pass', message: 'etcd encryption enabled', remediation: '', severity: 'critical' },
            { id: 'c4', name: 'Secret management', type: 'kubernetes', status: 'fail', message: '3 secrets stored as plain text', remediation: 'Migrate to external secret store (Vault, AWS SM)', severity: 'critical' },
          ],
        },
        {
          id: 'req-7', name: 'Restrict Access', status: 'fail',
          checks: [
            { id: 'c5', name: 'RBAC least privilege', type: 'kubernetes', status: 'fail', message: '2 ClusterRoleBindings grant cluster-admin to non-admin users', remediation: 'Replace cluster-admin with scoped roles', severity: 'critical' },
            { id: 'c6', name: 'Service account tokens', type: 'kubernetes', status: 'partial', message: '5 of 12 service accounts auto-mount tokens', remediation: 'Set automountServiceAccountToken: false', severity: 'medium' },
          ],
        },
        {
          id: 'req-10', name: 'Logging and Monitoring', status: 'pass',
          checks: [
            { id: 'c7', name: 'Audit logging enabled', type: 'kubernetes', status: 'pass', message: 'API server audit logging active', remediation: '', severity: 'high' },
            { id: 'c8', name: 'Log retention', type: 'kubernetes', status: 'pass', message: 'Logs retained for 90 days', remediation: '', severity: 'medium' },
          ],
        },
      ],
      evaluated_at: new Date().toISOString(),
    })
  }),

  http.post('/api/compliance/frameworks/:id/report', async () => {
    await delay(500)
    const reportContent = JSON.stringify({
      report: 'demo-compliance-report',
      generated_at: new Date().toISOString(),
      summary: 'Demo mode — install locally for real compliance reports.',
    }, null, 2)
    return new HttpResponse(reportContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="compliance-report-demo.json"',
      },
    })
  }),

  // HIPAA compliance mock handlers (demo mode)
  http.get('/api/compliance/hipaa/safeguards', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: '164.312(a)', section: '§164.312(a)(1)', name: 'Access Control', description: 'Implement technical policies to allow access only to authorized persons.', status: 'pass', checks: [
        { id: 'ac-1', name: 'RBAC enforced on PHI namespaces', description: 'Verify RBAC restricts PHI namespace access', status: 'pass', evidence: 'All 4 PHI namespaces have RBAC policies', remediation: '' },
        { id: 'ac-2', name: 'Unique user identification', description: 'Each user has a unique identifier', status: 'pass', evidence: 'OIDC provider enforces unique subject claims', remediation: '' },
        { id: 'ac-3', name: 'Emergency access procedure', description: 'Break-glass procedure documented and tested', status: 'pass', evidence: 'Break-glass ServiceAccount with audit trail configured', remediation: '' },
      ]},
      { id: '164.312(b)', section: '§164.312(b)', name: 'Audit Controls', description: 'Record and examine activity in systems containing PHI.', status: 'partial', checks: [
        { id: 'au-1', name: 'Kubernetes audit logging', description: 'API server audit policy captures PHI access', status: 'pass', evidence: 'Audit policy with RequestResponse level for PHI namespaces', remediation: '' },
        { id: 'au-2', name: 'Log retention 6+ years', description: 'Audit logs retained per HIPAA requirement', status: 'fail', evidence: 'Current retention: 90 days', remediation: 'Extend log retention to minimum 6 years via S3 lifecycle policy' },
        { id: 'au-3', name: 'Tamper-proof log storage', description: 'Logs stored in immutable storage', status: 'pass', evidence: 'S3 Object Lock enabled on audit bucket', remediation: '' },
      ]},
      { id: '164.312(c)', section: '§164.312(c)(1)', name: 'Integrity Controls', description: 'Protect PHI from improper alteration or destruction.', status: 'pass', checks: [
        { id: 'ic-1', name: 'Image signature verification', description: 'Container images signed and verified', status: 'pass', evidence: 'Cosign verification policy enforced', remediation: '' },
        { id: 'ic-2', name: 'Immutable container filesystem', description: 'Read-only root filesystem', status: 'pass', evidence: 'readOnlyRootFilesystem=true on all PHI pods', remediation: '' },
      ]},
      { id: '164.312(d)', section: '§164.312(d)', name: 'Person or Entity Authentication', description: 'Verify identity of persons seeking access to PHI.', status: 'partial', checks: [
        { id: 'pa-1', name: 'Multi-factor authentication', description: 'MFA required for PHI system access', status: 'pass', evidence: 'OIDC provider enforces MFA', remediation: '' },
        { id: 'pa-2', name: 'Service account rotation', description: 'Service account tokens rotated regularly', status: 'partial', evidence: '3 of 5 service accounts use projected tokens', remediation: 'Migrate remaining 2 to projected volume tokens' },
      ]},
      { id: '164.312(e)', section: '§164.312(e)(1)', name: 'Transmission Security', description: 'Guard against unauthorized access to PHI during transmission.', status: 'fail', checks: [
        { id: 'ts-1', name: 'TLS 1.2+ on all endpoints', description: 'All services use TLS 1.2 or higher', status: 'pass', evidence: 'Ingress controller configured with minimum TLS 1.2', remediation: '' },
        { id: 'ts-2', name: 'Mutual TLS between services', description: 'Service mesh enforces mTLS', status: 'fail', evidence: '2 of 6 PHI data flows lack mTLS', remediation: 'Enable Istio strict mTLS policy for PHI namespaces' },
        { id: 'ts-3', name: 'Encryption of PHI at rest', description: 'etcd and PV encryption enabled', status: 'pass', evidence: 'etcd encryption provider configured', remediation: '' },
      ]},
    ])
  }),

  http.get('/api/compliance/hipaa/phi-namespaces', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'ehr-api', cluster: 'prod-east', labels: ['hipaa-phi=true', 'data-class=restricted'], encrypted: true, audit_enabled: true, rbac_restricted: true, compliant: true },
      { name: 'patient-records', cluster: 'prod-east', labels: ['hipaa-phi=true', 'data-class=restricted'], encrypted: true, audit_enabled: true, rbac_restricted: true, compliant: true },
      { name: 'lab-results', cluster: 'prod-west', labels: ['hipaa-phi=true', 'data-class=sensitive'], encrypted: true, audit_enabled: true, rbac_restricted: false, compliant: false },
      { name: 'billing-phi', cluster: 'prod-west', labels: ['hipaa-phi=true', 'data-class=restricted'], encrypted: true, audit_enabled: false, rbac_restricted: true, compliant: false },
    ])
  }),

  http.get('/api/compliance/hipaa/data-flows', async () => {
    await delay(150)
    return HttpResponse.json([
      { source: 'ehr-api', destination: 'patient-records', protocol: 'gRPC', encrypted: true, mutual_tls: true },
      { source: 'ehr-api', destination: 'lab-results', protocol: 'REST/HTTPS', encrypted: true, mutual_tls: true },
      { source: 'patient-records', destination: 'billing-phi', protocol: 'REST/HTTPS', encrypted: true, mutual_tls: false },
      { source: 'lab-results', destination: 'billing-phi', protocol: 'REST/HTTPS', encrypted: true, mutual_tls: false },
      { source: 'ehr-api', destination: 'analytics-deid', protocol: 'Kafka/TLS', encrypted: true, mutual_tls: true },
      { source: 'billing-phi', destination: 'claims-export', protocol: 'SFTP', encrypted: false, mutual_tls: false },
    ])
  }),

  http.get('/api/compliance/hipaa/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      overall_score: 60, safeguards_passed: 2, safeguards_failed: 1,
      safeguards_partial: 2, total_safeguards: 5, phi_namespaces: 4,
      compliant_namespaces: 2, data_flows: 6, encrypted_flows: 5,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // GxP / 21 CFR Part 11 mock handlers (demo mode)
  http.get('/api/compliance/gxp/config', async () => {
    await delay(150)
    return HttpResponse.json({
      enabled: true, enabled_at: '2026-04-20T08:00:00Z', enabled_by: 'admin@pharma.example.com',
      append_only: true, require_signature: true, hash_algorithm: 'SHA-256',
    })
  }),

  http.get('/api/compliance/gxp/records', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'gxp-001', timestamp: '2026-04-20T08:01:00Z', user_id: 'admin@pharma.example.com', action: 'config_change', resource: 'gxp-mode', detail: 'GxP validation mode enabled', previous_hash: '', record_hash: 'a1b2c3d4e5f6a7b8' },
      { id: 'gxp-002', timestamp: '2026-04-20T09:15:00Z', user_id: 'eng1@pharma.example.com', action: 'deploy', resource: 'ehr-api/v2.3.1', detail: 'Deployment to prod-east', previous_hash: 'a1b2c3d4e5f6a7b8', record_hash: 'b2c3d4e5f6a7b8c9' },
      { id: 'gxp-003', timestamp: '2026-04-20T09:16:00Z', user_id: 'qa-lead@pharma.example.com', action: 'review', resource: 'ehr-api/v2.3.1', detail: 'QA review passed — IQ/OQ/PQ complete', previous_hash: 'b2c3d4e5f6a7b8c9', record_hash: 'c3d4e5f6a7b8c9d0' },
      { id: 'gxp-004', timestamp: '2026-04-21T11:30:00Z', user_id: 'eng2@pharma.example.com', action: 'deploy', resource: 'lab-results/v1.8.0', detail: 'Deployment to prod-west', previous_hash: 'c3d4e5f6a7b8c9d0', record_hash: 'd4e5f6a7b8c9d0e1' },
      { id: 'gxp-005', timestamp: '2026-04-21T14:00:00Z', user_id: 'admin@pharma.example.com', action: 'config_change', resource: 'rbac', detail: 'Added ServiceAccount lab-etl-sa', previous_hash: 'd4e5f6a7b8c9d0e1', record_hash: 'e5f6a7b8c9d0e1f2' },
      { id: 'gxp-006', timestamp: '2026-04-22T08:45:00Z', user_id: 'eng1@pharma.example.com', action: 'deploy', resource: 'patient-records/v3.1.2', detail: 'Hotfix — security patch CVE-2026-1234', previous_hash: 'e5f6a7b8c9d0e1f2', record_hash: 'f6a7b8c9d0e1f2a3' },
      { id: 'gxp-007', timestamp: '2026-04-22T10:00:00Z', user_id: 'qa-lead@pharma.example.com', action: 'review', resource: 'patient-records/v3.1.2', detail: 'Emergency change review — approved', previous_hash: 'f6a7b8c9d0e1f2a3', record_hash: 'a7b8c9d0e1f2a3b4' },
      { id: 'gxp-008', timestamp: '2026-04-23T07:00:00Z', user_id: 'eng2@pharma.example.com', action: 'deploy', resource: 'billing-phi/v2.0.0', detail: 'Major version deployment', previous_hash: 'a7b8c9d0e1f2a3b4', record_hash: 'b8c9d0e1f2a3b4c5' },
    ])
  }),

  http.get('/api/compliance/gxp/signatures', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sig-001', record_id: 'gxp-001', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-20T08:02:00Z' },
      { id: 'sig-002', record_id: 'gxp-002', user_id: 'qa-lead@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-20T09:20:00Z' },
      { id: 'sig-003', record_id: 'gxp-003', user_id: 'qa-lead@pharma.example.com', meaning: 'reviewed', auth_method: 'password', timestamp: '2026-04-20T09:17:00Z' },
      { id: 'sig-004', record_id: 'gxp-004', user_id: 'qa-lead@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-21T12:00:00Z' },
      { id: 'sig-005', record_id: 'gxp-005', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'mfa', timestamp: '2026-04-21T14:05:00Z' },
      { id: 'sig-006', record_id: 'gxp-006', user_id: 'qa-lead@pharma.example.com', meaning: 'verified', auth_method: 'mfa', timestamp: '2026-04-22T09:00:00Z' },
      { id: 'sig-007', record_id: 'gxp-007', user_id: 'admin@pharma.example.com', meaning: 'approved', auth_method: 'certificate', timestamp: '2026-04-22T10:05:00Z' },
    ])
  }),

  http.get('/api/compliance/gxp/chain/verify', async () => {
    await delay(200)
    return HttpResponse.json({
      valid: true, total_records: 8, verified_records: 8, broken_at_index: -1,
      verified_at: new Date().toISOString(), message: 'Hash chain intact — all records verified',
    })
  }),

  http.get('/api/compliance/gxp/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      config: { enabled: true, enabled_at: '2026-04-20T08:00:00Z', enabled_by: 'admin@pharma.example.com', append_only: true, require_signature: true, hash_algorithm: 'SHA-256' },
      total_records: 8, total_signatures: 7, chain_integrity: true,
      last_verified: new Date().toISOString(), pending_signatures: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // BAA Tracker mock handlers (demo mode)
  http.get('/api/compliance/baa/agreements', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'baa-001', provider: 'Amazon Web Services', provider_type: 'cloud', baa_signed_date: '2025-06-15', baa_expiry_date: '2027-06-15', covered_clusters: ['prod-east', 'staging-east'], contact_name: 'AWS Enterprise Support', contact_email: 'aws-baa@example.com', status: 'active', notes: 'Covers all HIPAA-eligible services in us-east-1' },
      { id: 'baa-002', provider: 'Google Cloud Platform', provider_type: 'cloud', baa_signed_date: '2025-08-01', baa_expiry_date: '2026-08-01', covered_clusters: ['prod-west'], contact_name: 'GCP Healthcare Team', contact_email: 'gcp-baa@example.com', status: 'active', notes: 'Covers GKE, Cloud SQL, BigQuery in us-west1' },
      { id: 'baa-003', provider: 'Datadog', provider_type: 'saas', baa_signed_date: '2025-03-01', baa_expiry_date: '2026-05-15', covered_clusters: ['prod-east', 'prod-west'], contact_name: 'Datadog Compliance', contact_email: 'compliance@datadog.example.com', status: 'expiring_soon', notes: 'Monitoring and logging for PHI workloads' },
      { id: 'baa-004', provider: 'Snowflake', provider_type: 'saas', baa_signed_date: '2024-01-01', baa_expiry_date: '2026-01-01', covered_clusters: [], contact_name: 'Snowflake Legal', contact_email: 'legal@snowflake.example.com', status: 'expired', notes: 'Analytics warehouse — BAA lapsed' },
      { id: 'baa-005', provider: 'Acme Consulting', provider_type: 'consulting', baa_signed_date: '', baa_expiry_date: '', covered_clusters: ['dev-central'], contact_name: 'Acme PM', contact_email: 'pm@acme.example.com', status: 'pending', notes: 'BAA under legal review' },
      { id: 'baa-006', provider: 'Azure', provider_type: 'cloud', baa_signed_date: '2025-11-01', baa_expiry_date: '2027-11-01', covered_clusters: ['dr-central'], contact_name: 'Microsoft Enterprise', contact_email: 'azure-baa@example.com', status: 'active', notes: 'Disaster recovery in Central US' },
    ])
  }),

  http.get('/api/compliance/baa/alerts', async () => {
    await delay(150)
    return HttpResponse.json([
      { agreement_id: 'baa-003', provider: 'Datadog', expiry_date: '2026-05-15', days_left: 22, severity: 'critical' },
      { agreement_id: 'baa-004', provider: 'Snowflake', expiry_date: '2026-01-01', days_left: 0, severity: 'critical' },
    ])
  }),

  http.get('/api/compliance/baa/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_agreements: 6, active_agreements: 3, expiring_soon: 1,
      expired: 1, pending: 1, covered_clusters: 5, uncovered_clusters: 1,
      active_alerts: 2, evaluated_at: new Date().toISOString(),
    })
  }),

  // ── Segregation of Duties mock handlers (demo mode) ──────────────────
  http.get('/api/compliance/sod/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_rules: 8, total_principals: 12, total_violations: 2,
      by_severity: { high: 1, medium: 1 },
      by_conflict_type: { deployment: 1, access: 1 },
      compliance_score: 83, clean_principals: 10, conflicted_principals: 2,
    })
  }),

  http.get('/api/compliance/sod/rules', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sod-1', name: 'Deployment ≠ Approval', description: 'Users who deploy cannot approve their own deployments', role_a: 'deployer', role_b: 'approver', conflict_type: 'deployment', severity: 'high', regulation: 'SOX §404' },
      { id: 'sod-2', name: 'Admin ≠ Auditor', description: 'Cluster admins cannot hold auditor role', role_a: 'cluster-admin', role_b: 'auditor', conflict_type: 'access', severity: 'critical', regulation: 'PCI-DSS 7.1' },
      { id: 'sod-3', name: 'Secret Access ≠ Deployment', description: 'Users with secret access cannot deploy workloads', role_a: 'secret-reader', role_b: 'deployer', conflict_type: 'access', severity: 'high', regulation: 'SOC2 CC6.1' },
      { id: 'sod-4', name: 'Network Policy ≠ Workload Owner', description: 'Network policy editors cannot own workloads in same namespace', role_a: 'network-admin', role_b: 'workload-owner', conflict_type: 'access', severity: 'medium', regulation: 'NIST AC-5' },
      { id: 'sod-5', name: 'RBAC Admin ≠ Developer', description: 'RBAC administrators cannot hold developer roles', role_a: 'rbac-admin', role_b: 'developer', conflict_type: 'access', severity: 'high', regulation: 'SOX §404' },
      { id: 'sod-6', name: 'Release Manager ≠ QA', description: 'Release managers cannot perform QA sign-off', role_a: 'release-manager', role_b: 'qa-signer', conflict_type: 'deployment', severity: 'medium', regulation: 'ISO 27001 A.6.1.2' },
      { id: 'sod-7', name: 'Backup Admin ≠ Restore', description: 'Backup administrators cannot perform restores', role_a: 'backup-admin', role_b: 'restore-operator', conflict_type: 'access', severity: 'medium', regulation: 'SOC2 CC6.3' },
      { id: 'sod-8', name: 'Monitoring ≠ Alert Suppression', description: 'Monitoring editors cannot suppress alerts', role_a: 'monitoring-editor', role_b: 'alert-manager', conflict_type: 'access', severity: 'medium', regulation: 'PCI-DSS 10.6' },
    ])
  }),

  http.get('/api/compliance/sod/principals', async () => {
    await delay(150)
    return HttpResponse.json([
      { name: 'alice@example.com', type: 'user', roles: ['deployer', 'developer'], clusters: ['prod-east', 'staging'] },
      { name: 'bob@example.com', type: 'user', roles: ['approver', 'auditor'], clusters: ['prod-east', 'prod-west'] },
      { name: 'carol@example.com', type: 'user', roles: ['cluster-admin'], clusters: ['staging'] },
      { name: 'ci-bot', type: 'serviceaccount', roles: ['deployer'], clusters: ['prod-east', 'prod-west', 'staging'] },
      { name: 'dave@example.com', type: 'user', roles: ['developer', 'qa-signer'], clusters: ['staging'] },
      { name: 'eve@example.com', type: 'user', roles: ['network-admin'], clusters: ['prod-east'] },
    ])
  }),

  http.get('/api/compliance/sod/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'sv-1', rule_id: 'sod-1', principal: 'frank@example.com', principal_type: 'user', role_a: 'deployer', role_b: 'approver', clusters: ['prod-east'], severity: 'high', description: 'User frank@ holds both deployer and approver roles in prod-east' },
      { id: 'sv-2', rule_id: 'sod-4', principal: 'staging-netops', principal_type: 'serviceaccount', role_a: 'network-admin', role_b: 'workload-owner', clusters: ['staging'], severity: 'medium', description: 'Service account staging-netops manages network policies and owns workloads' },
    ])
  }),

  // ── Change Control mock handlers (demo mode) ───────────────────────
  http.get('/api/compliance/change-control/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_changes: 47, approved_changes: 32, unapproved_changes: 3,
      emergency_changes: 1, policy_violations: 1, risk_score: 24,
      by_cluster: { 'prod-east': 22, 'prod-west': 14, staging: 11 },
      by_type: { create: 12, update: 28, delete: 7 },
      by_actor: { 'alice@example.com': 15, 'bob@example.com': 12, 'carol@example.com': 10, 'ci-bot': 10 },
    })
  }),

  http.get('/api/compliance/change-control/changes', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'cc-001', timestamp: '2026-04-21T08:30:00Z', cluster: 'prod-east', namespace: 'ingress-system', resource_kind: 'Deployment', resource_name: 'ingress-nginx', change_type: 'update', actor: 'alice@example.com', approval_status: 'approved', approved_by: 'bob@example.com', ticket_ref: 'CHG-2041', description: 'Upgrade ingress-nginx to v1.10.0 — security patch for CVE-2026-1188', diff_summary: '+12 -8 lines', risk_score: 35 },
      { id: 'cc-002', timestamp: '2026-04-20T14:15:00Z', cluster: 'prod-east', namespace: 'payment', resource_kind: 'NetworkPolicy', resource_name: 'payment-egress', change_type: 'create', actor: 'carol@example.com', approval_status: 'approved', approved_by: 'dave@example.com', ticket_ref: 'CHG-2038', description: 'Add NetworkPolicy restricting egress from payment namespace', diff_summary: '+45 lines', risk_score: 18 },
      { id: 'cc-003', timestamp: '2026-04-22T11:00:00Z', cluster: 'prod-west', namespace: 'checkout', resource_kind: 'Deployment', resource_name: 'checkout-api', change_type: 'update', actor: 'eve@example.com', approval_status: 'pending', description: 'Scale API deployment to 5 replicas for traffic spike', diff_summary: 'replicas: 3→5', risk_score: 12 },
      { id: 'cc-004', timestamp: '2026-04-21T02:45:00Z', cluster: 'prod-east', namespace: 'kube-system', resource_kind: 'DaemonSet', resource_name: 'kube-proxy', change_type: 'update', actor: 'alice@example.com', approval_status: 'emergency', approved_by: 'bob@example.com', ticket_ref: 'EMG-0091', description: 'Emergency: Patch CVE-2026-1234 in kube-proxy', diff_summary: '+3 -3 lines', risk_score: 72 },
      { id: 'cc-005', timestamp: '2026-04-22T14:00:00Z', cluster: 'staging', namespace: 'checkout', resource_kind: 'HorizontalPodAutoscaler', resource_name: 'checkout-hpa', change_type: 'update', actor: 'dave@example.com', approval_status: 'pending', description: 'Update HPA thresholds — CPU 70→60%, memory 80→75%', diff_summary: '+2 -2 lines', risk_score: 8 },
      { id: 'cc-006', timestamp: '2026-04-18T09:30:00Z', cluster: 'prod-west', namespace: 'istio-system', resource_kind: 'Secret', resource_name: 'mesh-tls-cert', change_type: 'update', actor: 'carol@example.com', approval_status: 'rejected', approved_by: 'bob@example.com', ticket_ref: 'CHG-2035', description: 'Rotate TLS certificates for service mesh — rejected: wrong cert chain', diff_summary: '+1 -1 lines', risk_score: 55 },
    ])
  }),

  http.get('/api/compliance/change-control/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'cv-001', change_id: 'cc-untracked-01', policy: 'require-approval-production', severity: 'high', description: 'ConfigMap "checkout-config" updated in production without a change request or approval', detected_at: '2026-04-19T03:22:00Z', acknowledged: false },
    ])
  }),

  http.get('/api/compliance/change-control/policies', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'cp-1', name: 'Require Approval for Production', description: 'All production changes must be approved by a reviewer before implementation', scope: 'production', requires_approval: true, requires_ticket: true, severity: 'high' },
      { id: 'cp-2', name: 'Change Freeze Window', description: 'No standard changes during maintenance windows (Sat 02:00-06:00 UTC)', scope: 'all', requires_approval: false, requires_ticket: false, severity: 'medium' },
      { id: 'cp-3', name: 'Emergency Change Audit', description: 'Emergency changes must have post-implementation review within 48 hours', scope: 'all', requires_approval: true, requires_ticket: true, severity: 'high' },
    ])
  }),

  // ── Data Residency mock handlers (demo mode) ──────────────────────
  http.get('/api/compliance/residency/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_rules: 4, total_clusters: 6, total_violations: 1,
      by_severity: { medium: 1 },
      by_region: { 'us-east-1': 2, 'us-west-2': 1, 'eu-central-1': 1, 'eu-west-1': 1, 'ap-south-1': 1 },
      compliant: 5, non_compliant: 1,
    })
  }),

  http.get('/api/compliance/residency/clusters', async () => {
    await delay(150)
    return HttpResponse.json([
      { cluster: 'prod-east', region: 'us', jurisdiction: 'United States' },
      { cluster: 'prod-west', region: 'us', jurisdiction: 'United States' },
      { cluster: 'eu-central', region: 'eu', jurisdiction: 'Germany (EU)' },
      { cluster: 'eu-west', region: 'eu', jurisdiction: 'Ireland (EU)' },
      { cluster: 'ap-south', region: 'apac', jurisdiction: 'India (APAC)' },
      { cluster: 'staging', region: 'us', jurisdiction: 'United States' },
    ])
  }),

  http.get('/api/compliance/residency/rules', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'dr-1', classification: 'GDPR', allowed_regions: ['eu'], description: 'GDPR-classified data must reside in EU regions only', enforcement: 'deny' },
      { id: 'dr-2', classification: 'PHI', allowed_regions: ['us'], description: 'PHI data must remain in US regions per HIPAA', enforcement: 'deny' },
      { id: 'dr-3', classification: 'PII', allowed_regions: ['us', 'eu', 'ca'], description: 'PII data allowed in US, EU, and Canada — encrypted at rest', enforcement: 'warn' },
      { id: 'dr-4', classification: 'test', allowed_regions: ['us'], description: 'Test-classified data must not exist in production clusters', enforcement: 'audit' },
    ])
  }),

  http.get('/api/compliance/residency/violations', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'dv-1', cluster: 'staging', cluster_region: 'us', namespace: 'qa-data', workload_name: 'data-generator', workload_kind: 'CronJob', classification: 'test', allowed_regions: ['us'], severity: 'medium', detected_at: '2026-04-22T08:00:00Z', message: 'Test data found in staging cluster co-located with production workloads' },
    ])
  }),

  // ── NIST 800-53 mock handlers (demo mode) ─────────────────────────
  http.get('/api/compliance/nist/families', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'AC', name: 'Access Control', description: 'Manage system access and privileges.', pass_rate: 83, controls: [
        { id: 'AC-2', name: 'Account Management', description: 'Manage information system accounts.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Kubernetes RBAC with OIDC provider', remediation: '' },
        { id: 'AC-3', name: 'Access Enforcement', description: 'Enforce approved authorizations.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'NetworkPolicy + RBAC', remediation: '' },
        { id: 'AC-6', name: 'Least Privilege', description: 'Employ least privilege.', priority: 'P1', baseline: 'low', status: 'partial', evidence: '80% scoped', remediation: 'Audit legacy service accounts' },
        { id: 'AC-17', name: 'Remote Access', description: 'Manage remote access sessions.', priority: 'P1', baseline: 'moderate', status: 'implemented', evidence: 'VPN + mTLS', remediation: '' },
      ]},
      { id: 'AU', name: 'Audit and Accountability', description: 'Create, protect, and retain audit records.', pass_rate: 87, controls: [
        { id: 'AU-2', name: 'Audit Events', description: 'Determine auditable events.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'API server audit policy', remediation: '' },
        { id: 'AU-3', name: 'Content of Audit Records', description: 'Records contain required info.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Structured JSON audit logs', remediation: '' },
        { id: 'AU-6', name: 'Audit Review', description: 'Review and analyze audit records.', priority: 'P1', baseline: 'low', status: 'partial', evidence: 'SIEM covers 60%', remediation: 'Expand alert rules' },
        { id: 'AU-12', name: 'Audit Generation', description: 'Provide audit record generation.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Fluentd on all nodes', remediation: '' },
      ]},
      { id: 'SC', name: 'System and Communications Protection', description: 'Protect communications and boundaries.', pass_rate: 87, controls: [
        { id: 'SC-7', name: 'Boundary Protection', description: 'Monitor communications at boundaries.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'NetworkPolicy + WAF', remediation: '' },
        { id: 'SC-8', name: 'Transmission Confidentiality', description: 'Protect transmitted information.', priority: 'P1', baseline: 'moderate', status: 'implemented', evidence: 'Service mesh mTLS', remediation: '' },
        { id: 'SC-12', name: 'Cryptographic Key Management', description: 'Manage cryptographic keys.', priority: 'P1', baseline: 'low', status: 'partial', evidence: '80% rotation', remediation: 'Enable etcd key rotation' },
        { id: 'SC-28', name: 'Protection at Rest', description: 'Protect information at rest.', priority: 'P1', baseline: 'moderate', status: 'implemented', evidence: 'etcd AES-256-GCM', remediation: '' },
      ]},
      { id: 'CM', name: 'Configuration Management', description: 'Establish baselines and manage changes.', pass_rate: 87, controls: [
        { id: 'CM-2', name: 'Baseline Configuration', description: 'Maintain baselines.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'GitOps with Flux', remediation: '' },
        { id: 'CM-6', name: 'Configuration Settings', description: 'Establish mandatory settings.', priority: 'P1', baseline: 'low', status: 'partial', evidence: 'OPA 85%', remediation: 'Deploy remaining templates' },
        { id: 'CM-7', name: 'Least Functionality', description: 'Only essential capabilities.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'Minimal images', remediation: '' },
        { id: 'CM-8', name: 'Component Inventory', description: 'Maintain component inventory.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'SBOM via Syft', remediation: '' },
      ]},
      { id: 'IR', name: 'Incident Response', description: 'Prepare for and respond to incidents.', pass_rate: 66, controls: [
        { id: 'IR-4', name: 'Incident Handling', description: 'Implement incident handling.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'PagerDuty + runbooks', remediation: '' },
        { id: 'IR-5', name: 'Incident Monitoring', description: 'Track security incidents.', priority: 'P1', baseline: 'low', status: 'implemented', evidence: 'JIRA tracking', remediation: '' },
        { id: 'IR-6', name: 'Incident Reporting', description: 'Report to authorities.', priority: 'P1', baseline: 'low', status: 'planned', evidence: '', remediation: 'Implement FedRAMP POAM reporting' },
      ]},
    ])
  }),

  http.get('/api/compliance/nist/mappings', async () => {
    await delay(150)
    return HttpResponse.json([
      { control_id: 'AC-2', resources: ['ServiceAccount', 'ClusterRoleBinding'], namespaces: ['kube-system', 'production'], clusters: ['prod-east', 'prod-west'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'AC-3', resources: ['NetworkPolicy', 'Role', 'RoleBinding'], namespaces: ['*'], clusters: ['prod-east', 'prod-west', 'staging'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'SC-7', resources: ['NetworkPolicy', 'Ingress'], namespaces: ['*'], clusters: ['prod-east', 'prod-west'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'CM-2', resources: ['GitRepository', 'Kustomization'], namespaces: ['flux-system'], clusters: ['prod-east', 'prod-west', 'staging'], automated: true, last_assessed: new Date().toISOString() },
      { control_id: 'AU-2', resources: ['AuditPolicy'], namespaces: ['kube-system'], clusters: ['prod-east', 'prod-west'], automated: true, last_assessed: new Date().toISOString() },
    ])
  }),

  http.get('/api/compliance/nist/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_controls: 19, implemented_controls: 13, partial_controls: 4,
      planned_controls: 1, not_applicable: 1, overall_score: 81,
      baseline: 'moderate', evaluated_at: new Date().toISOString(),
    })
  }),

  // ── DISA STIG mock handlers (demo mode) ───────────────────────────
  http.get('/api/compliance/stig/benchmarks', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'kubernetes-stig-v2r1', title: 'Kubernetes STIG', version: 'V2R1', release: 'Release 1', status: 'current', profile: 'MAC-I Classified', total_rules: 95, findings_count: 12 },
    ])
  }),

  http.get('/api/compliance/stig/findings', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'V-242381', rule_id: 'SV-242381r879578', title: 'API Server must have anonymous auth disabled', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'anonymous-auth=false verified on all API servers' },
      { id: 'V-242382', rule_id: 'SV-242382r879581', title: 'API Server must have audit logging enabled', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'Audit policy active with RequestResponse level' },
      { id: 'V-242383', rule_id: 'SV-242383r879584', title: 'etcd must use TLS encryption', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'TLS certs verified via --etcd-certfile' },
      { id: 'V-242395', rule_id: 'SV-242395r879620', title: 'Network policies must restrict pod traffic', severity: 'CAT II', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-03', comments: '2 namespaces missing default-deny policies' },
      { id: 'V-242400', rule_id: 'SV-242400r879635', title: 'Container images must be signed', severity: 'CAT II', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-01', comments: 'Admission controller not enforcing signatures' },
      { id: 'V-242402', rule_id: 'SV-242402r879641', title: 'Resource limits must be set on containers', severity: 'CAT III', status: 'open', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-02', comments: '12 pods in dev namespace missing resource limits' },
      { id: 'V-242410', rule_id: 'SV-242410r879660', title: 'RBAC must be enabled on the API server', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: '--authorization-mode includes RBAC' },
      { id: 'V-242415', rule_id: 'SV-242415r879675', title: 'Secrets must be encrypted at rest', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'EncryptionConfiguration with aescbc provider' },
      { id: 'V-242420', rule_id: 'SV-242420r879690', title: 'Kubelet must use TLS authentication', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-worker-01', comments: 'Client cert auth verified' },
      { id: 'V-242425', rule_id: 'SV-242425r879705', title: 'Pod security standards must be enforced', severity: 'CAT II', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'PodSecurity admission enabled with restricted profile' },
      { id: 'V-242430', rule_id: 'SV-242430r879720', title: 'ServiceAccount token automounting must be disabled', severity: 'CAT II', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'automountServiceAccountToken: false set as default' },
      { id: 'V-242435', rule_id: 'SV-242435r879735', title: 'API server must use secure port only', severity: 'CAT I', status: 'not_a_finding', benchmark_id: 'kubernetes-stig-v2r1', host: 'k8s-master-01', comments: 'Insecure port disabled, --secure-port=6443' },
    ])
  }),

  http.get('/api/compliance/stig/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      compliance_score: 75, total_findings: 12, open: 3,
      cat_i_open: 0, cat_ii_open: 2, cat_iii_open: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // ── Air-Gap Readiness mock handlers (demo mode) ───────────────────
  http.get('/api/compliance/airgap/requirements', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'ag-01', category: 'registry', name: 'Private Container Registry', description: 'All images from internal registry.', status: 'ready', details: 'Harbor v2.9 deployed in-cluster at registry.internal:5000' },
      { id: 'ag-02', category: 'registry', name: 'Image Signature Verification', description: 'Images verified against local keyserver.', status: 'ready', details: 'Cosign admission controller enforcing signatures from internal keyserver' },
      { id: 'ag-03', category: 'dns', name: 'Internal DNS Resolution', description: 'CoreDNS internal only.', status: 'ready', details: 'CoreDNS configured with no upstream forwarders — all zones served internally' },
      { id: 'ag-04', category: 'ntp', name: 'Internal NTP Source', description: 'Time from internal NTP.', status: 'ready', details: 'Chrony syncing to internal GPS-disciplined NTP at 10.0.0.1' },
      { id: 'ag-05', category: 'updates', name: 'Offline Update Channel', description: 'Updates via internal repo.', status: 'partial', details: '85% of upstream repos mirrored to internal Nexus — remaining 15% are non-critical operator repos' },
      { id: 'ag-06', category: 'updates', name: 'Helm Chart Repository', description: 'ChartMuseum local.', status: 'ready', details: 'ChartMuseum serving 47 charts locally at helm.internal:8080' },
      { id: 'ag-07', category: 'telemetry', name: 'Telemetry Disabled', description: 'No outbound telemetry.', status: 'ready', details: 'Egress NetworkPolicy blocks all outbound traffic — verified via network audit' },
      { id: 'ag-08', category: 'telemetry', name: 'CRL/OCSP Offline', description: 'Local CRL cache.', status: 'not_ready', details: 'No local CRL distribution point deployed — certificates currently cannot be validated offline' },
      { id: 'ag-09', category: 'registry', name: 'Operator Catalog Mirror', description: 'OLM catalogs mirrored.', status: 'ready', details: '12 operator catalogs synced from upstream, served via internal catalog server' },
      { id: 'ag-10', category: 'dns', name: 'External Egress Blocked', description: 'All outbound blocked.', status: 'ready', details: 'Default-deny egress NetworkPolicy applied cluster-wide with allowlist for internal ranges only' },
    ])
  }),

  http.get('/api/compliance/airgap/clusters', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'ag-cluster-1', name: 'airgap-prod-east', readiness_score: 100, status: 'ready', requirements_met: 10, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
      { id: 'ag-cluster-2', name: 'airgap-prod-west', readiness_score: 100, status: 'ready', requirements_met: 10, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
      { id: 'ag-cluster-3', name: 'classified-central', readiness_score: 80, status: 'partial', requirements_met: 8, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
      { id: 'ag-cluster-4', name: 'staging-isolated', readiness_score: 70, status: 'not_ready', requirements_met: 7, requirements_total: 10, last_checked: '2026-04-23T06:00:00Z' },
    ])
  }),

  http.get('/api/compliance/airgap/summary', async () => {
    await delay(150)
    return HttpResponse.json({
      total_requirements: 10, ready: 8, not_ready: 1, partial: 1,
      overall_readiness: 80,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // ── FedRAMP Readiness mock handlers (demo mode) ───────────────────
  http.get('/api/compliance/fedramp/controls', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'AC-1', name: 'Access Control Policy', description: 'Develop and maintain access control policy and procedures', family: 'AC', status: 'satisfied', responsible: 'CISO Office', implementation: 'Documented in security plan v3.2, reviewed quarterly' },
      { id: 'AC-2', name: 'Account Management', description: 'Manage system accounts including creation, modification, and removal', family: 'AC', status: 'satisfied', responsible: 'IAM Team', implementation: 'RBAC with OIDC integration via Keycloak, 30-day inactive purge' },
      { id: 'AC-6', name: 'Least Privilege', description: 'Employ the principle of least privilege for system access', family: 'AC', status: 'partially_satisfied', responsible: 'Platform Engineering', implementation: '80% of service accounts scoped — 3 legacy accounts pending reduction' },
      { id: 'AU-2', name: 'Audit Events', description: 'Determine and configure auditable events', family: 'AU', status: 'satisfied', responsible: 'Security Engineering', implementation: 'K8s API server audit policy covering all write operations' },
      { id: 'CA-7', name: 'Continuous Monitoring', description: 'Develop and implement continuous monitoring program', family: 'CA', status: 'satisfied', responsible: 'SecOps', implementation: 'Prometheus + Grafana with 90-day retention, real-time alerts' },
      { id: 'CM-6', name: 'Configuration Settings', description: 'Establish and enforce security configuration settings', family: 'CM', status: 'partially_satisfied', responsible: 'Platform Engineering', implementation: 'OPA Gatekeeper enforcing 85% of policies — 15% in audit mode' },
      { id: 'SC-7', name: 'Boundary Protection', description: 'Monitor and control communications at system boundaries', family: 'SC', status: 'satisfied', responsible: 'Network Engineering', implementation: 'NetworkPolicy + WAF + ingress rate limiting deployed' },
      { id: 'SI-2', name: 'Flaw Remediation', description: 'Identify, report, and correct system flaws in a timely manner', family: 'SI', status: 'partially_satisfied', responsible: 'DevOps', implementation: 'CVE scanning via Trivy — 90% within SLA, 10% lagging on low-severity' },
    ])
  }),

  http.get('/api/compliance/fedramp/poams', async () => {
    await delay(150)
    return HttpResponse.json([
      { id: 'POAM-001', control_id: 'AC-6', title: 'Legacy service account privilege reduction', description: '3 legacy service accounts have overly broad ClusterRole bindings that need scoping down', milestone_status: 'open', scheduled_completion: '2026-06-30', risk_level: 'moderate', vendor_dependency: false },
      { id: 'POAM-002', control_id: 'CM-6', title: 'OPA policy enforcement gap', description: '15% of OPA/Gatekeeper policies are in audit-only mode and need enforcement', milestone_status: 'open', scheduled_completion: '2026-07-15', risk_level: 'low', vendor_dependency: false },
      { id: 'POAM-003', control_id: 'SI-2', title: 'CVE patching SLA compliance', description: 'Low-severity CVE patching exceeds 30-day SLA for 10% of findings', milestone_status: 'delayed', scheduled_completion: '2026-05-31', risk_level: 'moderate', vendor_dependency: true },
      { id: 'POAM-004', control_id: 'AU-12', title: 'Node-level audit logging', description: 'Audit logging incomplete on 2 worker nodes — kubelet audit config missing', milestone_status: 'closed', scheduled_completion: '2026-04-15', risk_level: 'low', vendor_dependency: false },
    ])
  }),

  http.get('/api/compliance/fedramp/score', async () => {
    await delay(150)
    return HttpResponse.json({
      overall_score: 85, authorization_status: 'in_progress', impact_level: 'moderate',
      controls_satisfied: 5, controls_partially_satisfied: 3, controls_planned: 0, controls_total: 8,
      poams_open: 3, poams_closed: 1,
      evaluated_at: new Date().toISOString(),
    })
  }),

  // Card templates
  http.get('/api/cards/templates', async () => {
    await delay(100)
    return HttpResponse.json({
      templates: [
        { id: 'cluster_health', name: 'Cluster Health', category: 'monitoring' },
        { id: 'pod_issues', name: 'Pod Issues', category: 'issues' },
        { id: 'deployment_issues', name: 'Deployment Issues', category: 'issues' },
        { id: 'gpu_overview', name: 'GPU Overview', category: 'resources' },
        { id: 'gpu_status', name: 'GPU Status', category: 'resources' },
        { id: 'event_stream', name: 'Event Stream', category: 'activity' },
        { id: 'resource_usage', name: 'Resource Usage', category: 'resources' },
        { id: 'security_issues', name: 'Security Issues', category: 'security' },
      ],
    })
  }),

  // Save card configuration (for sharing)
  http.post('/api/cards/save', async ({ request }) => {
    await delay(100)
    const body = (await request.json()) as { id: string; config: unknown }
    const shareId = `card-${Date.now()}`
    savedCards[shareId] = body
    pruneRegistry(savedCards)
    return HttpResponse.json({
      success: true,
      shareId,
      shareUrl: `/shared/card/${shareId}`,
    })
  }),

  // Get shared card
  http.get('/api/cards/shared/:shareId', async ({ params }) => {
    await delay(100)
    const card = savedCards[params.shareId as string]
    if (card) {
      return HttpResponse.json({ card })
    }
    return HttpResponse.json({ error: 'Card not found' }, { status: 404 })
  }),

  // List dashboards
  http.get('/api/dashboards', async () => {
    await delay(100)
    return HttpResponse.json([])
  }),

  // Save dashboard configuration
  http.post('/api/dashboards/save', async ({ request }) => {
    await delay(100)
    const body = (await request.json()) as { name: string; config: unknown }
    const shareId = `dashboard-${Date.now()}`
    sharedDashboards[shareId] = body
    pruneRegistry(sharedDashboards)
    return HttpResponse.json({
      success: true,
      shareId,
      shareUrl: `/shared/dashboard/${shareId}`,
    })
  }),

  // Get shared dashboard
  http.get('/api/dashboards/shared/:shareId', async ({ params }) => {
    await delay(100)
    const dashboard = sharedDashboards[params.shareId as string]
    if (dashboard) {
      return HttpResponse.json({ dashboard })
    }
    return HttpResponse.json({ error: 'Dashboard not found' }, { status: 404 })
  }),

  // Export dashboard as JSON
  http.get('/api/dashboards/export', async () => {
    await delay(100)
    return HttpResponse.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      cards: [
        { type: 'cluster_health', position: { x: 0, y: 0 }, config: {} },
        { type: 'pod_issues', position: { x: 1, y: 0 }, config: {} },
      ],
    })
  }),

  // Import dashboard from JSON
  http.post('/api/dashboards/import', async ({ request }) => {
    await delay(100)
    const body = await request.json()
    return HttpResponse.json({ success: true, imported: body })
  }),

  // AI analysis endpoint (for AI interactivity testing)
  http.post('/api/ai/analyze', async ({ request }) => {
    await delay(500) // Simulate AI processing time
    const body = (await request.json()) as { context: string }
    return HttpResponse.json({
      analysis: `Based on the ${body.context || 'provided context'}, here's my analysis...`,
      recommendations: [
        { type: 'pod_issues', reason: '3 pods have issues that need attention' },
        { type: 'security', reason: '2 high severity security issues detected' },
      ],
      tokenUsed: 150,
    })
  }),

  // Card chat endpoint (AI conversation with card)
  http.post('/api/ai/card-chat', async ({ request }) => {
    await delay(300)
    const body = (await request.json()) as { cardType: string; question: string }
    return HttpResponse.json({
      response: `Here's information about your ${body.cardType} card: ${body.question}`,
      suggestions: ['Show me more details', 'Filter by cluster', 'Export this data'],
      tokenUsed: 75,
    })
  }),

  // ReplicaSets (for deployments/pods pages)
  http.get('/api/mcp/replicasets', async () => {
    await delay(100)
    return HttpResponse.json({
      replicasets: [
        { name: 'nginx-6d8f9c6b5', namespace: 'default', cluster: 'kind-local', replicas: 3, readyReplicas: 3, availableReplicas: 3 },
        { name: 'redis-5c4d3b2a1', namespace: 'cache', cluster: 'kind-local', replicas: 2, readyReplicas: 2, availableReplicas: 2 },
        { name: 'api-server-7e9f8d7c6', namespace: 'backend', cluster: 'kind-local', replicas: 5, readyReplicas: 3, availableReplicas: 3 },
      ],
    })
  }),

  // HPAs (for deployments/pods pages)
  http.get('/api/mcp/hpas', async () => {
    await delay(100)
    return HttpResponse.json({
      hpas: [
        { name: 'nginx-hpa', namespace: 'default', cluster: 'kind-local', minReplicas: 2, maxReplicas: 10, currentReplicas: 3, targetCPU: 80, currentCPU: 45 },
        { name: 'api-server-hpa', namespace: 'backend', cluster: 'kind-local', minReplicas: 3, maxReplicas: 20, currentReplicas: 5, targetCPU: 70, currentCPU: 62 },
      ],
    })
  }),

  // StatefulSets (for workloads/operators pages)
  http.get('/api/mcp/statefulsets', async () => {
    await delay(100)
    return HttpResponse.json({
      statefulsets: [
        { name: 'postgres', namespace: 'data', cluster: 'kind-local', replicas: 3, readyReplicas: 3, currentReplicas: 3 },
        { name: 'elasticsearch', namespace: 'logging', cluster: 'kind-local', replicas: 3, readyReplicas: 2, currentReplicas: 3 },
      ],
    })
  }),

  // DaemonSets (for workloads/operators pages)
  http.get('/api/mcp/daemonsets', async () => {
    await delay(100)
    return HttpResponse.json({
      daemonsets: [
        { name: 'fluentd', namespace: 'logging', cluster: 'kind-local', desired: 3, current: 3, ready: 3 },
        { name: 'node-exporter', namespace: 'monitoring', cluster: 'kind-local', desired: 3, current: 3, ready: 3 },
      ],
    })
  }),

  // CronJobs (for workloads/operators pages)
  http.get('/api/mcp/cronjobs', async () => {
    await delay(100)
    return HttpResponse.json({
      cronjobs: [
        { name: 'backup-daily', namespace: 'data', cluster: 'kind-local', schedule: '0 2 * * *', lastSchedule: '2025-01-16T02:00:00Z', active: 0, suspended: false },
        { name: 'cleanup-weekly', namespace: 'default', cluster: 'kind-local', schedule: '0 0 * * 0', lastSchedule: '2025-01-12T00:00:00Z', active: 0, suspended: false },
      ],
    })
  }),

  // Topology (for services/workloads pages)
  http.get('/api/topology', async () => {
    await delay(150)
    return HttpResponse.json({
      graph: {
        nodes: [
          { id: 'cluster:kind-local', type: 'cluster', label: 'kind-local', cluster: 'kind-local', health: 'healthy' },
          { id: 'service:kind-local:default:nginx', type: 'service', label: 'nginx', cluster: 'kind-local', namespace: 'default', health: 'healthy', metadata: { endpoints: 3 } },
          { id: 'service:kind-local:backend:api-server', type: 'service', label: 'api-server', cluster: 'kind-local', namespace: 'backend', health: 'healthy', metadata: { endpoints: 2 } },
        ],
        edges: [
          { id: 'internal:nginx-api', source: 'service:kind-local:default:nginx', target: 'service:kind-local:backend:api-server', type: 'internal', health: 'healthy', animated: false },
        ],
        clusters: ['kind-local'],
        lastUpdated: Date.now(),
      },
      clusters: [
        { name: 'kind-local', nodeCount: 1, serviceCount: 2, gatewayCount: 0, exportCount: 0, importCount: 0, health: 'healthy' },
      ],
      stats: { totalNodes: 3, totalEdges: 1, healthyConnections: 1, degradedConnections: 0 },
    })
  }),

  // Root-level health check (used by useBackendHealth, useSelfUpgrade, useBranding, etc.)
  http.get('/health', async () => {
    await delay(50)
    return HttpResponse.json({ status: 'ok', version: 'demo', mode: 'netlify' })
  }),

  // Onboarding status
  http.get('/api/onboarding/status', async () => {
    await delay(100)
    return HttpResponse.json({
      completed: currentUser.onboarded,
      steps: [
        { id: 'welcome', completed: true },
        { id: 'connect-cluster', completed: true },
        { id: 'setup-cards', completed: currentUser.onboarded },
      ],
    })
  }),

  http.post('/api/onboarding/complete', async () => {
    await delay(100)
    currentUser.onboarded = true
    return HttpResponse.json({ success: true })
  }),

  // ── Prometheus query mock (vLLM metrics in demo mode) ────────────
  // Return mock Prometheus-style responses for AI/ML dashboard metrics
  http.get('/prometheus/query', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('query') || ''
    // Return a plausible scalar value based on the metric
    let value = 0.5
    if (query.includes('gpu_cache_usage')) value = 0.42
    else if (query.includes('num_requests_running')) value = 3
    else if (query.includes('num_requests_waiting')) value = 1
    else if (query.includes('throughput')) value = 145.7
    else if (query.includes('time_to_first_token')) value = 0.028
    else if (query.includes('time_per_output_token')) value = 0.006
    return HttpResponse.json({
      status: 'success',
      data: { resultType: 'vector', result: [{ metric: {}, value: [Date.now() / 1000, String(value)] }] },
    })
  }),

  // ── Passthrough for Netlify Functions that work in demo mode ─────
  // These endpoints are backed by Netlify Functions and return real data
  // even in demo mode — let them through to the actual backend.
  // All use http.all (not http.get) so CORS OPTIONS preflights are not
  // swallowed by the catch-all /api/* handler (per feedback_msw_passthrough.md).
  http.all('/api/youtube/playlist', () => passthrough()),
  http.all('/api/youtube/thumbnail/*', () => passthrough()),
  http.all('/api/medium/blog', () => passthrough()),
  http.all('/api/missions/file', () => passthrough()),
  http.all('/api/missions/browse', () => passthrough()),
  http.all('/api/missions/scores', () => passthrough()),
  http.all('/api/missions/scores/*', () => passthrough()),
  http.all('/api/rewards/github', () => passthrough()),
  http.all('/api/rewards/badge/*', () => passthrough()),
  http.all('/api/rewards/bonus', () => passthrough()),
  http.all('/api/nps', () => passthrough()),
  http.all('/api/acmm/scan', () => passthrough()),
  http.all('/api/acmm/badge/*', () => passthrough()),
  http.all('/api/github-pipelines', () => passthrough()),
  http.all('/api/feedback-app', () => passthrough()),
  http.all('/api/nightly-e2e/runs', () => passthrough()),
  http.all('/api/public/nightly-e2e/runs', () => passthrough()),
  http.all('/api/analytics-dashboard', () => passthrough()),
  http.all('/api/analytics-accm', () => passthrough()),
  http.all('/api/issue-stats', () => passthrough()),
  http.all('/api/affiliate/clicks', () => passthrough()),
  http.all('/api/gtag', () => passthrough()),
  http.all('/api/ksc', () => passthrough()),
  http.all('/api/m', () => passthrough()),
  http.all('/api/send', () => passthrough()),

  // ── Kubara Platform Catalog (demo fixtures — #8486) ─────────────
  // Realistic fixture snapshots matching the GitHub Contents API shape
  // returned by the kubara-io/kubara repo. Each entry mirrors a real
  // chart directory with sha, size, git URLs, and download links so that
  // downstream components exercising those fields work correctly in demo.
  http.get('/api/github/repos/kubara-io/kubara/contents/*', () => {
    return HttpResponse.json(kubaraCatalogFixture)
  }),

  // Server-side Kubara catalog endpoint (Go handler with cache — #8487).
  // In demo mode this is intercepted by MSW; the Go handler also returns
  // demo data when it sees X-Demo-Mode, but belt-and-suspenders is safer.
  http.get('/api/kubara/catalog', () => {
    return HttpResponse.json({
      entries: kubaraCatalogFixture,
      source: 'demo',
    })
  }),

  // Kubara config endpoint — returns the active catalog repo and path.
  // In demo mode we always return the default public catalog coordinates.
  http.get('/api/kubara/config', () => {
    return HttpResponse.json({
      repo: 'kubara-io/kubara',
      path: 'go-binary/templates/embedded/managed-service-catalog/helm',
    })
  }),

  // ── Optional feature status endpoints (issue #8162) ──────────────
  // These endpoints probe for optional in-cluster integrations. In demo
  // mode the integrations are not installed, so we return a success (200)
  // response with `available: false`. Returning 200 here (instead of
  // letting the catch-all return 503) keeps the DevTools network tab
  // clean for demo visitors and avoids the MSW "unhandled request"
  // warning. Source callers already branch on `available` so semantics
  // are unchanged. See web/src/lib/kagentBackend.ts and related files.
  http.get('/api/kagent/status', () => {
    return HttpResponse.json({ available: false, reason: 'not configured in demo mode' })
  }),
  http.get('/api/kagent/agents', () => {
    return HttpResponse.json({ agents: [] })
  }),
  http.get('/api/kagenti-provider/status', () => {
    return HttpResponse.json({ available: false, reason: 'not configured in demo mode' })
  }),
  http.get('/api/kagenti-provider/agents', () => {
    return HttpResponse.json({ agents: [] })
  }),
  http.get('/api/gadget/status', () => {
    return HttpResponse.json({ available: false, reason: 'not configured in demo mode' })
  }),
  http.get('/api/mcs/status', () => {
    return HttpResponse.json({ available: false, reason: 'not configured in demo mode' })
  }),
  http.get('/api/persistence/status', () => {
    return HttpResponse.json({ available: false, reason: 'not configured in demo mode' })
  }),
  http.get('/api/self-upgrade/status', () => {
    return HttpResponse.json({ available: false, reason: 'not configured in demo mode' })
  }),

  // ── Catch-all for unmocked API routes ────────────────────────────
  // On Netlify, unhandled /api/* and /health requests fall through to the SPA
  // catch-all which returns index.html (200 OK, text/html). Code calling
  // .json() then throws "Unexpected token '<'". This catch-all returns a
  // proper JSON 503 so callers hit their error paths gracefully.
  http.all('/api/*', () => {
    return HttpResponse.json(
      { error: 'not available in demo mode' },
      { status: 503 },
    )
  }),
]

// Scenario-based handlers for different test scenarios
export const scenarios = {
  // Scenario with many issues (triggers AI recommendations)
  manyIssues: [
    http.get('/api/mcp/pod-issues', async () => {
      await delay(100)
      // Return 10+ pod issues to trigger high priority recommendations
      return HttpResponse.json({
        issues: Array(12)
          .fill(null)
          .map((_, i) => ({
            name: `pod-issue-${i}`,
            namespace: 'production',
            cluster: 'prod-east',
            status: 'CrashLoopBackOff',
            reason: 'Error',
            issues: ['Container restarting'],
            restarts: i * 2,
          })),
      })
    }),
  ],

  // Scenario with high GPU utilization
  highGPUUsage: [
    http.get('/api/mcp/gpu-nodes', async () => {
      await delay(100)
      return HttpResponse.json({
        nodes: demoGPUNodes.map((n) => ({ ...n, gpuAllocated: n.gpuCount })), // 100% allocated
      })
    }),
  ],

  // Scenario with no issues (clean cluster)
  cleanCluster: [
    http.get('/api/mcp/pod-issues', async () => {
      await delay(100)
      return HttpResponse.json({ issues: [] })
    }),
    http.get('/api/mcp/deployment-issues', async () => {
      await delay(100)
      return HttpResponse.json({ issues: [] })
    }),
    http.get('/api/mcp/security-issues', async () => {
      await delay(100)
      return HttpResponse.json({ issues: [] })
    }),
    http.get('/api/mcp/events/warnings', async () => {
      await delay(100)
      return HttpResponse.json({ events: [] })
    }),
  ],

  // Scenario: user not onboarded
  notOnboarded: [
    http.get('/api/auth/me', async () => {
      await delay(100)
      return HttpResponse.json({
        user: { ...currentUser, onboarded: false },
      })
    }),
  ],

  // Scenario: MCP unavailable
  mcpUnavailable: [
    http.get('/api/mcp/status', async () => {
      await delay(100)
      return HttpResponse.json({
        opsClient: { available: false, toolCount: 0 },
        deployClient: { available: false, toolCount: 0 },
      })
    }),
  ],
}
