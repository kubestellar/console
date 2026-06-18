import { useMemo } from 'react'
import { useCache, type CachedHookResult, type RefreshCategory } from '../../lib/cache'
import { isBackendUnavailable } from '../../lib/api'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants'
import { fetchBackendAPI, fetchFromAllClusters, fetchFromAllClustersViaBackend, fetchViaBackendSSE, fetchViaSSE, getClusterFetcher, getToken, AGENT_HTTP_TIMEOUT_MS } from '../../lib/cache/fetcherUtils'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { DeploymentsResponseSchema } from '../../lib/schemas'
import { validateArrayResponse } from '../../lib/schemas/validate'
import { clusterCacheRef, agentFetch } from '../mcp/shared'
import { fetchDeploymentsViaAgent, fetchPodIssuesViaAgent } from '../useCachedData/agentFetchers'
import { getDemoDeployments, getDemoPodIssues, getDemoSecurityIssues, getDemoServices } from '../useCachedData/demoData'
import { isAgentUnavailable } from '../useLocalAgent'
import { fetchSecurityIssuesViaKubectl } from './security'
import { withAlias } from './shared'
import type { Deployment, DeploymentIssue, PodIssue, SecurityIssue, Service } from '../useMCP'

export function useCachedPodIssues(cluster?: string, namespace?: string, options?: { category?: RefreshCategory }): CachedHookResult<PodIssue[]> & { issues: PodIssue[] } {
  const { category = 'pods' } = options || {}
  const sortIssues = (items: PodIssue[]) => [...items].sort((a, b) => (b.restarts || 0) - (a.restarts || 0))
  const result = useCache({
    key: `podIssues:${cluster || 'all'}:${namespace || 'all'}`,
    category,
    initialData: [] as PodIssue[],
    demoData: getDemoPodIssues(),
    fetcher: async () => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (cluster) {
          const ctx = clusterCacheRef.clusters.find(item => item.name === cluster)?.context || cluster
          return sortIssues((await kubectlProxy.getPodIssues(ctx, namespace) || []).map(item => ({ ...item, cluster })))
        }
        return sortIssues(await fetchPodIssuesViaAgent(namespace))
      }
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        const issues = cluster
          ? (await fetchBackendAPI<{ issues: PodIssue[] }>('pod-issues', { cluster, namespace })).issues.map(item => ({ ...item, cluster }))
          : await fetchFromAllClustersViaBackend<PodIssue>('pod-issues', 'issues', { namespace })
        return sortIssues(issues)
      }
      throw new Error('No data source available (agent connecting or backend not authenticated)')
    },
    progressiveFetcher: cluster ? undefined : async onProgress => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        return sortIssues(await fetchPodIssuesViaAgent(namespace, partial => onProgress(sortIssues([...partial]))))
      }
      return sortIssues(await fetchViaBackendSSE<PodIssue>('pod-issues', 'issues', { namespace }, partial => onProgress(sortIssues([...partial]))))
    },
  })
  return withAlias(result, 'issues')
}

export function useCachedDeploymentIssues(cluster?: string, namespace?: string, options?: { category?: RefreshCategory }): CachedHookResult<DeploymentIssue[]> & { issues: DeploymentIssue[] } {
  const deploymentsResult = useCachedDeployments(cluster, namespace, options)
  const issues = useMemo(() => (deploymentsResult.data || []).filter(item => (item.readyReplicas ?? 0) < (item.replicas ?? 1)).map(item => ({
    name: item.name,
    namespace: item.namespace || 'default',
    cluster: item.cluster,
    replicas: item.replicas ?? 1,
    readyReplicas: item.readyReplicas ?? 0,
    reason: item.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure',
    message: item.message || '',
  })), [deploymentsResult.data])

  return { ...deploymentsResult, issues, data: issues, isDemoFallback: deploymentsResult.isDemoFallback && !deploymentsResult.isLoading }
}

export function useCachedDeployments(cluster?: string, namespace?: string, options?: { category?: RefreshCategory }): CachedHookResult<Deployment[]> & { deployments: Deployment[] } {
  const { category = 'deployments' } = options || {}
  const result = useCache({
    key: `deployments:${cluster || 'all'}:${namespace || 'all'}`,
    category,
    initialData: [] as Deployment[],
    demoData: getDemoDeployments(),
    fetcher: async () => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        if (!cluster) return fetchDeploymentsViaAgent(namespace)
        const params = new URLSearchParams()
        params.append('cluster', clusterCacheRef.clusters.find(item => item.name === cluster)?.context || cluster)
        if (namespace) params.append('namespace', namespace)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), AGENT_HTTP_TIMEOUT_MS)
        const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/deployments?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
        clearTimeout(timeoutId)
        if (!response.ok) return []
        const rawData = await response.json().catch(() => null)
        if (!rawData) return []
        const data = validateArrayResponse<{ deployments: Deployment[] }>(DeploymentsResponseSchema, rawData, '/agent/deployments', 'deployments')
        return (data.deployments || []).map(item => ({ ...item, cluster }))
      }
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        if (cluster) {
          const data = validateArrayResponse<{ deployments: Deployment[] }>(DeploymentsResponseSchema, await getClusterFetcher()<unknown>('deployments', { cluster, namespace }), '/api/mcp/deployments', 'deployments')
          return (data.deployments || []).map(item => ({ ...item, cluster: item.cluster || cluster }))
        }
        return fetchFromAllClusters<Deployment>('deployments', 'deployments', { namespace })
      }
      throw new Error('No data source available')
    },
    progressiveFetcher: cluster ? undefined : async onProgress => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        return fetchDeploymentsViaAgent(namespace, onProgress)
      }
      return fetchViaSSE<Deployment>('deployments', 'deployments', { namespace }, onProgress)
    },
  })
  return withAlias(result, 'deployments')
}

export function useCachedServices(cluster?: string, namespace?: string, options?: { category?: RefreshCategory }): CachedHookResult<Service[]> & { services: Service[] } {
  const { category = 'services' } = options || {}
  const result = useCache({
    key: `services:${cluster || 'all'}:${namespace || 'all'}`,
    category,
    initialData: [] as Service[],
    demoData: getDemoServices(),
    fetcher: async () => cluster
      ? (await getClusterFetcher()<{ services: Service[] }>('services', { cluster, namespace })).services.map(item => ({ ...item, cluster }))
      : fetchFromAllClusters<Service>('services', 'services', { namespace }),
    progressiveFetcher: cluster ? undefined : async onProgress => fetchViaSSE<Service>('services', 'services', { namespace }, onProgress),
  })
  return withAlias(result, 'services')
}

export function useCachedSecurityIssues(cluster?: string, namespace?: string, options?: { category?: RefreshCategory }): CachedHookResult<SecurityIssue[]> & { issues: SecurityIssue[] } {
  const { category = 'pods' } = options || {}
  const result = useCache({
    key: `securityIssues:${cluster || 'all'}:${namespace || 'all'}`,
    category,
    initialData: [] as SecurityIssue[],
    demoData: getDemoSecurityIssues(),
    fetcher: async () => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        try {
          const issues = await fetchSecurityIssuesViaKubectl(cluster, namespace)
          if (issues.length > 0) return issues
        } catch (err) {
          console.error('[useCachedSecurityIssues] kubectl fetch failed:', err)
        }
      }
      const token = getToken()
      const hasRealToken = token && token !== 'demo-token'
      if (hasRealToken && !isBackendUnavailable()) {
        try {
          const data = await fetchBackendAPI<{ issues: SecurityIssue[] }>('security-issues', { cluster, namespace })
          if (data?.issues?.length) return data.issues
        } catch (err) {
          console.error('[useCachedSecurityIssues] API fetch failed:', err)
        }
      }
      throw new Error('No data source available')
    },
    progressiveFetcher: cluster ? undefined : async onProgress => {
      if (clusterCacheRef.clusters.length > 0 && !isAgentUnavailable()) {
        try {
          const issues = await fetchSecurityIssuesViaKubectl(cluster, namespace, onProgress)
          if (issues.length > 0) return issues
        } catch (err) {
          console.error('[useCachedSecurityIssues] progressive kubectl fetch failed:', err)
        }
      }
      return fetchViaBackendSSE<SecurityIssue>('security-issues', 'issues', { namespace }, onProgress)
    },
  })
  return withAlias(result, 'issues')
}
