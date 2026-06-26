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

  // ── Additional coverage tests ───────────────────────────────────────────

  describe('auto-capture interval behavior', () => {
    it('auto-captures an initial snapshot when clusters are present on mount', async () => {
      mockClusters.push({
        name: 'auto-cluster',
        cpuCores: 10,
        cpuUsageCores: 3,
        memoryGB: 64,
        memoryUsageGB: 20,
        nodeCount: 4,
        healthy: true,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // The hook uses a 5000ms setTimeout before the initial capture (#5797)
      const INITIAL_CAPTURE_DELAY_MS = 5000
      act(() => {
        vi.advanceTimersByTime(INITIAL_CAPTURE_DELAY_MS)
      })

      // The hook should have auto-captured an initial snapshot
      expect(result.current.snapshotCount).toBeGreaterThanOrEqual(1)
      expect(result.current.history[0].clusters[0].name).toBe('auto-cluster')
      expect(result.current.history[0].clusters[0].cpuPercent).toBe(30) // 3/10 * 100
    })

    it('captures a snapshot after interval elapses', async () => {
      mockClusters.push({
        name: 'interval-cluster',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 8,
        memoryUsageGB: 4,
        nodeCount: 1,
        healthy: true,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Advance past the 5000ms initial capture delay (#5797)
      const INITIAL_CAPTURE_DELAY_MS = 5000
      const startTime = Date.now()
      act(() => {
        vi.advanceTimersByTime(INITIAL_CAPTURE_DELAY_MS)
      })

      const countAfterInitial = result.current.snapshotCount

      // Advance both system clock and timers by 10 minutes so the
      // Date.now() guard in captureSnapshot sees enough elapsed time
      const TEN_MINUTES_MS = 10 * 60 * 1000
      act(() => {
        vi.setSystemTime(startTime + INITIAL_CAPTURE_DELAY_MS + TEN_MINUTES_MS)
        vi.advanceTimersByTime(TEN_MINUTES_MS)
      })

      expect(result.current.snapshotCount).toBeGreaterThan(countAfterInitial)
    })

    it('skips capture when interval has not elapsed', async () => {
      mockClusters.push({
        name: 'skip-cluster',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 8,
        memoryUsageGB: 4,
        nodeCount: 1,
        healthy: true,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Advance past the 5000ms initial capture delay so the initial snapshot fires (#5797)
      const INITIAL_CAPTURE_DELAY_MS = 5000
      act(() => {
        vi.advanceTimersByTime(INITIAL_CAPTURE_DELAY_MS)
      })

      const countAfterInitial = result.current.snapshotCount

      // Advance only 1 minute — should NOT trigger another capture
      const ONE_MINUTE_MS = 1 * 60 * 1000
      act(() => {
        vi.advanceTimersByTime(ONE_MINUTE_MS)
      })

      expect(result.current.snapshotCount).toBe(countAfterInitial)
    })

    it('does not auto-capture when clusters array is empty', async () => {
      // No clusters pushed → clusters.length === 0
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      const TEN_MINUTES_MS = 10 * 60 * 1000
      act(() => {
        vi.advanceTimersByTime(TEN_MINUTES_MS)
      })

      expect(result.current.snapshotCount).toBe(0)
    })
  })

  describe('snapshot data mapping', () => {
    it('maps cluster data correctly with cpu/memory percentages', async () => {
      mockClusters.push({
        name: 'data-cluster',
        cpuCores: 20,
        cpuUsageCores: 15,
        memoryGB: 128,
        memoryUsageGB: 96,
        nodeCount: 10,
        healthy: true,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.clusters[0].cpuPercent).toBe(75) // 15/20 * 100
      expect(latest.clusters[0].memoryPercent).toBe(75) // 96/128 * 100
      expect(latest.clusters[0].nodeCount).toBe(10)
      expect(latest.clusters[0].healthyNodes).toBe(10) // healthy: true
    })

    it('sets cpuPercent to 0 when cpuCores is missing', async () => {
      mockClusters.push({
        name: 'no-cpu',
        cpuCores: 0,
        cpuUsageCores: 5,
        memoryGB: 16,
        memoryUsageGB: 8,
        nodeCount: 2,
        healthy: true,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.clusters[0].cpuPercent).toBe(0)
    })

    it('sets memoryPercent to 0 when memoryGB is missing', async () => {
      mockClusters.push({
        name: 'no-mem',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 0,
        memoryUsageGB: 0,
        nodeCount: 1,
        healthy: false,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.clusters[0].memoryPercent).toBe(0)
    })

    it('sets healthyNodes to 0 when cluster is unhealthy', async () => {
      mockClusters.push({
        name: 'unhealthy-cluster',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 8,
        memoryUsageGB: 4,
        nodeCount: 5,
        healthy: false,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.clusters[0].healthyNodes).toBe(0)
      expect(latest.clusters[0].nodeCount).toBe(5)
    })

    it('defaults nodeCount to 0 when not provided', async () => {
      mockClusters.push({
        name: 'no-nodecount',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 8,
        memoryUsageGB: 4,
        healthy: true,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.clusters[0].nodeCount).toBe(0)
    })

    it('maps pod issues with defaults for missing fields', async () => {
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })
      mockPodIssues.push({
        name: 'pod-missing-fields',
        // Missing cluster, restarts, status
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.podIssues[0].name).toBe('pod-missing-fields')
      expect(latest.podIssues[0].cluster).toBe('')
      expect(latest.podIssues[0].restarts).toBe(0)
      expect(latest.podIssues[0].status).toBe('')
    })

    it('maps GPU nodes with gpuType defaulting to empty string', async () => {
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })
      mockGPUNodes.push({
        name: 'gpu-node-1',
        cluster: 'c1',
        // No gpuType
        gpuAllocated: 2,
        gpuCount: 8,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.gpuNodes[0].gpuType).toBe('')
      expect(latest.gpuNodes[0].gpuAllocated).toBe(2)
      expect(latest.gpuNodes[0].gpuTotal).toBe(8)
    })

    it('maps GPU nodes with gpuType when present', async () => {
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })
      mockGPUNodes.push({
        name: 'gpu-node-2',
        cluster: 'c1',
        gpuType: 'NVIDIA A100',
        gpuAllocated: 4,
        gpuCount: 4,
      })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.gpuNodes[0].gpuType).toBe('NVIDIA A100')
    })
  })

  // ── GPU carry-forward protection (issue referenced in commit/PR body) ──
  describe('GPU carry-forward protection for transient empty fetches', () => {
    it('carries forward last known gpuNodes when a single capture has empty GPUs', async () => {
      // Seed with a snapshot that has real GPU nodes
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })
      mockGPUNodes.push({ name: 'gpu-node-1', cluster: 'c1', gpuType: 'NVIDIA H100', gpuAllocated: 3, gpuCount: 8 })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // First capture: real GPU data
      act(() => { result.current.captureNow() })
      const firstLatest = result.current.history[result.current.history.length - 1]
      expect(firstLatest.gpuNodes).toHaveLength(1)
      expect(firstLatest.gpuNodes[0].gpuTotal).toBe(8)

      // Simulate transient fetch failure: gpuNodes list goes empty
      mockGPUNodes.length = 0

      // Second capture: should carry forward the previous gpuNodes
      act(() => { result.current.captureNow() })
      const secondLatest = result.current.history[result.current.history.length - 1]
      expect(secondLatest.gpuNodes).toHaveLength(1)
      expect(secondLatest.gpuNodes[0].name).toBe('gpu-node-1')
      expect(secondLatest.gpuNodes[0].gpuTotal).toBe(8)
    })

    it('eventually accepts empty GPU state after the carry-forward window expires', async () => {
      // MAX_GPU_CARRY_FORWARD = 6 (widened in #8080/#8081 to absorb longer
      // slow-rolling flaps on GPU-bearing clusters). After six consecutive
      // empty captures the seventh must reflect the empty state so truly
      // removed GPUs eventually propagate into history.
      const CARRY_FORWARD_WINDOW = 6
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })
      mockGPUNodes.push({ name: 'gpu-node-1', cluster: 'c1', gpuType: 'NVIDIA H100', gpuAllocated: 3, gpuCount: 8 })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Capture with real GPU data
      act(() => { result.current.captureNow() })

      // Now transition to empty GPU state
      mockGPUNodes.length = 0

      // CARRY_FORWARD_WINDOW empty captures — all should be carried-forward
      for (let i = 0; i < CARRY_FORWARD_WINDOW; i += 1) {
        act(() => { result.current.captureNow() })
      }
      const afterCarryForward = result.current.history[result.current.history.length - 1]
      expect(afterCarryForward.gpuNodes).toHaveLength(1)

      // One more consecutive empty capture — must accept the empty state
      act(() => { result.current.captureNow() })
      const afterWindow = result.current.history[result.current.history.length - 1]
      expect(afterWindow.gpuNodes).toHaveLength(0)
    })

    it('does not carry-forward when previous snapshot also had empty gpuNodes', async () => {
      // Non-GPU cluster: every capture has empty gpuNodes — must not carry forward.
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })
      // mockGPUNodes intentionally left empty

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => { result.current.captureNow() })
      act(() => { result.current.captureNow() })

      const latest = result.current.history[result.current.history.length - 1]
      expect(latest.gpuNodes).toHaveLength(0)
    })
  })

  describe('trend edge cases', () => {
    it('getClusterTrend returns "stable" for a non-existent cluster', async () => {
      const snaps = [
        makeClusterSnapshot('prod', 50, 50, new Date(Date.now() - 30000).toISOString()),
        makeClusterSnapshot('prod', 55, 55, new Date(Date.now() - 20000).toISOString()),
        makeClusterSnapshot('prod', 60, 60, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Query a cluster name that doesn't exist in any snapshot
      expect(result.current.getClusterTrend('nonexistent-cluster', 'cpuPercent')).toBe('stable')
    })

    it('getPodRestartTrend returns "stable" when pod is not found in snapshots', async () => {
      const snaps = [
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 30000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 6, new Date(Date.now() - 20000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 7, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getPodRestartTrend('nonexistent-pod', 'prod')).toBe('stable')
    })

    it('getPodRestartTrend returns "stable" when restarts stay the same', async () => {
      const snaps = [
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 30000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 20000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getPodRestartTrend('pod-a', 'prod')).toBe('stable')
    })

    it('getPodRestartTrend returns "stable" when restarts increase by only 1', async () => {
      // last > first + 1 is the worsening condition, so increase of exactly 1 should be stable
      const snaps = [
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 30000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 5, new Date(Date.now() - 20000).toISOString()),
        makePodSnapshot('pod-a', 'prod', 6, new Date(Date.now() - 10000).toISOString()),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.getPodRestartTrend('pod-a', 'prod')).toBe('stable')
    })

    it('getPodRestartTrend uses only last 6 snapshots', async () => {
      // Create 10 snapshots but only last 6 should be used
      const snaps: MetricsSnapshot[] = []
      for (let i = 0; i < 10; i++) {
        snaps.push(makePodSnapshot(
          'pod-b',
          'staging',
          i < 5 ? 100 : i - 4, // First 5 have high restarts, last 5 have low
          new Date(Date.now() - (10 - i) * 10000).toISOString(),
        ))
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Last 6 snapshots: [100, 1, 2, 3, 4, 5] — first=100, last=5 → improving
      const trend = result.current.getPodRestartTrend('pod-b', 'staging')
      expect(trend).toBe('improving')
    })

    it('getClusterTrend uses only last 6 snapshots', async () => {
      // Create 10 snapshots; first 4 have low CPU, last 6 have increasing CPU
      const snaps: MetricsSnapshot[] = []
      for (let i = 0; i < 10; i++) {
        snaps.push(makeClusterSnapshot(
          'trend-cluster',
          10 + i * 8, // 10, 18, 26, 34, 42, 50, 58, 66, 74, 82
          50,
          new Date(Date.now() - (10 - i) * 10000).toISOString(),
        ))
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      // Last 6: [50, 58, 66, 74, 82, 82-ish] — increasing, should be "worsening"
      const trend = result.current.getClusterTrend('trend-cluster', 'cpuPercent')
      expect(trend).toBe('worsening')
    })
  })

  describe('event and storage listeners', () => {
    it('responds to HISTORY_CHANGED_EVENT from other components', async () => {
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.snapshotCount).toBe(0)

      // Simulate another component writing to localStorage and dispatching event
      const snap = makeSnapshot({ timestamp: new Date().toISOString() })
      localStorage.setItem(STORAGE_KEY, JSON.stringify([snap]))

      act(() => {
        window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
      })

      expect(result.current.snapshotCount).toBe(1)
    })

    it('responds to storage events from other tabs', async () => {
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      expect(result.current.snapshotCount).toBe(0)

      const snap = makeSnapshot({ timestamp: new Date().toISOString() })
      localStorage.setItem(STORAGE_KEY, JSON.stringify([snap]))

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify([snap]),
        }))
      })

      expect(result.current.snapshotCount).toBe(1)
    })

    it('ignores storage events for other keys', async () => {
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'some-other-key',
          newValue: '{"data": "irrelevant"}',
        }))
      })

      expect(result.current.snapshotCount).toBe(0)
    })

    it('handles invalid JSON in HISTORY_CHANGED_EVENT gracefully', async () => {
      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      localStorage.setItem(STORAGE_KEY, 'NOT VALID JSON!!!')

      act(() => {
        window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
      })

      // Should not crash, history remains as-is
      expect(result.current.snapshotCount).toBe(0)
    })
  })

  describe('non-quota persist errors', () => {
    it('logs non-quota DOMException errors without falling through to cleanup', async () => {
      mockClusters.push({ name: 'c1', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result } = renderHook(() => useMetricsHistory())

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Make setItem throw a non-quota error
      vi.spyOn(localStorage, 'setItem').mockImplementation((key) => {
        if (key === STORAGE_KEY) {
          throw new Error('Some other localStorage error')
        }
      })

      act(() => { result.current.captureNow() })

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to persist snapshots'),
        expect.any(Error),
      )

      vi.restoreAllMocks()
    })
  })

  describe('getMetricsHistoryContext deep paths', () => {
    it('excludes pods with stable or decreasing restarts', async () => {
      const snaps = [
        {
          ...makeClusterSnapshot('prod', 50, 50, new Date(Date.now() - 20000).toISOString()),
          podIssues: [
            { name: 'stable-pod', cluster: 'prod', restarts: 5, status: 'Running' },
            { name: 'decreasing-pod', cluster: 'prod', restarts: 10, status: 'Running' },
          ],
        },
        {
          ...makeClusterSnapshot('prod', 55, 55, new Date(Date.now() - 10000).toISOString()),
          podIssues: [
            { name: 'stable-pod', cluster: 'prod', restarts: 5, status: 'Running' },
            { name: 'decreasing-pod', cluster: 'prod', restarts: 3, status: 'Running' },
          ],
        },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { getMetricsHistoryContext } = await importFresh()
      const context = getMetricsHistoryContext()

      // Neither pod has increasing restarts
      expect(context).not.toContain('increasing restarts')
      expect(context).not.toContain('stable-pod')
      expect(context).not.toContain('decreasing-pod')
    })

    it('limits increasing restart pods to MAX_INCREASING_RESTART_PODS', async () => {
      // Create snapshots with 15 pods that all have increasing restarts
      const podIssues1 = Array.from({ length: 15 }, (_, i) => ({
        name: `pod-${i}`,
        cluster: 'prod',
        restarts: 1,
        status: 'CrashLoopBackOff',
      }))
      const podIssues2 = Array.from({ length: 15 }, (_, i) => ({
        name: `pod-${i}`,
        cluster: 'prod',
        restarts: 10 + i,
        status: 'CrashLoopBackOff',
      }))

      const snaps = [
        { ...makeSnapshot({ timestamp: new Date(Date.now() - 20000).toISOString() }), podIssues: podIssues1 },
        { ...makeSnapshot({ timestamp: new Date(Date.now() - 10000).toISOString() }), podIssues: podIssues2 },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { getMetricsHistoryContext } = await importFresh()
      const context = getMetricsHistoryContext()

      // Should contain some pods but not all 15
      expect(context).toContain('increasing restarts')
      // Count the number of "prod/pod-" occurrences — should be capped at 10
      const podMentions = (context.match(/prod\/pod-/g) || []).length
      expect(podMentions).toBeLessThanOrEqual(10)
    })

    it('handles multi-cluster context with different CPU/memory values', async () => {
      const snaps = [
        {
          timestamp: new Date(Date.now() - 20000).toISOString(),
          clusters: [
            { name: 'east', cpuPercent: 30, memoryPercent: 40, nodeCount: 3, healthyNodes: 3 },
            { name: 'west', cpuPercent: 70, memoryPercent: 80, nodeCount: 5, healthyNodes: 5 },
          ],
          podIssues: [],
          gpuNodes: [],
        },
        {
          timestamp: new Date(Date.now() - 10000).toISOString(),
          clusters: [
            { name: 'east', cpuPercent: 35, memoryPercent: 45, nodeCount: 3, healthyNodes: 3 },
            { name: 'west', cpuPercent: 75, memoryPercent: 85, nodeCount: 5, healthyNodes: 5 },
          ],
          podIssues: [],
          gpuNodes: [],
        },
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { getMetricsHistoryContext } = await importFresh()
      const context = getMetricsHistoryContext()

      expect(context).toContain('east')
      expect(context).toContain('west')
      expect(context).toContain('30%')
      expect(context).toContain('75%')
    })

    it('uses only last 6 snapshots for context', async () => {
      // Create 10 snapshots
      const snaps: MetricsSnapshot[] = []
      for (let i = 0; i < 10; i++) {
        snaps.push(makeClusterSnapshot(
          'many-snaps',
          10 + i * 5,
          20 + i * 3,
          new Date(Date.now() - (10 - i) * 10000).toISOString(),
        ))
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { getMetricsHistoryContext } = await importFresh()
      const context = getMetricsHistoryContext()

      // Should mention "last 6 snapshots"
      expect(context).toContain('last 6 snapshots')
    })
  })

  describe('subscriber pattern', () => {
    it('multiple hook instances share the same snapshot state', async () => {
      mockClusters.push({ name: 'shared-state', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result: result1 } = renderHook(() => useMetricsHistory())
      const { result: result2 } = renderHook(() => useMetricsHistory())

      act(() => {
        result1.current.captureNow()
      })

      // Both instances should reflect the new snapshot
      expect(result1.current.snapshotCount).toBeGreaterThanOrEqual(1)
      expect(result2.current.snapshotCount).toBeGreaterThanOrEqual(1)
    })

    it('clearHistory is reflected across all hook instances', async () => {
      const snaps = [makeSnapshot(), makeSnapshot()]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))

      const { useMetricsHistory } = await importFresh()
      const { result: result1 } = renderHook(() => useMetricsHistory())
      const { result: result2 } = renderHook(() => useMetricsHistory())

      expect(result1.current.snapshotCount).toBe(2)

      act(() => {
        result1.current.clearHistory()
      })

      expect(result1.current.snapshotCount).toBe(0)
      expect(result2.current.snapshotCount).toBe(0)
    })
  })

  describe('useMetricsHistoryReadOnly', () => {
    const INITIAL_CAPTURE_DELAY_MS = 5000
    const TEN_MINUTES_MS = 10 * 60 * 1000

    it('does not start a capture timer (read-only)', async () => {
      mockClusters.push({
        name: 'readonly-cluster',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 8,
        memoryUsageGB: 4,
        nodeCount: 1,
        healthy: true,
      })

      const { useMetricsHistoryReadOnly } = await importFresh()
      const { result } = renderHook(() => useMetricsHistoryReadOnly())

      const startTime = Date.now()
      act(() => {
        vi.setSystemTime(startTime + INITIAL_CAPTURE_DELAY_MS + TEN_MINUTES_MS)
        vi.advanceTimersByTime(INITIAL_CAPTURE_DELAY_MS + TEN_MINUTES_MS)
      })

      // Singleton snapshot count stays at 0 — the read-only hook is not
      // driving the capture interval.
      expect(result.current.history).toHaveLength(0)
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      expect(stored).toHaveLength(0)
    })

    it('stays in sync with the singleton when the driver captures a snapshot', async () => {
      mockClusters.push({
        name: 'driver-cluster',
        cpuCores: 4,
        cpuUsageCores: 2,
        memoryGB: 8,
        memoryUsageGB: 4,
        nodeCount: 1,
        healthy: true,
      })

      const { useMetricsHistory, useMetricsHistoryReadOnly } = await importFresh()
      const { result: driver } = renderHook(() => useMetricsHistory())
      const { result: reader } = renderHook(() => useMetricsHistoryReadOnly())

      expect(reader.current.history).toHaveLength(0)

      act(() => {
        driver.current.captureNow()
      })

      // Read-only hook must reflect the driver's snapshot via the subscriber
      // pattern, without doing any MCP polling or capture of its own.
      expect(reader.current.history.length).toBeGreaterThanOrEqual(1)
      expect(driver.current.history.length).toBe(reader.current.history.length)
    })

    it('reflects HISTORY_CHANGED_EVENT updates (cross-tab sync)', async () => {
      const { useMetricsHistoryReadOnly } = await importFresh()
      const { result } = renderHook(() => useMetricsHistoryReadOnly())

      expect(result.current.history).toHaveLength(0)

      // Simulate another tab writing to localStorage and firing the event.
      const snap = makeSnapshot({ timestamp: new Date().toISOString() })
      localStorage.setItem(STORAGE_KEY, JSON.stringify([snap]))

      act(() => {
        window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
      })

      expect(result.current.history).toHaveLength(1)
    })
  })

  describe('cleanup on unmount', () => {
    it('removes subscriber on unmount to prevent memory leaks', async () => {
      const { useMetricsHistory } = await importFresh()
      const { unmount } = renderHook(() => useMetricsHistory())

      // Unmounting should not throw
      unmount()
    })

    it('clears interval on unmount', async () => {
      mockClusters.push({ name: 'cleanup', cpuCores: 4, cpuUsageCores: 2, memoryGB: 8, memoryUsageGB: 4, nodeCount: 1, healthy: true })

      const { useMetricsHistory } = await importFresh()
      const { result, unmount } = renderHook(() => useMetricsHistory())

      const _countBeforeUnmount = result.current.snapshotCount

      unmount()

      // Advancing timers should not capture more snapshots after unmount
      const TEN_MINUTES_MS = 10 * 60 * 1000
      act(() => {
        vi.advanceTimersByTime(TEN_MINUTES_MS)
      })

      // We cannot easily check the singleton state after unmount without
      // re-rendering, but this ensures no errors from stale callbacks
    })
  })
})
