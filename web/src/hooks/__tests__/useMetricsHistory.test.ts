import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MetricsSnapshot } from '../../types/predictions'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock useMCP hooks
const mockClusters: Array<Record<string, unknown>> = []
const mockPodIssues: Array<Record<string, unknown>> = []
const mockGPUNodes: Array<Record<string, unknown>> = []

vi.mock('../useMCP', () => ({
  useClusters: () => ({ deduplicatedClusters: mockClusters }),
  usePodIssues: () => ({ issues: mockPodIssues }),
  useGPUNodes: () => ({ nodes: mockGPUNodes }),
}))

vi.mock('../usePredictionSettings', () => ({
  getPredictionSettings: () => ({ interval: 10 }),
}))

// ---------------------------------------------------------------------------
// Constants (must match the source)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kubestellar-metrics-history'
const HISTORY_CHANGED_EVENT = 'kubestellar-metrics-history-changed'
const MAX_SNAPSHOTS = 1008

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    timestamp: new Date().toISOString(),
    clusters: [],
    podIssues: [],
    gpuNodes: [],
    ...overrides,
  }
}

function makeClusterSnapshot(
  clusterName: string,
  cpu: number,
  mem: number,
  timestamp?: string,
): MetricsSnapshot {
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    clusters: [{ name: clusterName, cpuPercent: cpu, memoryPercent: mem, nodeCount: 3, healthyNodes: 3 }],
    podIssues: [],
    gpuNodes: [],
  }
}

function makePodSnapshot(
  podName: string,
  cluster: string,
  restarts: number,
  timestamp?: string,
): MetricsSnapshot {
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    clusters: [],
    podIssues: [{ name: podName, cluster, restarts, status: 'CrashLoopBackOff' }],
    gpuNodes: [],
  }
}

/**
 * Because the module uses singleton state at the module level, we need to
 * re-import it for each test to get a clean slate. This helper handles that.
 */
async function importFresh() {
  // Reset module registry so module-level code re-runs
  vi.resetModules()
  const mod = await import('../useMetricsHistory')
  return mod
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.clearAllMocks()
  // Reset mock data
  mockClusters.length = 0
  mockPodIssues.length = 0
  mockGPUNodes.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMetricsHistory', () => {
  // ── Initialization ──────────────────────────────────────────────────────

  describe('initialization', () => {
    it('starts with an empty history when localStorage has no data', async () => {
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.history).toEqual([])
      expect(result.current.snapshotCount).toBe(0)
    })

    it('loads snapshots from localStorage on module init', async () => {
      const snap = makeSnapshot({ timestamp: new Date().toISOString() })
      localStorage.setItem(STORAGE_KEY, JSON.stringify([snap]))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0].timestamp).toBe(snap.timestamp)
    })

    it('handles invalid JSON in localStorage gracefully', async () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json!!!')

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.history).toEqual([])
    })
  })

  // ── Trimming old snapshots ─────────────────────────────────────────────

  describe('trimming old snapshots', () => {
    it('removes snapshots older than 7 days on load', async () => {
      const oldTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      const recentTimestamp = new Date().toISOString()
      const oldSnap = makeSnapshot({ timestamp: oldTimestamp })
      const recentSnap = makeSnapshot({ timestamp: recentTimestamp })
      localStorage.setItem(STORAGE_KEY, JSON.stringify([oldSnap, recentSnap]))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0].timestamp).toBe(recentTimestamp)
    })
  })

  // ── MAX_SNAPSHOTS limit ────────────────────────────────────────────────

  describe('MAX_SNAPSHOTS limit', () => {
    it('trims snapshots to MAX_SNAPSHOTS (144) when persisting', async () => {
      // Pre-seed with exactly MAX_SNAPSHOTS snapshots
      const snaps: MetricsSnapshot[] = []
      for (let i = 0; i < MAX_SNAPSHOTS; i++) {
        snaps.push(makeSnapshot({ timestamp: new Date(Date.now() - (MAX_SNAPSHOTS - i) * 1000).toISOString() }))
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      // Set up mock cluster data so captureNow works
      mockClusters.push({ name: 'cluster-1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 16, memoryUsageGB: 8, nodeCount: 3, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Capture one more — should trigger trim
      act(() => {
        result.current.captureNow()
      })

      // localStorage should contain at most MAX_SNAPSHOTS
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(stored.length).toBeLessThanOrEqual(MAX_SNAPSHOTS)
    })
  })

  // ── Add / persist behavior ─────────────────────────────────────────────

  describe('add and persist', () => {
    it('captureNow adds a snapshot and persists to localStorage', async () => {
      mockClusters.push({ name: 'prod', cpuCores: 8, cpuUsageCores: 4, memoryGB: 32, memoryUsageGB: 16, nodeCount: 5, healthy: true })
      mockPodIssues.push({ name: 'pod-1', cluster: 'prod', restarts: 3, status: 'Running' })
      mockGPUNodes.push({ name: 'gpu-node-1', cluster: 'prod', gpuAllocated: 2, gpuCount: 4 })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // The hook auto-captures an initial snapshot when clusters are present,
      // so snapshotCount may already be >= 1 after render.
      const countAfterMount = result.current.snapshotCount

      act(() => {
        result.current.captureNow()
      })

      expect(result.current.snapshotCount).toBe(countAfterMount + 1)

      const stored: MetricsSnapshot[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(stored.length).toBeGreaterThanOrEqual(1)
      // Check the latest stored snapshot has the expected data
      const latest = stored[stored.length - 1]
      expect(latest.clusters[0].name).toBe('prod')
      expect(latest.clusters[0].cpuPercent).toBe(50) // 4/8 * 100
      expect(latest.clusters[0].memoryPercent).toBe(50) // 16/32 * 100
      expect(latest.podIssues[0].restarts).toBe(3)
      expect(latest.gpuNodes[0].gpuTotal).toBe(4)
    })

    it('captureNow does nothing when clusters are empty', async () => {
      // No clusters set up
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => {
        result.current.captureNow()
      })

      expect(result.current.snapshotCount).toBe(0)
    })
  })

  // ── Event dispatching ──────────────────────────────────────────────────

  describe('event dispatching', () => {
    it('dispatches kubestellar-metrics-history-changed event when snapshot is added', async () => {
      mockClusters.push({ name: 'cluster-1', cpuCores: 4, cpuUsageCores: 1, memoryGB: 8, memoryUsageGB: 2, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      const eventSpy = vi.fn()
      window.addEventListener(HISTORY_CHANGED_EVENT, eventSpy)

      act(() => {
        result.current.captureNow()
      })

      expect(eventSpy).toHaveBeenCalled()
      window.removeEventListener(HISTORY_CHANGED_EVENT, eventSpy)
    })
  })

  // ── QuotaExceededError fallback strategies ─────────────────────────────

  describe('QuotaExceededError fallback strategies', () => {
    it('Strategy 1: halves snapshots when quota is exceeded', async () => {
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 1, memoryGB: 8, memoryUsageGB: 2, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Seed some snapshots first
      for (let i = 0; i < 20; i++) {
        act(() => { result.current.captureNow() })
      }

      // Now make setItem fail once then succeed (Strategy 1)
      let callCount = 0
      const originalSetItem = localStorage.setItem.bind(localStorage)
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === STORAGE_KEY) {
          callCount++
          if (callCount === 1) {
            const err = new DOMException('QuotaExceededError', 'QuotaExceededError')
            throw err
          }
        }
        return originalSetItem(key, value)
      })

      act(() => { result.current.captureNow() })

      // Strategy 1 should have halved and then succeeded
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(stored.length).toBeLessThanOrEqual(Math.floor(21 / 2) + 1)
      expect(stored.length).toBeGreaterThan(0)
    })

    it('Strategy 2: removes other localStorage keys when halving is not enough', async () => {
      // Pre-seed some "other" keys that the cleanup targets
      localStorage.setItem('github_activity_cache_v2_some_user', '{"data":"big"}')
      localStorage.setItem('kubestellar-clusters-cards', '{"data":"also big"}')

      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 1, memoryGB: 8, memoryUsageGB: 2, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Seed a snapshot
      act(() => { result.current.captureNow() })

      // Make setItem fail twice then succeed (hits Strategy 2)
      let failCount = 0
      const originalSetItem = localStorage.setItem.bind(localStorage)
      vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === STORAGE_KEY) {
          failCount++
          if (failCount <= 2) {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError')
          }
        }
        return originalSetItem(key, value)
      })

      // Also spy on removeItem to verify cleanup
      const removeSpy = vi.spyOn(localStorage, 'removeItem')

      act(() => { result.current.captureNow() })

      // Strategy 2 should have cleaned the prefixed keys
      const removedKeys = removeSpy.mock.calls.map(c => c[0])
      const cleanedExternalKeys = removedKeys.some(
        k => k.startsWith('github_activity_cache_v2_') || k === 'kubestellar-clusters-cards',
      )
      expect(cleanedExternalKeys).toBe(true)
    })

    it('Strategy 3: keeps data in memory when all persist attempts fail', async () => {
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 1, memoryGB: 8, memoryUsageGB: 2, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Make ALL setItem calls fail
      vi.spyOn(localStorage, 'setItem').mockImplementation((key) => {
        if (key === STORAGE_KEY) {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        }
      })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      act(() => { result.current.captureNow() })

      // Data should still be in hook state (in-memory), even though persist failed
      expect(result.current.snapshotCount).toBeGreaterThanOrEqual(1)

      // Should have logged the fallback warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot persist to localStorage'),
      )
    })
  })

  // ── Trend calculation ──────────────────────────────────────────────────

  describe('trend calculation', () => {
    it('returns "stable" when fewer than 3 snapshots exist', async () => {
      const snaps = [
        makeClusterSnapshot('prod', 50, 50),
        makeClusterSnapshot('prod', 52, 52),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getClusterTrend('prod', 'cpuPercent')).toBe('stable')
    })

    it('returns "worsening" when metric increases beyond threshold', async () => {
      // First half: low values, second half: high values (>5% diff)
      const snaps = [
        makeClusterSnapshot('prod', 30, 40, new Date(Date.now() - 50000).toISOString()),
        makeClusterSnapshot('prod', 32, 42, new Date(Date.now() - 40000).toISOString()),
        makeClusterSnapshot('prod', 31, 41, new Date(Date.now() - 30000).toISOString()),
        makeClusterSnapshot('prod', 50, 60, new Date(Date.now() - 20000).toISOString()),
        makeClusterSnapshot('prod', 52, 62, new Date(Date.now() - 10000).toISOString()),
        makeClusterSnapshot('prod', 51, 61, new Date(Date.now()).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getClusterTrend('prod', 'cpuPercent')).toBe('worsening')
      expect(result.current.getClusterTrend('prod', 'memoryPercent')).toBe('worsening')
    })

    it('returns "improving" when metric decreases beyond threshold', async () => {
      const snaps = [
        makeClusterSnapshot('prod', 80, 80, new Date(Date.now() - 50000).toISOString()),
        makeClusterSnapshot('prod', 78, 78, new Date(Date.now() - 40000).toISOString()),
        makeClusterSnapshot('prod', 79, 79, new Date(Date.now() - 30000).toISOString()),
        makeClusterSnapshot('prod', 60, 60, new Date(Date.now() - 20000).toISOString()),
        makeClusterSnapshot('prod', 58, 58, new Date(Date.now() - 10000).toISOString()),
        makeClusterSnapshot('prod', 59, 59, new Date(Date.now()).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getClusterTrend('prod', 'cpuPercent')).toBe('improving')
    })

    it('returns "stable" when metric changes are within threshold', async () => {
      const snaps = [
        makeClusterSnapshot('prod', 50, 50, new Date(Date.now() - 50000).toISOString()),
        makeClusterSnapshot('prod', 51, 51, new Date(Date.now() - 40000).toISOString()),
        makeClusterSnapshot('prod', 50, 50, new Date(Date.now() - 30000).toISOString()),
        makeClusterSnapshot('prod', 52, 52, new Date(Date.now() - 20000).toISOString()),
        makeClusterSnapshot('prod', 51, 51, new Date(Date.now() - 10000).toISOString()),
        makeClusterSnapshot('prod', 53, 53, new Date(Date.now()).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getClusterTrend('prod', 'cpuPercent')).toBe('stable')
    })

    it('getPodRestartTrend returns "worsening" when restarts increase', async () => {
      const snaps = [
        makePodSnapshot('pod-a', 'prod', 1, new Date(Date.now() - 30000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 2, new Date(Date.now() - 20000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getPodRestartTrend('pod-a', 'prod')).toBe('worsening')
    })

    it('getPodRestartTrend returns "improving" when restarts decrease', async () => {
      const snaps = [
        makePodSnapshot('pod-a', 'prod', 10, new Date(Date.now() - 30000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 20000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 2, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getPodRestartTrend('pod-a', 'prod')).toBe('improving')
    })
  })

  // ── clearHistory ───────────────────────────────────────────────────────

  describe('clearHistory', () => {
    it('removes all snapshots from state and localStorage', async () => {
      const snaps = [makeSnapshot(), makeSnapshot()]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.snapshotCount).toBe(2)

      act(() => {
        result.current.clearHistory()
      })

      expect(result.current.snapshotCount).toBe(0)
      expect(result.current.history).toEqual([])

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(stored).toEqual([])
    })
  })

  // ── getMetricsHistoryContext ───────────────────────────────────────────

  describe('getMetricsHistoryContext', () => {
    it('returns a message when no history exists', async () => {
      const { getMetricsHistoryContext } = await importFresh()
      expect(getMetricsHistoryContext()).toBe('No historical metrics available yet.')
    })

    it('includes cluster CPU and memory trends in context string', async () => {
      const snaps = [
        makeClusterSnapshot('prod', 45, 60, new Date(Date.now() - 20000).toISOString()),
        makeClusterSnapshot('prod', 50, 65, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { getMetricsHistoryContext } = await importFresh()
      const context = getMetricsHistoryContext()

      expect(context).toContain('prod')
      expect(context).toContain('CPU')
      expect(context).toContain('Memory')
      expect(context).toContain('45%')
      expect(context).toContain('50%')
    })

    it('includes pods with increasing restarts in context string', async () => {
      const snaps = [
        makePodSnapshot('crasher', 'staging', 2, new Date(Date.now() - 20000).toISOString()),
        makePodSnapshot('crasher', 'staging', 8, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { getMetricsHistoryContext } = await importFresh()
      const context = getMetricsHistoryContext()

      expect(context).toContain('increasing restarts')
      expect(context).toContain('staging/crasher')
      expect(context).toContain('2')
      expect(context).toContain('8')
    })
  })
})
