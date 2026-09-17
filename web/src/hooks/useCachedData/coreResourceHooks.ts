/**
 * Cached hooks for deployments, services, security issues and workloads.
 *
 * Extracted from useCachedCoreWorkloads.ts for maintainability.
 */

import { createCachedHook, useCache, type RefreshCategory, type CachedHookResult } from '../../lib/cache'
import { isBackendUnavailable } from '../../lib/api'
import { clusterCacheRef, agentFetch } from '../mcp/shared'
import { isAgentUnavailable } from '../useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import {
  fetchBackendAPI,
  fetchFromAllClusters,
  fetchViaSSE,
  fetchViaBackendSSE,
  getToken,
  getClusterFetcher,
  AGENT_HTTP_TIMEOUT_MS,
} from '../../lib/cache/fetcherUtils'
import { fetchDeploymentsViaAgent, fetchWorkloadsFromAgent } from './agentFetchers'
import {
  getDemoDeployments,
  getDemoServices,
  getDemoSecurityIssues,
  getDemoWorkloads,
} from './demoData'
import { fetchSecurityIssuesViaKubectl } from './securityScanner'
import { DeploymentsResponseSchema } from '../../lib/schemas'
import { validateArrayResponse } from '../../lib/schemas/validate'
import type { Deployment, Service, SecurityIssue } from '../useMCP'
import type { Workload } from '../useWorkloads'

/**
 * Hook for fetching deployments with caching
 */
export function useCachedDeployments(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Deployment[]> & { deployments: Deployment[] } {
  const { category = 'deployments' } = options || {}
  const key = `deployments:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Deployment[],
    demoData: getDemoDeployments(),
    fetcher: async () => {
      // Try agent first (fast, no backend needed) — skip if agent is unavailable
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const params = new URLSearchParams()
          const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
          params.append('cluster', clusterInfo?.context || cluster)
          if (namespace) params.append('namespace', namespace)

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), AGENT_HTTP_TIMEOUT_MS)
          const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' } })
          clearTimeout(timeoutId)

          if (response.ok) {
            const rawData = await response.json().catch(() => null)
            if (!rawData) return []
            const data = validateArrayResponse<{ deployments: Deployment[] }>(DeploymentsResponseSchema, rawData, '/agent/deployments', 'deployments')
            return (data.deployments || []).map(d => ({
              ...d,
              cluster: cluster }))
          }
          // Agent errored for the requested cluster — return no data instead
          // of incorrectly falling through to the multi-cluster agent fetch
          // below, which ignores the requested `cluster` entirely.
          return []
        }
        const agentDeployments = await fetchDeploymentsViaAgent(namespace)
        // null means the agent was unreachable (e.g. no local kc-agent on
        // the hosted console) — fall through to the REST API below instead
        // of treating it as a genuine empty result (#23107).
        if (agentDeployments) return agentDeployments
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        if (cluster) {
          const raw = await getClusterFetcher()<unknown>('deployments', { cluster, namespace })
          const data = validateArrayResponse<{ deployments: Deployment[] }>(DeploymentsResponseSchema, raw, '/api/mcp/deployments', 'deployments')
          const deployments = data.deployments || []
          return deployments.map(d => ({ ...d, cluster: d.cluster || cluster }))
        }
        return await fetchFromAllClusters<Deployment>('deployments', 'deployments', { namespace })
      }

      throw new Error("No data source available")
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const agentDeployments = await fetchDeploymentsViaAgent(namespace, onProgress)
        // null means the agent was unreachable — fall through to SSE below
        // instead of treating it as a genuine empty result (#23107).
        if (agentDeployments) return agentDeployments
      }

      // Fall back to SSE streaming -> REST per-cluster
      return await fetchViaSSE<Deployment>('deployments', 'deployments', { namespace }, onProgress)
    } })

  return {
    deployments: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching services with caching
 */
export function useCachedServices(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<Service[]> & { services: Service[] } {
  const { category = 'services' } = options || {}
  const key = `services:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as Service[],
    demoData: getDemoServices(),
    fetcher: async () => {
      if (cluster) {
        const data = await getClusterFetcher()<{ services: Service[] }>('services', { cluster, namespace })
        return (data.services || []).map(s => ({ ...s, cluster }))
      }
      return await fetchFromAllClusters<Service>('services', 'services', { namespace })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<Service>('services', 'services', { namespace }, onProgress)
    } })

  return {
    services: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching security issues with caching.
 * Provides stale-while-revalidate: shows cached data immediately while refreshing.
 */
export function useCachedSecurityIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<SecurityIssue[]> & { issues: SecurityIssue[] } {
  const { category = 'pods' } = options || {}
  const key = `securityIssues:${cluster || 'all'}:${namespace || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as SecurityIssue[],
    demoData: getDemoSecurityIssues(),
    fetcher: async () => {
      // Try kubectl proxy first (uses agent to run kubectl commands) — skip if agent is unavailable
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        try {
          const issues = await fetchSecurityIssuesViaKubectl(cluster, namespace)
          if (issues.length > 0) return issues
        } catch (err: unknown) {
          console.error('[useCachedSecurityIssues] kubectl fetch failed:', err)
        }
      }

      // Fall back to REST API — security-issues is a backend-only endpoint (#9996)
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        try {
          const data = await fetchBackendAPI<{ issues: SecurityIssue[] }>('security-issues', { cluster, namespace })
          if (data?.issues && data.issues.length > 0) return data.issues
        } catch (err: unknown) {
          console.error('[useCachedSecurityIssues] API fetch failed:', err)
        }
      }

      throw new Error("No data source available")
    },
    // Progressive loading: show results as each cluster completes
    progressiveFetcher: !cluster ? async (onProgress) => {
      // Try kubectl proxy first (progressive) — skip if agent is unavailable
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        try {
          const issues = await fetchSecurityIssuesViaKubectl(cluster, namespace, onProgress)
          if (issues.length > 0) return issues
        } catch (err: unknown) {
          console.error('[useCachedSecurityIssues] progressive kubectl fetch failed:', err)
        }
      }

      // Fall back to SSE streaming via backend — security-issues is backend-only (#9996)
      return await fetchViaBackendSSE<SecurityIssue>('security-issues', 'issues', { namespace }, onProgress)
    } : undefined })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching workloads with caching.
 * Fetches all workloads across all clusters via agent, then REST fallback.
 */
export function useCachedWorkloads(
  options?: { category?: RefreshCategory }
): CachedHookResult<Workload[]> & { workloads: Workload[] } {
  const { category = 'deployments' } = options || {}
  const key = 'workloads:all:all'

  const useWorkloadsBase = createCachedHook<Workload[]>({
    key,
    category,
    initialData: [] as Workload[],
    demoData: getDemoWorkloads(),
    fetcher: async () => {
      // Try agent first (fast, no backend needed)
      const agentData = await fetchWorkloadsFromAgent()
      if (agentData) return agentData

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const res = await fetch('/api/workloads', {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
        if (res.ok) {
          const data = await res.json().catch(() => null)
          if (!data) return []
          const items = (data.items || data) as Array<Record<string, unknown>>
          return items.map(d => ({
            name: String(d.name || ''),
            namespace: String(d.namespace || 'default'),
            type: (String(d.type || 'Deployment')) as Workload['type'],
            cluster: String(d.cluster || ''),
            targetClusters: (d.targetClusters as string[]) || (d.cluster ? [String(d.cluster)] : []),
            replicas: Number(d.replicas || 1),
            readyReplicas: Number(d.readyReplicas || 0),
            status: (String(d.status || 'Running')) as Workload['status'],
            image: String(d.image || ''),
            labels: (d.labels as Record<string, string>) || {},
            createdAt: String(d.createdAt || new Date().toISOString()) }))
        }
      }

      return []
    },
    progressiveFetcher: async (onProgress) => {
      // Try agent first (progressive via kc-agent)
      const agentData = await fetchWorkloadsFromAgent(onProgress)
      if (agentData) return agentData

      // Fall back to SSE streaming -> progressive per-cluster
      return await fetchViaSSE<Workload>('workloads', 'workloads', {}, onProgress)
    } })
  const result = useWorkloadsBase()

  return {
    workloads: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}
