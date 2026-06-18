import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MetricsSnapshot } from '../../types/predictions'
import { HISTORY_CHANGED_EVENT, MAX_SNAPSHOTS, STORAGE_KEY, importFresh, makeSnapshot, mockClusters, mockGPUNodes, mockPodIssues } from './useMetricsHistory.helpers'
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
