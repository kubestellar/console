import { http, HttpResponse, delay } from 'msw'
import {
  pruneRegistry,
  sharedDashboards,
} from './handlers.fixtures'

export function createPlatformHandlers() {
  return [
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
  // Both /api/mcp/ (legacy) and / (hooks with empty LOCAL_AGENT_HTTP_URL) paths
  http.get('/api/mcp/statefulsets', async () => {
    await delay(100)
    return HttpResponse.json({
      statefulsets: [
        { name: 'postgres', namespace: 'data', cluster: 'kind-local', replicas: 3, readyReplicas: 3, currentReplicas: 3 },
        { name: 'elasticsearch', namespace: 'logging', cluster: 'kind-local', replicas: 3, readyReplicas: 2, currentReplicas: 3 },
      ],
    })
  }),
  http.get('/statefulsets', async () => {
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
  http.get('/daemonsets', async () => {
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
  http.get('/cronjobs', async () => {
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

  // Root-level health check. Used by useBackendHealth, useSelfUpgrade,
  // useBranding, AND useSidebarConfig (which reads enabled_dashboards to
  // promote DISCOVERABLE_DASHBOARDS like Quantum Demo into the sidebar).
  // Mirrors web/netlify/functions/health.mts — keep enabled_dashboards AND
  // branding in sync with that file (and the Go side at pkg/api/projects.go);
  // the parity test in web/netlify/functions/__tests__/health.test.ts catches
  // drift across all three copies.
  http.get('/health', async () => {
    await delay(50)
    return HttpResponse.json({
      status: 'ok',
      version: 'demo',
      oauth_configured: false,
      in_cluster: false,
      no_local_agent: true,
      install_method: 'netlify',
      project: 'kubestellar',
      workloads: {
        quantum_kc_demo_available: false,
      },
      enabled_dashboards: [
        'dashboard', 'clusters', 'cluster-admin', 'compliance', 'deploy',
        'insights', 'ai-ml', 'ai-agents', 'acmm', 'ci-cd',
        'multi-tenancy', 'alerts', 'arcade', 'quantum',
        'llm-d-benchmarks', 'gpu-reservations',
        'compute', 'security', 'storage', 'network', 'events',
        'workloads', 'operators', 'nodes', 'deployments', 'pods',
        'services', 'helm', 'logs', 'data-compliance', 'cost',
        'gitops', 'gpu',
      ],
      branding: {
        appName: 'KubeStellar Console',
        appShortName: 'KubeStellar',
        tagline: 'multi-cluster first, saving time and tokens',
        logoUrl: '/kubestellar-logo.svg',
        faviconUrl: '/favicon.ico',
        themeColor: '#7c3aed',
        docsUrl: 'https://kubestellar.io/docs/console/readme',
        communityUrl: 'https://kubestellar.io/community',
        websiteUrl: 'https://kubestellar.io',
        issuesUrl: 'https://github.com/kubestellar/kubestellar/issues/new',
        repoUrl: 'https://github.com/kubestellar/console',
        hostedDomain: 'console.kubestellar.io',
        showStarDecoration: true,
        showAdopterNudge: true,
        showDemoToLocalCTA: true,
        showRewards: true,
        showLinkedInShare: true,
      },
    })
  }),
]
}
