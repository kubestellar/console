import { http, HttpResponse, delay } from 'msw'
import {
  demoGPUNodes,
  getDefaultUser,
} from './handlers.fixtures'

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
        user: { ...getDefaultUser(), onboarded: false },
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
