// Data fetching functions for cluster list and health

import { api } from '../../lib/api'
import { reportAgentDataError, reportAgentDataSuccess } from '../useLocalAgent'
import { isNetlifyDeployment } from '../../lib/demoMode'
import { isClusterModeBackend } from '../../lib/cache/fetcherUtils'
import { MCP_PROBE_TIMEOUT_MS } from '../../lib/constants/network'
import { getLocalAgentURL, agentFetch } from './agentFetch'
import type { ClusterInfo } from './types'

/**
 * Fetch cluster list from the backend API (/api/mcp/clusters).
 * This endpoint works independently of kc-agent — it uses the MCP bridge or
 * direct k8s client, making it the right choice when kagenti/kagent is active. (#9535)
 */
export async function fetchClusterListFromBackendAPI(): Promise<ClusterInfo[] | null> {
  try {
    const { data } = await api.get<{ clusters: ClusterInfo[] }>('/api/mcp/clusters')
    if (data?.clusters) {
      reportAgentDataSuccess()
      return data.clusters
    }
  } catch {
    // Backend API unavailable
  }
  return null
}

// Fetch basic cluster list from local agent (fast, no health check)
export async function fetchClusterListFromAgent(): Promise<ClusterInfo[] | null> {
  // On Netlify deployments (isNetlifyDeployment), skip agent entirely — there is
  // no local agent and the request would fail with CORS errors.
  // On localhost, always attempt to reach the agent — it may be running even if
  // AgentManager has not detected it yet.
  if (isNetlifyDeployment) return null

  // Route cluster discovery through the backend whenever cluster-mode
  // routing is active (kagenti/kagent preference or true in-cluster mode).
  if (isClusterModeBackend()) {
    return fetchClusterListFromBackendAPI()
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MCP_PROBE_TIMEOUT_MS)
    const response = await agentFetch(`${getLocalAgentURL()}/clusters`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (response.ok) {
      // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
      // before the outer try/catch processes the rejection (microtask timing issue).
      const data = await response.json().catch(() => null)
      if (!data) throw new Error('Invalid JSON response from agent')
      // Report successful data fetch - can recover from degraded state
      reportAgentDataSuccess()
      // Transform agent response to ClusterInfo format - mark as "checking" initially
      return (data.clusters || []).map((c: { name: string; context?: string; server: string; user: string; isCurrent?: boolean; authMethod?: string }) => ({
        name: c.name,
        context: c.context || c.name,
        server: c.server,
        user: c.user,
        // healthy left undefined until health check completes (prevents false-positive green status)
        reachable: undefined, // Unknown until health check completes
        source: 'kubeconfig',
        nodeCount: undefined, // undefined = still checking, 0 = unreachable
        podCount: undefined,
        isCurrent: c.isCurrent,
        authMethod: c.authMethod,
      }))
    } else {
      // Non-OK response (e.g., 503 Service Unavailable)
      reportAgentDataError('/clusters', `HTTP ${response.status}`)
    }
  } catch {
    // Error will be tracked by useLocalAgent's health check
  }
  return null
}
