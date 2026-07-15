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

import {
  demoClusters,
  demoPodIssues,
  demoDeploymentIssues,
  demoEvents,
  demoGPUNodes,
  demoSecurityIssues,
  getDefaultUser,
  resetShareRegistries,
} from './handlers.fixtures'
import { createComplianceHandlers } from './handlers.compliance'
import { createIntegrationHandlers } from './handlers.integrations'
import { createPlatformHandlers } from './handlers.platform'
import { createSupplyChainHandlers } from './handlers.supply-chain'

/**
 * Factory function that creates fresh MSW handlers with isolated state.
 * 
 * Each call returns a new set of handlers with fresh mutable state
 * (currentUser, savedCards, sharedDashboards), preventing test contamination
 * when tests mutate state via onboarding or card sharing endpoints.
 * 
 * This fixes #11020: Shared mutable state in MSW handlers was causing
 * order-dependent test failures due to state persistence across test runs.
 * 
 * @returns Array of MSW request handlers with fresh isolated state
 */
export function createHandlers() {
  // Use module-level savedCards/sharedDashboards from handlers.fixtures.ts
  // so resetShareRegistries() can clear them via the __test/reset endpoint.
  const currentUser = getDefaultUser()
  resetShareRegistries()

  return [
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

  // NVIDIA operator requests fall back to same-origin relative URLs when the
  // local kc-agent is suppressed. Pass them through so MSW doesn't warn during
  // cluster flows before the hook gracefully handles the missing backend.
  http.all('/nvidia-operators', () => passthrough()),
  http.all('/nvidia-operators/stream', () => passthrough()),

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


  ...createComplianceHandlers(),

  ...createPlatformHandlers(),


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


  ...createIntegrationHandlers(),

  ...createSupplyChainHandlers(),

  // ── Catch-all for unmocked API routes ────────────────────────────
  // On Netlify, unhandled /api/* and /health requests fall through to the SPA
  // catch-all which returns index.html (200 OK, text/html). Code calling
  // .json() then throws "Unexpected token '<'". This catch-all returns a
  // proper JSON 503 so callers hit their error paths gracefully.
  //
  // IMPORTANT (#9797): Use a regex instead of '/api/*' because MSW v2 path
  // patterns treat '*' as a single-segment wildcard. '/api/*' only matches
  // paths like '/api/foo' but NOT multi-segment paths like
  // '/api/compliance/frameworks/' or '/api/compliance/nist/families'.
  // The enterprise compliance dashboards fetch '/api/compliance/<vertical>/<resource>'
  // which slipped through the old catch-all, hit the Netlify SPA fallback,
  // and received index.html (200 OK, text/html) instead of JSON.
  //
  // IMPORTANT (#9831): MSW applies regex matchers to the FULL request URL
  // (e.g. 'https://host/api/compliance/...'), not just the path. An anchored
  // pattern like /^\/api\// never matches because the URL starts with the
  // protocol. Drop the `^` anchor so the regex matches '/api/' anywhere in
  // the URL.

  // ── Test utilities ─────────────────────────────────────────────────
  // Reset share registries to prevent cross-test pollution (#11035).
  // Guarded by X-Test-Request header so it is not callable in normal
  // demo-mode browser sessions — only automated test clients send this header.
  // Tests should call this in beforeEach:
  //   test.beforeEach(async ({ page }) => {
  //     await page.request.post('/__test/reset', {
  //       headers: { 'X-Test-Request': '1' },
  //     })
  //   })
  // Quantum proxy — pass through to the Netlify function (or Go backend in
  // local dev). Without these rules MSW swallows every /api/quantum/** request
  // in demo mode and the quantum panel never receives data.
  http.get('/api/quantum/**', () => passthrough()),
  http.post('/api/quantum/**', () => passthrough()),
  http.delete('/api/quantum/**', () => passthrough()),
  http.get('/api/result/histogram', () => passthrough()),

  http.post('/__test/reset', ({ request }) => {
    if (!request.headers.get('X-Test-Request')) {
      return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    resetShareRegistries()
    return HttpResponse.json({ success: true })
  }),

  http.all(/\/api\//, () => {
    return HttpResponse.json(
      { error: 'not available in demo mode' },
      { status: 503 },
    )
  }),
]
}

// Backward-compatible export - creates handlers on module load
// DEPRECATED: Tests should call createHandlers() in beforeEach/setup
// to get fresh state and avoid test contamination (#11020)
export const handlers = createHandlers()

export { scenarios } from './handlers.scenarios'
