import { agentFetch } from '../shared'
import { MCP_HOOK_TIMEOUT_MS, LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { isClusterModeBackend } from '../../../lib/cache/fetcherUtils'
import { useClusterResourceQuery } from '../useClusterResourceQuery'
import type { ResourceQuota, LimitRange, ResourceQuotaSpec } from '../types'
import { getDemoResourceQuotas, getDemoLimitRanges } from './storageDemoData'

// Hook to get ResourceQuotas
// When forceLive is true, skip demo mode fallback and always query the real API.
// Used by GPU Reservations to show live data when running in-cluster with OAuth.
// Returns `isDemoFallback: true` when the hook is serving demo data so callers
// can render the Demo badge only for true demo output. See Issue 9356.
export function useResourceQuotas(cluster?: string, namespace?: string, forceLive = false) {
  const result = useClusterResourceQuery<ResourceQuota>({
    resourceKey: 'resourceQuotas',
    endpoint: 'resourcequotas',
    dataField: 'resourceQuotas',
    getDemoData: getDemoResourceQuotas,
    filterFn: (item, c, ns) => (!c || item.cluster === c) && (!ns || item.namespace === ns),
    cluster,
    namespace,
    forceLive,
    silentErrors: true,
  })

  return {
    resourceQuotas: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
    isDemoFallback: result.isDemoFallback,
  }
}

// Hook to get LimitRanges
export function useLimitRanges(cluster?: string, namespace?: string) {
  const result = useClusterResourceQuery<LimitRange>({
    resourceKey: 'limitRanges',
    endpoint: 'limitranges',
    dataField: 'limitRanges',
    getDemoData: getDemoLimitRanges,
    filterFn: (item, c, ns) => (!c || item.cluster === c) && (!ns || item.namespace === ns),
    cluster,
    namespace,
    silentErrors: true,
  })

  return {
    limitRanges: result.data,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  }
}

// Create or update a ResourceQuota
export async function createOrUpdateResourceQuota(spec: ResourceQuotaSpec): Promise<ResourceQuota> {
  if (isClusterModeBackend()) {
    const response = await fetch('/api/mcp/resourcequotas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
      signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return data.resourceQuota
  }

  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/resourcequotas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  return data.resourceQuota
}

// Delete a ResourceQuota
export async function deleteResourceQuota(cluster: string, namespace: string, name: string): Promise<void> {
  const params = new URLSearchParams({ cluster, namespace, name })

  if (isClusterModeBackend()) {
    const response = await fetch(`/api/mcp/resourcequotas?${params.toString()}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return
  }

  const resp = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/resourcequotas?${params.toString()}`, {
    method: 'DELETE',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
}
