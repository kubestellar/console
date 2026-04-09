import { useState, useEffect, useRef } from 'react'
import type { MetricsSnapshot, TrendDirection } from '../types/predictions'
import { useClusters, usePodIssues, useGPUNodes } from './useMCP'
import { getPredictionSettings } from './usePredictionSettings'

const STORAGE_KEY = 'kubestellar-metrics-history'
const HISTORY_CHANGED_EVENT = 'kubestellar-metrics-history-changed'
const MAX_SNAPSHOTS = 1008 // 7 days at 10-min intervals (6 per hour * 24 hours * 7 days)
/** Cache TTL: 7 days — remove snapshots older than this */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Maximum number of increasing-restart pods to include in AI context */
const MAX_INCREASING_RESTART_PODS = 10

// Singleton state - shared across all hook instances
let snapshots: MetricsSnapshot[] = []
const subscribers = new Set<(snapshots: MetricsSnapshot[]) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      snapshots = JSON.parse(stored)
      // Remove snapshots older than 7 days
      const cutoff = Date.now() - CACHE_TTL_MS
      snapshots = snapshots.filter(s => new Date(s.timestamp).getTime() > cutoff)
    } catch {
      // Invalid JSON, use empty array
    }
  }
}

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn(snapshots))
}

// Persist to localStorage with quota exceeded handling
function persistSnapshots() {
  // Keep only last MAX_SNAPSHOTS
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-MAX_SNAPSHOTS)
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
  } catch (e) {
    // QuotaExceededError - try to free up space
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      console.warn('[MetricsHistory] Storage quota exceeded, cleaning up old data...')

      // Strategy 1: Reduce snapshots to half
      const reducedCount = Math.max(Math.floor(snapshots.length / 2), 10)
      snapshots = snapshots.slice(-reducedCount)

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
        window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
        return
      } catch {
        // Strategy 2: Clear other large keys that might be stale
        const keysToClean = [
          'github_activity_cache_v2_',
          'kubestellar-clusters-cards',
        ]
        keysToClean.forEach(prefix => {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(prefix)) {
              localStorage.removeItem(key)
            }
          }
        })

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
          window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
          return
        } catch {
          // Strategy 3: Just keep in memory, don't persist
          console.warn('[MetricsHistory] Cannot persist to localStorage, keeping in memory only')
        }
      }
    } else {
      // Non-quota error, log and continue
      console.error('[MetricsHistory] Failed to persist snapshots:', e)
    }
  }
}

// Add a new snapshot
function addSnapshot(snapshot: MetricsSnapshot) {
  snapshots.push(snapshot)
  notifySubscribers()
  persistSnapshots()
}

/**
 * Hook to manage metrics history for trend detection
 * Automatically captures snapshots every 10 minutes (configurable)
 */
export function useMetricsHistory() {
  const [history, setHistory] = useState<MetricsSnapshot[]>(snapshots)
  const { deduplicatedClusters: clusters } = useClusters()
  const { issues: podIssues } = usePodIssues()
  const { nodes: gpuNodes } = useGPUNodes()
  const lastSnapshotRef = useRef<number>(0)

  // Keep volatile data in refs so the interval effect doesn't reset (#5781)
  const clustersRef = useRef(clusters)
  const podIssuesRef = useRef(podIssues)
  const gpuNodesRef = useRef(gpuNodes)
  clustersRef.current = clusters
  podIssuesRef.current = podIssues
  gpuNodesRef.current = gpuNodes

  // Subscribe to shared state updates
  useEffect(() => {
    const handleUpdate = (newSnapshots: MetricsSnapshot[]) => {
      setHistory([...newSnapshots])
    }
    subscribers.add(handleUpdate)
    setHistory([...snapshots])

    return () => {
      subscribers.delete(handleUpdate)
    }
  }, [])

  // Listen for changes from other components/tabs
  useEffect(() => {
    const handleHistoryChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          snapshots = JSON.parse(stored)
          notifySubscribers()
        } catch {
          // Invalid JSON, ignore
        }
      }
    }

    window.addEventListener(HISTORY_CHANGED_EVENT, handleHistoryChange)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handleHistoryChange()
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(HISTORY_CHANGED_EVENT, handleHistoryChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Auto-capture snapshots at configured interval.
  // Reads volatile data from refs so the interval stays stable across MCP polls (#5781).
  useEffect(() => {
    const settings = getPredictionSettings()
    const interval = settings.interval * 60 * 1000 // Convert minutes to ms

    const captureSnapshot = () => {
      const now = Date.now()
      // Only capture if enough time has passed
      if (now - lastSnapshotRef.current < interval) {
        return
      }

      const currentClusters = clustersRef.current
      const currentPodIssues = podIssuesRef.current
      const currentGpuNodes = gpuNodesRef.current

      // Skip if no data available
      if (currentClusters.length === 0) {
        return
      }

      const snapshot: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        clusters: currentClusters.map(c => ({
          name: c.name,
          cpuPercent: c.cpuCores && c.cpuUsageCores ? (c.cpuUsageCores / c.cpuCores) * 100 : 0,
          memoryPercent: c.memoryGB && c.memoryUsageGB ? (c.memoryUsageGB / c.memoryGB) * 100 : 0,
          nodeCount: c.nodeCount || 0,
          healthyNodes: c.healthy ? (c.nodeCount || 0) : 0, // Use healthy status as proxy
        })),
        podIssues: (currentPodIssues || []).map(p => ({
          name: p.name,
          cluster: p.cluster || '',
          restarts: p.restarts || 0,
          status: p.status || '' })),
        gpuNodes: (currentGpuNodes || []).map(g => ({
          name: g.name,
          cluster: g.cluster,
          gpuType: g.gpuType || '',
          gpuAllocated: g.gpuAllocated,
          gpuTotal: g.gpuCount })) }

      addSnapshot(snapshot)
      lastSnapshotRef.current = now
    }

    // Capture initial snapshot after a short delay to allow data to load
    const initialTimeout = setTimeout(() => {
      if (clustersRef.current.length > 0 && lastSnapshotRef.current === 0) {
        captureSnapshot()
      }
    }, 5000)

    // Set up stable interval — reads latest data from refs each tick
    const intervalId = setInterval(captureSnapshot, interval)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(intervalId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Manually trigger a snapshot
  const captureNow = () => {
    if (clusters.length === 0) return

    const snapshot: MetricsSnapshot = {
      timestamp: new Date().toISOString(),
      clusters: clusters.map(c => ({
        name: c.name,
        cpuPercent: c.cpuCores && c.cpuUsageCores ? (c.cpuUsageCores / c.cpuCores) * 100 : 0,
        memoryPercent: c.memoryGB && c.memoryUsageGB ? (c.memoryUsageGB / c.memoryGB) * 100 : 0,
        nodeCount: c.nodeCount || 0,
        healthyNodes: c.healthy ? (c.nodeCount || 0) : 0 })),
      podIssues: podIssues.map(p => ({
        name: p.name,
        cluster: p.cluster || '',
        restarts: p.restarts || 0,
        status: p.status || '' })),
      gpuNodes: (gpuNodes || []).map(g => ({
        name: g.name,
        cluster: g.cluster,
        gpuType: g.gpuType || '',
        gpuAllocated: g.gpuAllocated,
        gpuTotal: g.gpuCount })) }

    addSnapshot(snapshot)
    lastSnapshotRef.current = Date.now()
  }

  // Clear history
  const clearHistory = () => {
    snapshots = []
    notifySubscribers()
    persistSnapshots()
  }

  // Get trend for a specific cluster metric
  const getClusterTrend = (
    clusterName: string,
    metric: 'cpuPercent' | 'memoryPercent'
  ): TrendDirection => {
    if (history.length < 3) return 'stable'

    const recentSnapshots = history.slice(-6) // Last hour (6 x 10min)
    const values = recentSnapshots
      .map(s => s.clusters.find(c => c.name === clusterName)?.[metric])
      .filter((v): v is number => v !== undefined)

    if (values.length < 3) return 'stable'

    // Calculate average of first half vs second half
    const halfLen = Math.floor(values.length / 2)
    const firstHalf = values.slice(0, halfLen)
    const secondHalf = values.slice(halfLen)

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

    const diff = avgSecond - avgFirst
    const threshold = 5 // 5% change threshold

    if (diff > threshold) return 'worsening'
    if (diff < -threshold) return 'improving'
    return 'stable'
  }

  // Get trend for pod restarts
  const getPodRestartTrend = (
    podName: string,
    cluster: string
  ): TrendDirection => {
    if (history.length < 3) return 'stable'

    const recentSnapshots = history.slice(-6)
    const values = recentSnapshots
      .map(s => s.podIssues.find(p => p.name === podName && p.cluster === cluster)?.restarts)
      .filter((v): v is number => v !== undefined)

    if (values.length < 2) return 'stable'

    const first = values[0]
    const last = values[values.length - 1]

    if (last > first + 1) return 'worsening'
    if (last < first) return 'improving'
    return 'stable'
  }

  return {
    history,
    captureNow,
    clearHistory,
    getClusterTrend,
    getPodRestartTrend,
    snapshotCount: history.length }
}

/**
 * Get metrics history for AI prompt context
 * Formats history for inclusion in AI analysis
 */
export function getMetricsHistoryContext(): string {
  if (snapshots.length === 0) {
    return 'No historical metrics available yet.'
  }

  const recent = snapshots.slice(-6) // Last hour
  let context = `Historical metrics (last ${recent.length} snapshots over ~1 hour):\n\n`

  // Get unique clusters
  const clusterNames = new Set<string>()
  recent.forEach(s => s.clusters.forEach(c => clusterNames.add(c.name)))

  clusterNames.forEach(name => {
    const values = recent.map(s => {
      const cluster = s.clusters.find(c => c.name === name)
      return cluster ? { cpu: cluster.cpuPercent, mem: cluster.memoryPercent } : null
    }).filter((v): v is { cpu: number; mem: number } => v !== null)

    if (values.length > 0) {
      const cpuTrend = values.map(v => `${v.cpu.toFixed(0)}%`).join(' → ')
      const memTrend = values.map(v => `${v.mem.toFixed(0)}%`).join(' → ')
      context += `${name}:\n  CPU: ${cpuTrend}\n  Memory: ${memTrend}\n`
    }
  })

  // Pod restart trends
  const podRestarts = new Map<string, number[]>()
  recent.forEach(s => {
    s.podIssues.forEach(p => {
      const key = `${p.cluster}/${p.name}`
      if (!podRestarts.has(key)) {
        podRestarts.set(key, [])
      }
      podRestarts.get(key)!.push(p.restarts)
    })
  })

  // Only include pods with increasing restarts
  const increasingPods = Array.from(podRestarts.entries())
    .filter(([, values]) => values.length > 1 && values[values.length - 1] > values[0])

  if (increasingPods.length > 0) {
    context += '\nPods with increasing restarts:\n'
    increasingPods.slice(0, MAX_INCREASING_RESTART_PODS).forEach(([key, values]) => {
      context += `  ${key}: ${values.join(' → ')} restarts\n`
    })
  }

  return context
}
