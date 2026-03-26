/**
 * Prow CI Cached Data Hooks
 *
 * Provides cached hooks for fetching Prow CI job data via kubectl proxy.
 * Extracted from useCachedData.ts for maintainability.
 */

import { useCache, type RefreshCategory } from '../lib/cache'
import { kubectlProxy } from '../lib/kubectlProxy'
import { KUBECTL_EXTENDED_TIMEOUT_MS } from '../lib/constants/network'
import type { ProwJob, ProwStatus } from './useProw'

// ============================================================================
// Shared Types
// ============================================================================

interface CachedHookResult<T> {
  data: T
  isLoading: boolean
  isRefreshing: boolean
  isDemoFallback: boolean
  error: string | null
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of ProwJobs to return from a fetch */
const MAX_PROW_JOBS = 100

// ============================================================================
// Demo Data
// ============================================================================

const getDemoProwJobs = (): ProwJob[] => [
  { id: '1', name: 'pull-kubernetes-e2e', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 10 * 60000).toISOString(), duration: '45m', pr: 12345 },
  { id: '2', name: 'pull-kubernetes-unit', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 15 * 60000).toISOString(), duration: '12m', pr: 12346 },
  { id: '3', name: 'ci-kubernetes-e2e-gce', type: 'periodic', state: 'failure', cluster: 'prow', startTime: new Date(Date.now() - 30 * 60000).toISOString(), duration: '1h 23m' },
]

// ============================================================================
// Prow Cached Hooks (uses kubectlProxy)
// ============================================================================

interface ProwJobResource {
  metadata: {
    name: string
    creationTimestamp: string
    labels?: {
      'prow.k8s.io/job'?: string
      'prow.k8s.io/type'?: string
      'prow.k8s.io/build-id'?: string
    }
  }
  spec: {
    job?: string
    type?: string
    cluster?: string
    refs?: {
      pulls?: Array<{ number: number }>
    }
  }
  status: {
    state?: string
    startTime?: string
    completionTime?: string
    pendingTime?: string
    url?: string
    build_id?: string
  }
}

function formatDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : new Date()
  const diffMs = end.getTime() - start.getTime()

  if (diffMs < 0) return '-'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

export function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

/** @internal Exported for use in `lib/prefetchCardData.ts` specialtyFetchers */
export async function fetchProwJobs(prowCluster: string, namespace: string): Promise<ProwJob[]> {
  // useCache prevents calling fetchers in demo mode via effectiveEnabled
  const response = await kubectlProxy.exec(
    ['get', 'prowjobs', '-n', namespace, '-o', 'json', '--sort-by=.metadata.creationTimestamp'],
    { context: prowCluster, timeout: KUBECTL_EXTENDED_TIMEOUT_MS }
  )

  if (response.exitCode !== 0) {
    throw new Error(response.error || 'Failed to get ProwJobs')
  }

  let data: { items?: ProwJobResource[] }
  try {
    data = JSON.parse(response.output)
  } catch {
    throw new Error('Failed to parse ProwJobs response: invalid JSON')
  }
  return (data.items || [])
    .reverse()
    .slice(0, MAX_PROW_JOBS)
    .map((pj: ProwJobResource) => {
      const jobName = pj.metadata.labels?.['prow.k8s.io/job'] || pj.spec.job || pj.metadata.name
      const jobType = (pj.metadata.labels?.['prow.k8s.io/type'] || pj.spec.type || 'unknown') as ProwJob['type']
      const state = (pj.status.state || 'unknown') as ProwJob['state']
      const startTime = pj.status.startTime || pj.status.pendingTime || pj.metadata.creationTimestamp
      const completionTime = pj.status.completionTime

      return {
        id: pj.metadata.name,
        name: jobName,
        type: jobType,
        state,
        cluster: prowCluster,
        startTime,
        completionTime,
        duration: state === 'pending' || state === 'triggered' ? '-' : formatDuration(startTime, completionTime),
        pr: pj.spec.refs?.pulls?.[0]?.number,
        url: pj.status.url,
        buildId: pj.status.build_id || pj.metadata.labels?.['prow.k8s.io/build-id'],
      }
    })
}

function computeProwStatus(jobs: ProwJob[], consecutiveFailures: number): ProwStatus {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentJobs = jobs.filter(j => new Date(j.startTime) > oneHourAgo)

  const pendingJobs = jobs.filter(j => j.state === 'pending' || j.state === 'triggered').length
  const runningJobs = jobs.filter(j => j.state === 'running').length
  const successJobs = recentJobs.filter(j => j.state === 'success').length
  const failedJobs = recentJobs.filter(j => j.state === 'failure' || j.state === 'error').length
  const completedJobs = successJobs + failedJobs
  const successRate = completedJobs > 0 ? (successJobs / completedJobs) * 100 : 100

  return {
    healthy: consecutiveFailures < 3,
    pendingJobs,
    runningJobs,
    successJobs,
    failedJobs,
    prowJobsLastHour: recentJobs.length,
    successRate: Math.round(successRate * 10) / 10,
  }
}

/**
 * Hook for fetching ProwJobs with caching
 */
export function useCachedProwJobs(
  prowCluster = 'prow',
  namespace = 'prow'
): CachedHookResult<ProwJob[]> & { jobs: ProwJob[]; status: ProwStatus; formatTimeAgo: typeof formatTimeAgo } {
  const key = `prowjobs:${prowCluster}:${namespace}`

  const result = useCache({
    key,
    category: 'gitops' as RefreshCategory,
    initialData: [] as ProwJob[],
    demoData: getDemoProwJobs(),
    fetcher: () => fetchProwJobs(prowCluster, namespace),
  })

  const status = computeProwStatus(result.data, result.consecutiveFailures)

  return {
    jobs: result.data,
    data: result.data,
    status,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
    formatTimeAgo,
  }
}
