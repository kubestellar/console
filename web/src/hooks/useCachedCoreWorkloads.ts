/**
 * Cached hooks for core Kubernetes workload data:
 * Pods, Events, Pod Issues, Deployment Issues, Deployments, Services,
 * Security Issues, Workloads, and All Pods (GPU allocation).
 *
 * Extracted from useCachedData.ts for maintainability.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { isBackendUnavailable } from '../lib/api'
import { kubectlProxy } from '../lib/kubectlProxy'
import { clusterCacheRef, agentFetch } from './mcp/shared'
import { isAgentUnavailable } from './useLocalAgent'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS, KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import { VULN_SEVERITY_ORDER } from '../types/alerts'
import { settledWithConcurrency } from '../lib/utils/concurrency'
import {
  fetchAPI,
  fetchBackendAPI,
  fetchFromAllClusters,
  fetchFromAllClustersViaBackend,
  fetchViaSSE,
  fetchViaBackendSSE,
  getToken,
  AGENT_HTTP_TIMEOUT_MS,
} from '../lib/cache/fetcherUtils'
import {
  fetchPodIssuesViaAgent,
  fetchDeploymentsViaAgent,
  fetchWorkloadsFromAgent,
  getAgentClusters,
} from './useCachedData/agentFetchers'
import {
  getDemoPods,
  getDemoEvents,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoDeployments,
  getDemoServices,
  getDemoSecurityIssues,
  getDemoWorkloads,
} from './useCachedData/demoData'
import {
  PodsResponseSchema,
  EventsResponseSchema,
  DeploymentsResponseSchema,
} from '../lib/schemas'
import { validateArrayResponse } from '../lib/schemas/validate'
import type {
  PodInfo,
  PodIssue,
  ClusterEvent,
  DeploymentIssue,
  Deployment,
  Service,
  SecurityIssue,
} from './useMCP'
import type { Workload } from './useWorkloads'

// ============================================================================
// Shared types
// ============================================================================

// ============================================================================
// Private: Security kubectl scanner
// ============================================================================

/**
 * Fetch security issues via kubectlProxy — scans pods for security misconfigurations
 */
async function fetchSecurityIssuesViaKubectl(cluster?: string, namespace?: string, onProgress?: (partial: SecurityIssue[]) => void): Promise<SecurityIssue[]> {
  if (isAgentUnavailable()) return []
  const clusters = getAgentClusters()
  if (clusters.length === 0) return []

  const severityOrder = VULN_SEVERITY_ORDER

  const tasks = clusters
    .filter(c => !cluster || c.name === cluster)
    .map(({ name, context }) => async () => {
      const ctx = context || name
      // Get all pods and check for security issues
      const nsFlag = namespace ? ['-n', namespace] : ['-A']
      const response = await kubectlProxy.exec(
        ['get', 'pods', ...nsFlag, '-o', 'json'],
        { context: ctx, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }
      )

      if (response.exitCode !== 0) return []

      const data = JSON.parse(response.output)
      const issues: SecurityIssue[] = []

      for (const pod of data.items || []) {
        const podName = pod.metadata?.name || 'unknown'
        const podNs = pod.metadata?.namespace || 'default'
        const spec = pod.spec || {}

        // Check for security misconfigurations
        for (const container of spec.containers || []) {
          const sc = container.securityContext || {}
          const podSc = spec.securityContext || {}

          // Privileged container
          if (sc.privileged === true) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Privileged container', severity: 'high', details: 'Container running in privileged mode' })
          }

          // Running as root
          if (sc.runAsUser === 0 || (sc.runAsNonRoot !== true && podSc.runAsNonRoot !== true && !sc.runAsUser)) {
            const isRoot = sc.runAsUser === 0 || podSc.runAsUser === 0
            if (isRoot) {
              issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Running as root', severity: 'high', details: 'Container running as root user' })
            }
          }

          // Missing security context
          if (!sc.runAsNonRoot && !sc.readOnlyRootFilesystem && !sc.allowPrivilegeEscalation && !sc.capabilities) {
            issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Missing security context', severity: 'low', details: 'No security context defined' })
          }

          // Capabilities not dropped
          if (sc.capabilities?.drop?.length === 0 || !sc.capabilities?.drop) {
            if (sc.capabilities?.add?.length > 0) {
              issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Capabilities not dropped', severity: 'medium', details: 'Container not dropping all capabilities' })
            }
          }
        }

        // Host network
        if (spec.hostNetwork === true) {
          issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host network enabled', severity: 'medium', details: 'Pod using host network namespace' })
        }

        // Host PID
        if (spec.hostPID === true) {
          issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host PID enabled', severity: 'high', details: 'Pod using host PID namespace' })
        }

        // Host IPC
        if (spec.hostIPC === true) {
          issues.push({ name: podName, namespace: podNs, cluster: name, issue: 'Host IPC enabled', severity: 'medium', details: 'Pod using host IPC namespace' })
        }
      }

      return issues
    })

  const accumulated: SecurityIssue[] = []
  function handleSettled(result: PromiseSettledResult<SecurityIssue[]>) {
    if (result.status === 'fulfilled') {
      accumulated.push(...result.value)
      accumulated.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
      onProgress?.([...accumulated])
    }
  }
  await settledWithConcurrency(tasks, undefined, handleSettled)
  // Final sort
  return accumulated.sort((a, b) => (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5))
}

// ============================================================================
// Re-exports for prefetch access
// ============================================================================

export {
  fetchPodIssuesViaAgent,
  fetchDeploymentsViaAgent,
  fetchWorkloadsFromAgent,
  fetchSecurityIssuesViaKubectl,
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching pods with caching.
 * When no cluster is specified, fetches from all available clusters.
 */
export function useCachedPods(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { limit = 100, category = 'pods' } = options || {}
  const key = `pods:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  // Note: useCache handles demo mode detection internally via useSyncExternalStore
  const result = useCache({
    key,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
    fetcher: async () => {
      let pods: PodInfo[]
      if (cluster) {
        const raw = await fetchAPI<unknown>('pods', { cluster, namespace })
        const data = validateArrayResponse<{ pods: PodInfo[] }>(PodsResponseSchema, raw, '/api/mcp/pods', 'pods')
        pods = (data.pods || []).map(p => ({ ...p, cluster }))
      } else {
        pods = await fetchFromAllClusters<PodInfo>('pods', 'pods', { namespace })
      }
      return pods
        .sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
        .slice(0, limit)
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      const pods = await fetchViaSSE<PodInfo>('pods', 'pods', { namespace }, (partial) => {
        onProgress(partial.sort((a, b) => (b.restarts || 0) - (a.restarts || 0)).slice(0, limit))
      })
      return pods
        .sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
        .slice(0, limit)
    } })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching all pods (no namespace filter) with caching.
 * Used by GPU cards that need all pods across clusters for allocation tracking.
 */
export function useCachedAllPods(
  cluster?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<PodInfo[]> & { pods: PodInfo[] } {
  const { category = 'pods' } = options || {}
  const key = `allPods:${cluster || 'all'}`

  const result = useCache({
    key,
    category,
    initialData: [] as PodInfo[],
    demoData: getDemoPods(),
    fetcher: async () => {
      if (cluster) {
        const raw = await fetchAPI<unknown>('pods', { cluster })
        const data = validateArrayResponse<{ pods: PodInfo[] }>(PodsResponseSchema, raw, '/api/mcp/pods (allPods)', 'pods')
        return (data.pods || []).map(p => ({ ...p, cluster }))
      }
      return await fetchFromAllClusters<PodInfo>('pods', 'pods')
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      return await fetchViaSSE<PodInfo>('pods', 'pods', {}, onProgress)
    } })

  return {
    pods: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching events with caching
 */
export function useCachedEvents(
  cluster?: string,
  namespace?: string,
  options?: { limit?: number; category?: RefreshCategory }
): CachedHookResult<ClusterEvent[]> & { events: ClusterEvent[] } {
  const { limit = 20, category = 'realtime' } = options || {}
  const key = `events:${cluster || 'all'}:${namespace || 'all'}:${limit}`

  const result = useCache({
    key,
    category,
    initialData: [] as ClusterEvent[],
    demoData: getDemoEvents(),
    fetcher: async () => {
      // Try agent first (direct kubectl proxy — works before backend auth)
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const ci = clusterCacheRef.clusters.find(c => c.name === cluster)
          const ctx = ci?.context || cluster
          const events = await kubectlProxy.getEvents(ctx, namespace, limit)
          return events.map(e => ({ ...e, cluster }))
        }
        // Fetch from all clusters via agent with bounded concurrency
        const clusters = getAgentClusters()
        const allEvents: ClusterEvent[] = []
        const results = await settledWithConcurrency(
          clusters.map((ci) => async () => {
            const ctx = ci.context || ci.name
            const events = await kubectlProxy.getEvents(ctx, namespace, limit)
            return events.map(e => ({ ...e, cluster: ci.name }))
          })
        )
        for (const r of (results || [])) {
          if (r.status === 'fulfilled') allEvents.push(...r.value)
        }
        return allEvents
          .sort((a, b) => {
            const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
            const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
            return timeB - timeA
          })
          .slice(0, limit)
      }

      // Fall back to REST API (requires backend auth)
      if (cluster) {
        const raw = await fetchAPI<unknown>('events', { cluster, namespace, limit })
        const data = validateArrayResponse<{ events: ClusterEvent[] }>(EventsResponseSchema, raw, '/api/mcp/events', 'events')
        return data.events || []
      }
      return await fetchFromAllClusters<ClusterEvent>('events', 'events', { namespace, limit })
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      // Try agent-based progressive fetch first
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const clusters = getAgentClusters()
        const accumulated: ClusterEvent[] = []
        const tasks = (clusters || []).map((ci) => async () => {
          const ctx = ci.context || ci.name
          const events = await kubectlProxy.getEvents(ctx, namespace, limit)
          return events.map(e => ({ ...e, cluster: ci.name }))
        })
        function handleSettled(result: PromiseSettledResult<ClusterEvent[]>) {
          if (result.status === 'fulfilled') {
            accumulated.push(...result.value)
            accumulated.sort((a, b) => {
              const timeA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0
              const timeB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0
              return timeB - timeA
            })
            onProgress([...accumulated].slice(0, limit))
          }
        }
        await settledWithConcurrency(tasks, undefined, handleSettled)
        return accumulated.slice(0, limit)
      }
      // Fall back to SSE via backend
      return await fetchViaSSE<ClusterEvent>('events', 'events', { namespace, limit }, onProgress)
    } })

  return {
    events: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching pod issues with caching.
 * When no cluster is specified, fetches from all available clusters.
 */
export function useCachedPodIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<PodIssue[]> & { issues: PodIssue[] } {
  const { category = 'pods' } = options || {}
  const key = `podIssues:${cluster || 'all'}:${namespace || 'all'}`

  const sortIssues = (items: PodIssue[]) => items.sort((a, b) => (b.restarts || 0) - (a.restarts || 0))

  const result = useCache({
    key,
    category,
    initialData: [] as PodIssue[],
    demoData: getDemoPodIssues(),
    fetcher: async () => {
      let issues: PodIssue[]

      // Try agent first (fast, no backend needed)
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
          const ctx = clusterInfo?.context || cluster
          issues = await kubectlProxy.getPodIssues(ctx, namespace)
          // Guard against null/undefined when proxy is disconnected or in cooldown
          issues = (issues || []).map(i => ({ ...i, cluster: cluster }))
        } else {
          issues = await fetchPodIssuesViaAgent(namespace)
        }
        return sortIssues(issues)
      }

      // Fall back to REST API — pod-issues is a backend-only endpoint (#9996)
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        if (cluster) {
          const data = await fetchBackendAPI<{ issues: PodIssue[] }>('pod-issues', { cluster, namespace })
          issues = (data.issues || []).map(i => ({ ...i, cluster }))
        } else {
          issues = await fetchFromAllClustersViaBackend<PodIssue>('pod-issues', 'issues', { namespace })
        }
        return sortIssues(issues)
      }

      // No data source available yet — throw so cache preserves existing data and retries
      throw new Error('No data source available (agent connecting or backend not authenticated)')
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      // Try agent first
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const issues = await fetchPodIssuesViaAgent(namespace, (partial) => {
          onProgress(sortIssues([...partial]))
        })
        return sortIssues(issues)
      }

      // Fall back to SSE streaming via backend — pod-issues is backend-only (#9996)
      const issues = await fetchViaBackendSSE<PodIssue>('pod-issues', 'issues', { namespace }, (partial) => {
        onProgress(sortIssues([...partial]))
      })
      return sortIssues(issues)
    } })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

/**
 * Hook for fetching deployment issues with caching
 */
export function useCachedDeploymentIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<DeploymentIssue[]> & { issues: DeploymentIssue[] } {
  const { category = 'deployments' } = options || {}
  const key = `deploymentIssues:${cluster || 'all'}:${namespace || 'all'}`

  const deriveIssues = (deployments: Deployment[]): DeploymentIssue[] =>
    deployments
      .filter(d => (d.readyReplicas ?? 0) < (d.replicas ?? 1))
      .map(d => ({
        name: d.name,
        namespace: d.namespace || 'default',
        cluster: d.cluster,
        replicas: d.replicas ?? 1,
        readyReplicas: d.readyReplicas ?? 0,
        reason: d.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure' }))

  const result = useCache({
    key,
    category,
    initialData: [] as DeploymentIssue[],
    demoData: getDemoDeploymentIssues(),
    fetcher: async () => {
      // Try agent first — derive deployment issues from deployment data
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const deployments = cluster
          ? await (async () => {
              const clusterInfo = clusterCacheRef.clusters.find(c => c.name === cluster)
              const params = new URLSearchParams()
              params.append('cluster', clusterInfo?.context || cluster)
              if (namespace) params.append('namespace', namespace)
              const ctrl = new AbortController()
              const tid = setTimeout(() => ctrl.abort(), AGENT_HTTP_TIMEOUT_MS)
              const res = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, {
                signal: ctrl.signal, headers: { Accept: 'application/json' } })
              clearTimeout(tid)
              if (!res.ok) return []
              const data = await res.json().catch(() => null)
              if (!data) return []
              return ((data.deployments || []) as Deployment[]).map(d => ({ ...d, cluster: cluster }))
          })()
          : await fetchDeploymentsViaAgent(namespace)

        return deriveIssues(deployments)
      }

      // Fall back to REST API — deployment-issues is a backend-only endpoint (#9996)
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const data = await fetchBackendAPI<{ issues: DeploymentIssue[] }>('deployment-issues', { cluster, namespace })
        return data.issues || []
      }

      throw new Error("No data source available")
    },
    progressiveFetcher: cluster ? undefined : async (onProgress) => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        const deployments = await fetchDeploymentsViaAgent(namespace, (partialDeps) => {
          onProgress(deriveIssues(partialDeps))
        })
        return deriveIssues(deployments)
      }

      // Fall back to SSE streaming via backend — deployment-issues is backend-only (#9996)
      const issues = await fetchViaBackendSSE<DeploymentIssue>('deployment-issues', 'issues', { namespace }, onProgress)
      return issues
    } })

  return {
    issues: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}

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
        }
        return fetchDeploymentsViaAgent(namespace)
      }

      // Fall back to REST API
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        if (cluster) {
          const raw = await fetchAPI<unknown>('deployments', { cluster, namespace })
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
        return fetchDeploymentsViaAgent(namespace, onProgress)
      }

      // Fall back to SSE streaming -> REST per-cluster
      return await fetchViaSSE<Deployment>('deployments', 'deployments', { namespace }, onProgress)
    } })

  return {
    deployments: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
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
        const data = await fetchAPI<{ services: Service[] }>('services', { cluster, namespace })
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
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
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
        } catch (err) {
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
        } catch (err) {
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
        } catch (err) {
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
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
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

  const result = useCache({
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

  return {
    workloads: result.data,
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch }
}
