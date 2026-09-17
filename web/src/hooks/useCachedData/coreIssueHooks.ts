/**
 * Cached hooks for pod issues and deployment issues.
 *
 * Extracted from useCachedCoreWorkloads.ts for maintainability.
 */

import { useMemo } from 'react'
import { useCache, type RefreshCategory, type CachedHookResult } from '../../lib/cache'
import { isBackendUnavailable } from '../../lib/api'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { clusterCacheRef } from '../mcp/shared'
import { isAgentUnavailable } from '../useLocalAgent'
import {
  fetchBackendAPI,
  fetchFromAllClustersViaBackend,
  fetchViaBackendSSE,
  getToken,
} from '../../lib/cache/fetcherUtils'
import { fetchPodIssuesViaAgent } from './agentFetchers'
import { getDemoPodIssues } from './demoData'
import { useCachedDeployments } from './coreResourceHooks'
import type { PodIssue, DeploymentIssue, Deployment } from '../useMCP'

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
    isDemoFallback: result.isDemoFallback && !result.isLoading,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch, retryFetch: result.retryFetch }
}

/**
 * Hook for fetching deployment issues with caching
 */
export function useCachedDeploymentIssues(
  cluster?: string,
  namespace?: string,
  options?: { category?: RefreshCategory }
): CachedHookResult<DeploymentIssue[]> & { issues: DeploymentIssue[] } {
  const deploymentsResult = useCachedDeployments(cluster, namespace, options)

  const deriveIssues = (deployments: Deployment[]): DeploymentIssue[] =>
    (deployments || [])
      .filter(d => (d.readyReplicas ?? 0) < (d.replicas ?? 1))
      .map(d => ({
        name: d.name,
        namespace: d.namespace || 'default',
        cluster: d.cluster,
        replicas: d.replicas ?? 1,
        readyReplicas: d.readyReplicas ?? 0,
        reason: d.status === 'failed' ? 'DeploymentFailed' : 'ReplicaFailure',
        message: d.message || '',
      }))

  const issues = useMemo(
    () => deriveIssues(deploymentsResult.data || []),
    [deploymentsResult.data]
  )

  return {
    issues,
    data: issues,
    isLoading: deploymentsResult.isLoading,
    isRefreshing: deploymentsResult.isRefreshing,
    isDemoFallback: deploymentsResult.isDemoFallback && !deploymentsResult.isLoading,
    error: deploymentsResult.error,
    isFailed: deploymentsResult.isFailed,
    consecutiveFailures: deploymentsResult.consecutiveFailures,
    lastRefresh: deploymentsResult.lastRefresh,
    refetch: deploymentsResult.refetch,
    retryFetch: deploymentsResult.retryFetch,
  }
}
