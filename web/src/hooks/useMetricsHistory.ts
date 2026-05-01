import { useState, useEffect, useRef } from 'react'
import type { MetricsSnapshot, TrendDirection } from '../types/predictions'
import { useClusters, usePodIssues, useGPUNodes } from './useMCP'
import { getPredictionSettings } from './usePredictionSettings'
import { MS_PER_DAY, MS_PER_MINUTE } from '../lib/constants/time'

const STORAGE_KEY = 'kubestellar-metrics-history'
const HISTORY_CHANGED_EVENT = 'kubestellar-metrics-history-changed'
const MAX_SNAPSHOTS = 1008 // 7 days at 10-min intervals (6 per hour * 24 hours * 7 days)
/** Cache TTL: 7 days — remove snapshots older than this */
const CACHE_TTL_MS = 7 * MS_PER_DAY
/** Maximum number of increasing-restart pods to include in AI context */
const MAX_INCREASING_RESTART_PODS = 10
/**
 * Maximum consecutive snapshots whose empty GPU data will be carried-forward
 * from the last known non-empty gpuNodes list. Prevents a transient GPU fetch
 * glitch (SSE race, partial cluster reachability) from being persisted as a
 * zero-total snapshot in GPU Inventory History while still allowing truly
 * removed GPUs to reflect after roughly this-many capture intervals.
 *
 * At the default 10-minute capture interval, 6 consecutive carries covers
 * ~1 hour of flapping — long enough to absorb a slow-rolling cluster outage
 * on the GPU-bearing cluster (see issues #8080, #8081 from Mike Spreitzer's
 * vllm-d cluster where partial fetch failures flapped inventory for multiple
 * polling windows). Previously this was 2, which only covered ~20 minutes
 * and still let zero bars leak into the persisted history.
 */
const MAX_GPU_CARRY_FORWARD = 6

// Singleton state - shared across all hook instances
let snapshots: MetricsSnapshot[] = []
const subscribers = new Set<(snapshots: MetricsSnapshot[]) => void>()
/**
 * Tracks how many consecutive captures have had an empty gpuNodes list while
 * the last persisted snapshot still had GPU inventory. Used to carry-forward
 * the last known gpuNodes for up to MAX_GPU_CARRY_FORWARD captures.
 */
let consecutiveEmptyGPUCaptures = 0

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        snapshots = parsed
        // Remove snapshots older than 7 days
        const cutoff = Date.now() - CACHE_TTL_MS
        snapshots = snapshots.filter(s => new Date(s.timestamp).getTime() > cutoff)
      }
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
  } catch (e: unknown) {
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
 * Applies carry-forward protection against transient empty gpuNodes results.
 *
 * When the current capture has an empty gpuNodes list but the most recent
 * persisted snapshot still had GPU inventory, replace the empty list with the
 * previous snapshot's gpuNodes — up to MAX_GPU_CARRY_FORWARD consecutive
 * captures. This prevents transient fetch glitches from being persisted as
 * zero-total snapshots that then render as flapping zero bars in GPU
 * Inventory History.
 *
 * Returns the gpuNodes to use for the new snapshot.
 */
function applyGPUCarryForward(
  currentGpuNodes: MetricsSnapshot['gpuNodes'],
): MetricsSnapshot['gpuNodes'] {
  // Non-empty current: no carry-forward needed, reset counter.
  if (currentGpuNodes.length > 0) {
    consecutiveEmptyGPUCaptures = 0
    return currentGpuNodes
  }

  // Empty current. Look at the most recent persisted snapshot.
  const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const lastHadGPUs = !!lastSnapshot && (lastSnapshot.gpuNodes || []).length > 0

  // No previous GPU data to carry forward — this is a legitimate "no GPUs"
  // state (either a non-GPU cluster or the zero has already been persisted).
  if (!lastHadGPUs) {
    consecutiveEmptyGPUCaptures = 0
    return currentGpuNodes
  }

  // Previous snapshot had GPUs, current is empty — likely a transient flap.
  // Carry forward the previous gpuNodes, but only for a bounded number of
  // consecutive captures so truly-removed GPUs eventually reflect in history.
  if (consecutiveEmptyGPUCaptures < MAX_GPU_CARRY_FORWARD) {
    consecutiveEmptyGPUCaptures += 1
    return lastSnapshot.gpuNodes
  }

  // Exceeded the carry-forward window — accept the empty state as truth.
  consecutiveEmptyGPUCaptures = 0
  return currentGpuNodes
}

/**
 * Internal: subscribes a React state setter to the singleton `snapshots`
 * array and to `HISTORY_CHANGED_EVENT` / `storage` cross-tab updates.
 *
 * Used by both `useMetricsHistory` (the driver that also captures snapshots)
 * and `useMetricsHistoryReadOnly` (the passive reader that does not poll
 * MCP or run a capture interval). Keeping the subscription code in one place
 * ensures both variants stay in sync when the singleton is updated.
 */
function useSnapshotSubscription(): MetricsSnapshot[] {
  // Initialize lazily from the current singleton so we pick up any captures
  // that happened before this hook mounted (e.g., module-load from
  // localStorage, or another hook instance already running). The subscribe
  // effect below keeps us in sync after that.
  const [history, setHistory] = useState<MetricsSnapshot[]>(() => [...snapshots])

  // Subscribe to shared state updates
  useEffect(() => {
    const handleUpdate = (newSnapshots: MetricsSnapshot[]) => {
      setHistory([...newSnapshots])
    }
    subscribers.add(handleUpdate)
    // Resync once right after subscribing: if the singleton received an
    // update between the initial lazy `useState` snapshot and this effect
    // running, we'd otherwise miss it until the next notify. Use a functional
    // update that bails out (returns the previous reference) when the snapshot
    // set hasn't actually changed, so React skips the rerender on every mount
    // in the common case where nothing landed between init and subscribe.
    setHistory(prev => {
      if (
        prev.length === snapshots.length &&
        prev.every((s, i) => s === snapshots[i])
      ) {
        return prev
      }
      return [...snapshots]
    })

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

  return history
}

/**
 * Hook to manage metrics history for trend detection
 * Automatically captures snapshots every 10 minutes (configurable)
 *
 * This is the "driver" variant: it polls MCP for clusters, pod issues, and
 * GPU nodes and runs a capture `setInterval` per instance. Use this in ONE
 * place per app (e.g., GPU Inventory History) — additional consumers should
 * use `useMetricsHistoryReadOnly()` to avoid duplicate polling and stacked
 * capture intervals.
 */
export function useMetricsHistory() {
  const history = useSnapshotSubscription()
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

  // Auto-capture snapshots at configured interval.
  // Reads volatile data from refs so the interval stays stable across MCP polls (#5781).
  useEffect(() => {
    const settings = getPredictionSettings()
    const interval = settings.interval * MS_PER_MINUTE // Convert minutes to ms

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

      const mappedGpuNodes = (currentGpuNodes || []).map(g => ({
        name: g.name,
        cluster: g.cluster,
        gpuType: g.gpuType || '',
        gpuAllocated: g.gpuAllocated,
        gpuTotal: g.gpuCount }))

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
        // Apply carry-forward to smooth transient empty-GPU fetch results
        // (see applyGPUCarryForward docstring).
        gpuNodes: applyGPUCarryForward(mappedGpuNodes) }

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

    const mappedGpuNodes = (gpuNodes || []).map(g => ({
      name: g.name,
      cluster: g.cluster,
      gpuType: g.gpuType || '',
      gpuAllocated: g.gpuAllocated,
      gpuTotal: g.gpuCount }))

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
      gpuNodes: applyGPUCarryForward(mappedGpuNodes) }

    addSnapshot(snapshot)
    lastSnapshotRef.current = Date.now()
  }

  // Clear history
  const clearHistory = () => {
    snapshots = []
    consecutiveEmptyGPUCaptures = 0
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
 * Read-only variant of `useMetricsHistory`.
 *
 * Subscribes to the singleton snapshots state (so it reflects updates from
 * whichever component hosts the driver `useMetricsHistory()`), but:
 *   - Does NOT call `useClusters`, `usePodIssues`, or `useGPUNodes` (no
 *     duplicate MCP polling).
 *   - Does NOT set up a capture `setInterval` (no stacked timers).
 *
 * Use this in secondary consumers (e.g., cards that want a last-known-good
 * GPU-node snapshot as a fallback) so they can share history with the
 * driver instance without doubling up on polling or captures.
 *
 * Returns `{ history }` only — callers that need `captureNow`, trend helpers,
 * or `clearHistory` must use the driver hook `useMetricsHistory()` instead.
 */
export function useMetricsHistoryReadOnly(): { history: MetricsSnapshot[] } {
  const history = useSnapshotSubscription()
  return { history }
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
