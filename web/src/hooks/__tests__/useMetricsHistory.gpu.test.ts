import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { importFresh, mockClusters, mockGPUNodes } from './useMetricsHistory.helpers'
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
