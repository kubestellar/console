import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { MetricsSnapshot } from '../../types/predictions'
import { STORAGE_KEY, importFresh, makeClusterSnapshot, makePodSnapshot, makeSnapshot } from './useMetricsHistory.helpers'
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
