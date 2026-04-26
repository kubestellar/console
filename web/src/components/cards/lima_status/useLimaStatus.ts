import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters } from '../../../hooks/useMCP'
import { STORAGE_KEY_TOKEN } from '../../../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'
import { useCardLoadingState } from '../CardDataContext'
import { LIMA_DEMO_DATA, type LimaDemoData, type LimaInstance } from './demoData'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../../../lib/constants'

export interface LimaStatus {
  instances: LimaInstance[]
  totalNodes: number
  runningNodes: number
  stoppedNodes: number
  brokenNodes: number
  health: 'healthy' | 'degraded' | 'not-detected'
  totalCpuCores: number
  totalMemoryGB: number
  lastCheckTime: string
}

const INITIAL_DATA: LimaStatus = {
  instances: [],
  totalNodes: 0,
  runningNodes: 0,
  stoppedNodes: 0,
  brokenNodes: 0,
  health: 'not-detected',
  totalCpuCores: 0,
  totalMemoryGB: 0,
  lastCheckTime: new Date().toISOString(),
}

const CACHE_EXPIRY_MS = 300_000
const FAILURE_THRESHOLD = 3
const LIMA_CACHE_KEY = 'kc-lima-cache'
const STATUS_SERVICE_UNAVAILABLE = 503

interface LimaListResponse {
  limaInstances: LimaInstance[]
  isDemoData: boolean
}

interface CachedData {
  data: LimaStatus
  timestamp: number
  isDemoData: boolean
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Ignore storage errors (e.g. private browsing)
  }
  return headers
}

function loadFromCache(): CachedData | null {
  try {
    const stored = localStorage.getItem(LIMA_CACHE_KEY)
    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored) as CachedData
    if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
      return parsed
    }
  } catch {
    // Ignore storage/parse errors
  }

  return null
}

function saveToCache(data: LimaStatus, isDemoData: boolean): void {
  try {
    localStorage.setItem(LIMA_CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
      isDemoData,
    }))
  } catch {
    // Ignore quota errors
  }
}

function buildLimaStatus(instances: LimaInstance[], lastCheckTime?: string): LimaStatus {
  const runningNodes = instances.filter(i => i.status === 'running').length
  const stoppedNodes = instances.filter(i => i.status === 'stopped').length
  const brokenNodes = instances.filter(i => i.status === 'broken').length

  const totalCpuCores = instances.reduce((sum, i) => sum + i.cpuCores, 0)
  const totalMemoryGB = instances.reduce((sum, i) => sum + i.memoryGB, 0)

  const health: 'healthy' | 'degraded' | 'not-detected' =
    instances.length === 0
      ? 'not-detected'
      : (brokenNodes > 0 || stoppedNodes > 0 ? 'degraded' : 'healthy')

  return {
    instances,
    totalNodes: instances.length,
    runningNodes,
    stoppedNodes,
    brokenNodes,
    health,
    totalCpuCores,
    totalMemoryGB,
    lastCheckTime: lastCheckTime || new Date().toISOString(),
  }
}

function toDemoStatus(demo: LimaDemoData): LimaStatus {
  return {
    instances: demo.instances,
    totalNodes: demo.totalNodes,
    runningNodes: demo.runningNodes,
    stoppedNodes: demo.stoppedNodes,
    brokenNodes: demo.brokenNodes,
    health: demo.health,
    totalCpuCores: demo.totalCpuCores,
    totalMemoryGB: demo.totalMemoryGB,
    lastCheckTime: demo.lastCheckTime,
  }
}

function getDemoLimaStatus(noReachableClusters: boolean): LimaStatus {
  const demoStatus = toDemoStatus(LIMA_DEMO_DATA)

  if (noReachableClusters) {
    // Keep demo fallback shape stable while ensuring recency indicators remain current.
    return { ...demoStatus, lastCheckTime: new Date().toISOString() }
  }

  return demoStatus
}

export interface UseLimaStatusResult {
  data: LimaStatus
  loading: boolean
  isRefreshing: boolean
  error: boolean
  consecutiveFailures: number
  showSkeleton: boolean
  showEmptyState: boolean
  isDemoData: boolean
}

export function useLimaStatus(): UseLimaStatusResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  // Initialize from cache using a snapshot to avoid reading refs during render.
  const cachedData = useRef(loadFromCache())
  const cachedSnapshot = cachedData.current

  const [data, setData] = useState<LimaStatus>(cachedSnapshot?.data || INITIAL_DATA)
  const [isDemoData, setIsDemoData] = useState(cachedSnapshot?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(cachedSnapshot?.timestamp || null)

  const initialLoadDone = useRef(!!cachedSnapshot)

  // Keep refetch stable while still reading current cluster reachability.
  // This avoids interval thrash from array identity changes in useClusters.
  const clustersRef = useRef(clusters)
  clustersRef.current = clusters

  const refetch = useCallback(async (silent = false) => {
    if (!silent && !initialLoadDone.current) {
      setIsLoading(true)
    }

    if (silent && initialLoadDone.current) {
      setIsRefreshing(true)
    }

    try {
      const res = await fetch('/api/lima', {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (res.status === STATUS_SERVICE_UNAVAILABLE) {
        throw new Error('Service unavailable')
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const response = (await res.json()) as LimaListResponse
      if (response.isDemoData) {
        throw new Error('Backend returned demo data indicator')
      }

      const liveInstances = response.limaInstances || []
      const liveStatus = buildLimaStatus(liveInstances)

      setData(liveStatus)
      setIsDemoData(false)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(liveStatus, false)
    } catch {
      const currentClusters = clustersRef.current
      const reachableClusterCount = (currentClusters || []).filter(c => c.reachable !== false).length
      const demoStatus = getDemoLimaStatus(reachableClusterCount === 0)

      setData(demoStatus)
      setIsDemoData(true)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(demoStatus, true)
     } finally {
       setIsLoading(false)
       setIsRefreshing(false)
     }
  }, [])

  // Initial load after cluster metadata finishes loading.
  useEffect(() => {
    if (!clustersLoading) {
      refetch()
    }
  }, [clustersLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh in background once the initial load has completed.
  useEffect(() => {
    if (!initialLoadDone.current) {
      return
    }

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [refetch])

  const hasAnyData = data.totalNodes > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: (isLoading || clustersLoading) && !hasAnyData,
    isRefreshing,
    hasAnyData,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    isDemoData,
    lastRefresh,
  })

  return {
    data,
    loading: isLoading || clustersLoading,
    isRefreshing,
    error: consecutiveFailures >= FAILURE_THRESHOLD && !hasAnyData,
    consecutiveFailures,
    showSkeleton,
    showEmptyState,
    isDemoData,
  }
}
