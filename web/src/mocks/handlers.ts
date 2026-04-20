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
  http.get('/api/youtube/playlist', () => passthrough()),
  http.get('/api/youtube/thumbnail/*', () => passthrough()),
  http.get('/api/medium/blog', () => passthrough()),
  http.get('/api/missions/file', () => passthrough()),
  http.get('/api/missions/browse', () => passthrough()),
  http.get('/api/rewards/github', () => passthrough()),
  // Public contributor badge (RFC #8862 Phase 3) — backed by a Netlify
  // Function that returns SVG. Must be http.all so that the CORS OPTIONS
  // preflight does not get swallowed by the catch-all /api/* below
  // (per feedback_msw_passthrough.md).
  http.all('/api/rewards/badge/*', () => passthrough()),
  // NPS (voluntary feedback) — use http.all so the CORS preflight
  // OPTIONS request also passes through. Without this, the catch-all
  // http.all('/api/*') below returns 503 on the preflight and the
  // browser blocks the actual POST.
  http.all('/api/nps', () => passthrough()),
  http.all('/api/acmm/scan', () => passthrough()),
  // GitHub Pipelines dashboard — backed by Netlify Function that caches
  // GitHub Actions data in Netlify Blobs. Must be http.all (not just
  // http.get) to cover mutation POSTs + CORS preflight.
  http.all('/api/github-pipelines', () => passthrough()),

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
