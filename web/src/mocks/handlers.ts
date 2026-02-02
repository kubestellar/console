import { http, HttpResponse, delay } from 'msw'

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
  { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6 },
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

// Stored card configurations for sharing tests
const savedCards: Record<string, unknown> = {}
const sharedDashboards: Record<string, unknown> = {}

export const handlers = [
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
      token: 'mock-jwt-token-for-testing-only', // NOT A REAL TOKEN - Mock data for E2E tests
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
      token: 'mock-jwt-token-for-testing-only', // NOT A REAL TOKEN - Mock data for E2E tests
    })
  }),

  // Health check
  http.get('/api/health', async () => {
    await delay(50)
    return HttpResponse.json({ status: 'ok', version: 'demo' })
  }),

  // Active users (for presence tracking)
  http.get('/api/active-users', async () => {
    await delay(50)
    return HttpResponse.json({ activeUsers: 1, totalConnections: 1 })
  }),

  http.post('/api/active-users', async () => {
    await delay(50)
    return HttpResponse.json({ success: true })
  }),

  // Permissions
  http.get('/api/permissions/summary', async () => {
    await delay(50)
    // Return proper PermissionsSummary structure with clusters map
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

  // Deployments list (for cluster-specific queries)
  http.get('/api/mcp/deployments', async () => {
    await delay(100)
    return HttpResponse.json({
      deployments: [
        { name: 'nginx', namespace: 'default', replicas: 3, ready: 3, cluster: 'kind-local' },
        { name: 'redis', namespace: 'cache', replicas: 2, ready: 2, cluster: 'kind-local' },
        { name: 'api-server', namespace: 'backend', replicas: 5, ready: 5, cluster: 'kind-local' },
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
