import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { importFresh, mockClusters, mockGPUNodes, mockPodIssues } from './useMetricsHistory.helpers'
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
