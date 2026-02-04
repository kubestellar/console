import { useState, useEffect, useCallback, useRef } from 'react'
import type { MetricsSnapshot, TrendDirection } from '../types/predictions'
import { useClusters, usePodIssues, useGPUNodes } from './useMCP'
import { getPredictionSettings } from './usePredictionSettings'

const STORAGE_KEY = 'kubestellar-metrics-history'
const HISTORY_CHANGED_EVENT = 'kubestellar-metrics-history-changed'
const MAX_SNAPSHOTS = 144 // 24 hours at 10-min intervals

// Singleton state - shared across all hook instances
let snapshots: MetricsSnapshot[] = []
const subscribers = new Set<(snapshots: MetricsSnapshot[]) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      snapshots = JSON.parse(stored)
      // Remove snapshots older than 24 hours
      const cutoff = Date.now() - (24 * 60 * 60 * 1000)
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

// Persist to localStorage
function persistSnapshots() {
  // Keep only last MAX_SNAPSHOTS
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-MAX_SNAPSHOTS)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots))
  window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
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

  // Auto-capture snapshots at configured interval
  useEffect(() => {
    const settings = getPredictionSettings()
    const interval = settings.interval * 60 * 1000 // Convert minutes to ms

    const captureSnapshot = () => {
      const now = Date.now()
      // Only capture if enough time has passed
      if (now - lastSnapshotRef.current < interval) {
        return
      }

      // Skip if no data available
      if (clusters.length === 0) {
        return
      }

      const snapshot: MetricsSnapshot = {
        timestamp: new Date().toISOString(),
        clusters: clusters.map(c => ({
          name: c.name,
          cpuPercent: c.cpuCores && c.cpuUsageCores ? (c.cpuUsageCores / c.cpuCores) * 100 : 0,
          memoryPercent: c.memoryGB && c.memoryUsageGB ? (c.memoryUsageGB / c.memoryGB) * 100 : 0,
          nodeCount: c.nodeCount || 0,
          healthyNodes: c.healthy ? (c.nodeCount || 0) : 0, // Use healthy status as proxy
        })),
        podIssues: podIssues.map(p => ({
          name: p.name,
          cluster: p.cluster || '',
          restarts: p.restarts || 0,
          status: p.status || '',
        })),
        gpuNodes: gpuNodes.map(g => ({
          name: g.name,
          cluster: g.cluster,
          gpuAllocated: g.gpuAllocated,
          gpuTotal: g.gpuCount,
        })),
      }

      addSnapshot(snapshot)
      lastSnapshotRef.current = now
    }

    // Capture initial snapshot if data available
    if (clusters.length > 0 && lastSnapshotRef.current === 0) {
      captureSnapshot()
    }

    // Set up interval
    const intervalId = setInterval(captureSnapshot, interval)

    return () => {
      clearInterval(intervalId)
    }
  }, [clusters, podIssues, gpuNodes])

  // Manually trigger a snapshot
  const captureNow = useCallback(() => {
    if (clusters.length === 0) return

    const snapshot: MetricsSnapshot = {
      timestamp: new Date().toISOString(),
      clusters: clusters.map(c => ({
        name: c.name,
        cpuPercent: c.cpuCores && c.cpuUsageCores ? (c.cpuUsageCores / c.cpuCores) * 100 : 0,
        memoryPercent: c.memoryGB && c.memoryUsageGB ? (c.memoryUsageGB / c.memoryGB) * 100 : 0,
        nodeCount: c.nodeCount || 0,
        healthyNodes: c.healthy ? (c.nodeCount || 0) : 0,
      })),
      podIssues: podIssues.map(p => ({
        name: p.name,
        cluster: p.cluster || '',
        restarts: p.restarts || 0,
        status: p.status || '',
      })),
      gpuNodes: gpuNodes.map(g => ({
        name: g.name,
        cluster: g.cluster,
        gpuAllocated: g.gpuAllocated,
        gpuTotal: g.gpuCount,
      })),
    }

    addSnapshot(snapshot)
    lastSnapshotRef.current = Date.now()
  }, [clusters, podIssues, gpuNodes])

  // Clear history
  const clearHistory = useCallback(() => {
    snapshots = []
    notifySubscribers()
    persistSnapshots()
  }, [])

  // Get trend for a specific cluster metric
  const getClusterTrend = useCallback((
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
  }, [history])

  // Get trend for pod restarts
  const getPodRestartTrend = useCallback((
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
  }, [history])

  return {
    history,
    captureNow,
    clearHistory,
    getClusterTrend,
    getPodRestartTrend,
    snapshotCount: history.length,
  }
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
    increasingPods.slice(0, 10).forEach(([key, values]) => {
      context += `  ${key}: ${values.join(' → ')} restarts\n`
    })
  }

  return context
}
