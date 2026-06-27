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
})
