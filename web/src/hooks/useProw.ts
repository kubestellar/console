import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { kubectlProxy } from '../lib/kubectlProxy'
import { useDemoMode } from './useDemoMode'

// Refresh interval for automatic polling (2 minutes)
const REFRESH_INTERVAL_MS = 120000

// ProwJob types
export interface ProwJob {
  id: string
  name: string
  type: 'periodic' | 'presubmit' | 'postsubmit' | 'batch'
  state: 'triggered' | 'pending' | 'running' | 'success' | 'failure' | 'aborted' | 'error'
  cluster: string
  startTime: string
  completionTime?: string
  duration: string
  pr?: number
  url?: string
  buildId?: string
}

export interface ProwStatus {
  healthy: boolean
  version?: string
  pendingJobs: number
  runningJobs: number
  successJobs: number
  failedJobs: number
  prowJobsLastHour: number
  successRate: number
}

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

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

function formatTimeAgo(timestamp: string): string {
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

/**
 * Hook to fetch ProwJobs from a cluster
 */
export function useProwJobs(prowCluster = 'prow', namespace = 'prow') {
  const { isDemoMode: demoMode } = useDemoMode()
  const [jobs, setJobs] = useState<ProwJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const initialLoadDone = useRef(false)

  const refetch = useCallback(async (silent = false) => {
    console.log(`[useProwJobs] refetch called, silent=${silent}, cluster=${prowCluster}`)
    if (!silent) {
      setIsRefreshing(true)
      if (!initialLoadDone.current) {
        setIsLoading(true)
      }
    }

    try {
      console.log('[useProwJobs] About to call kubectlProxy.exec...')
      const response = await kubectlProxy.exec(
        ['get', 'prowjobs', '-n', namespace, '-o', 'json', '--sort-by=.metadata.creationTimestamp'],
        { context: prowCluster, timeout: 30000 }
      )
      console.log('[useProwJobs] kubectlProxy.exec returned:', { exitCode: response.exitCode, outputLength: response.output?.length })

      if (response.exitCode !== 0) {
        throw new Error(response.error || 'Failed to get ProwJobs')
      }

      const data = JSON.parse(response.output)
      const prowJobs: ProwJob[] = (data.items || [])
        .reverse() // Most recent first
        .slice(0, 100) // Limit to 100 jobs
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

      console.log(`[useProwJobs] Loaded ${prowJobs.length} jobs`)
      setJobs(prowJobs)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      initialLoadDone.current = true
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch ProwJobs')
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
   
  }, [prowCluster, namespace])

  // Return demo data when in demo mode
  useEffect(() => {
    if (demoMode) {
      setJobs(getDemoProwJobs())
      setIsLoading(false)
      setError(null)
      setConsecutiveFailures(0)
      setLastRefresh(new Date())
      initialLoadDone.current = true
      return
    }

    // Live mode: fetch from kubectlProxy
    refetch(false)
    const interval = setInterval(() => refetch(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode])

  // Compute status from jobs
  const status = useMemo((): ProwStatus => {
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
  }, [jobs, consecutiveFailures])

  return {
    jobs,
    status,
    isLoading,
    isRefreshing,
    error,
    refetch: () => refetch(false),
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
    formatTimeAgo,
  }
}

// Demo data for when prow cluster is not available
export function getDemoProwJobs(): ProwJob[] {
  return [
    { id: '1', name: 'pull-kubernetes-e2e', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 10 * 60000).toISOString(), duration: '45m', pr: 12345 },
    { id: '2', name: 'pull-kubernetes-unit', type: 'presubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 15 * 60000).toISOString(), duration: '12m', pr: 12346 },
    { id: '3', name: 'pull-kubernetes-verify', type: 'presubmit', state: 'pending', cluster: 'prow', startTime: new Date(Date.now() - 2 * 60000).toISOString(), duration: '-', pr: 12347 },
    { id: '4', name: 'ci-kubernetes-e2e-gce', type: 'periodic', state: 'failure', cluster: 'prow', startTime: new Date(Date.now() - 30 * 60000).toISOString(), duration: '1h 23m' },
    { id: '5', name: 'post-kubernetes-push-image', type: 'postsubmit', state: 'success', cluster: 'prow', startTime: new Date(Date.now() - 60 * 60000).toISOString(), duration: '8m' },
    { id: '6', name: 'pull-kubernetes-integration', type: 'presubmit', state: 'aborted', cluster: 'prow', startTime: new Date(Date.now() - 20 * 60000).toISOString(), duration: '5m', pr: 12344 },
  ]
}
