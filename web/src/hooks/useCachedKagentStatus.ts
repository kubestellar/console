/**
 * useCachedKagentStatus — Hook for kagent monitoring status.
 *
 * Uses the createCachedHook factory for zero-boilerplate caching.
 * Returns CachedHookResult<KagentStatusData> with agent status and metrics.
 *
 * Data source: GET /api/kagent/status — returns cluster-level kagent
 * agent status, readiness, and activity metrics.
 */

import { createCachedHook } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_KAGENT_STATUS = 'kagent_status'

/** Thresholds for health status classification */
export const HEALTH_THRESHOLD_HEALTHY = 90
export const HEALTH_THRESHOLD_WARNING = 70

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KagentAgentStatus {
  name: string
  namespace: string
  cluster: string
  status: 'Ready' | 'Pending' | 'Failed' | 'Accepted'
  agentType: 'Declarative' | 'BYO'
  runtime: string
  replicas: number
  readyReplicas: number
  modelConfigRef: string
  toolCount: number
  a2aEnabled: boolean
  lastHeartbeat?: string
  uptime?: string
}

export interface ClusterKagentStatus {
  cluster: string
  totalAgents: number
  readyAgents: number
  pendingAgents: number
  failedAgents: number
  healthPercentage: number
  agents: KagentAgentStatus[]
}

export interface KagentStatusData {
  clusters: ClusterKagentStatus[]
  totalAgents: number
  totalReady: number
  overallHealth: number
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_DATA: KagentStatusData = {
  clusters: [
    {
      cluster: 'prod-east',
      totalAgents: 4,
      readyAgents: 3,
      pendingAgents: 0,
      failedAgents: 1,
      healthPercentage: 75,
      agents: [
        {
          name: 'k8s-assistant',
          namespace: 'kagent-system',
          cluster: 'prod-east',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 2,
          readyReplicas: 2,
          modelConfigRef: 'claude-sonnet',
          toolCount: 4,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T15:30:00Z',
          uptime: '68d 5h 30m',
        },
        {
          name: 'code-reviewer',
          namespace: 'kagent-system',
          cluster: 'prod-east',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 1,
          readyReplicas: 1,
          modelConfigRef: 'gpt-4o',
          toolCount: 2,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T15:29:00Z',
          uptime: '63d 7h 30m',
        },
        {
          name: 'log-parser',
          namespace: 'kagent-ops',
          cluster: 'prod-east',
          status: 'Ready',
          agentType: 'BYO',
          runtime: 'go',
          replicas: 1,
          readyReplicas: 1,
          modelConfigRef: 'ollama-llama',
          toolCount: 1,
          a2aEnabled: false,
          lastHeartbeat: '2025-03-24T15:28:00Z',
          uptime: '71d 2h 30m',
        },
        {
          name: 'security-scanner',
          namespace: 'kagent-system',
          cluster: 'prod-east',
          status: 'Failed',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 2,
          readyReplicas: 0,
          modelConfigRef: 'claude-sonnet',
          toolCount: 6,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T14:00:00Z',
          uptime: '0d 0h 0m',
        },
      ],
    },
    {
      cluster: 'prod-west',
      totalAgents: 3,
      readyAgents: 3,
      pendingAgents: 0,
      failedAgents: 0,
      healthPercentage: 100,
      agents: [
        {
          name: 'incident-bot',
          namespace: 'kagent-system',
          cluster: 'prod-west',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'go',
          replicas: 3,
          readyReplicas: 3,
          modelConfigRef: 'claude-sonnet',
          toolCount: 5,
          a2aEnabled: false,
          lastHeartbeat: '2025-03-24T15:30:00Z',
          uptime: '73d 1h 30m',
        },
        {
          name: 'helm-deployer',
          namespace: 'kagent-system',
          cluster: 'prod-west',
          status: 'Accepted',
          agentType: 'BYO',
          runtime: '',
          replicas: 1,
          readyReplicas: 1,
          modelConfigRef: 'gemini-pro',
          toolCount: 3,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T15:29:00Z',
          uptime: '61d 9h 30m',
        },
        {
          name: 'drift-detector',
          namespace: 'kagent-ops',
          cluster: 'prod-west',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 1,
          readyReplicas: 1,
          modelConfigRef: 'claude-sonnet',
          toolCount: 3,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T15:30:00Z',
          uptime: '69d 0h 30m',
        },
      ],
    },
    {
      cluster: 'staging',
      totalAgents: 2,
      readyAgents: 1,
      pendingAgents: 1,
      failedAgents: 0,
      healthPercentage: 50,
      agents: [
        {
          name: 'security-scanner',
          namespace: 'kagent-system',
          cluster: 'staging',
          status: 'Ready',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 2,
          readyReplicas: 2,
          modelConfigRef: 'claude-sonnet',
          toolCount: 6,
          a2aEnabled: true,
          lastHeartbeat: '2025-03-24T15:30:00Z',
          uptime: '65d 4h 30m',
        },
        {
          name: 'cost-analyzer',
          namespace: 'kagent-ops',
          cluster: 'staging',
          status: 'Pending',
          agentType: 'Declarative',
          runtime: 'python',
          replicas: 1,
          readyReplicas: 0,
          modelConfigRef: 'gpt-4o-mini',
          toolCount: 2,
          a2aEnabled: false,
          lastHeartbeat: '2025-03-24T15:25:00Z',
          uptime: '0d 0h 5m',
        },
      ],
    },
  ],
  totalAgents: 9,
  totalReady: 7,
  overallHealth: 78,
}

/** Initial empty payload while the first fetch resolves. */
const INITIAL_DATA: KagentStatusData = {
  clusters: [],
  totalAgents: 0,
  totalReady: 0,
  overallHealth: 0,
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchKagentStatus(): Promise<KagentStatusData> {
  const resp = await fetch('/api/kagent/status', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) throw new Error(`kagent status HTTP ${resp.status}`)

  const body: KagentStatusData = await resp.json()
  return {
    clusters: Array.isArray(body?.clusters) ? body.clusters : [],
    totalAgents: body?.totalAgents || 0,
    totalReady: body?.totalReady || 0,
    overallHealth: body?.overallHealth || 0,
  }
}

// ---------------------------------------------------------------------------
// Hook (factory)
// ---------------------------------------------------------------------------

export const useCachedKagentStatus = createCachedHook<KagentStatusData>({
  key: CACHE_KEY_KAGENT_STATUS,
  category: 'clusters',
  initialData: INITIAL_DATA,
  demoData: DEMO_DATA,
  fetcher: fetchKagentStatus,
})
