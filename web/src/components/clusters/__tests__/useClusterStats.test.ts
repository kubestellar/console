/**
 * useClusterStats Hook Tests
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useClusterStats } from '../useClusterStats'
import type { ClusterInfo } from '../../../hooks/mcp/types'

describe('useClusterStats', () => {
  it('exports useClusterStats hook', () => {
    expect(useClusterStats).toBeDefined()
    expect(typeof useClusterStats).toBe('function')
  })

  it('does not count unknown/loading health as unhealthy', () => {
    const clusters = [
      { name: 'known-healthy', context: 'known-healthy', healthy: true, reachable: true, nodeCount: 2, readyNodes: 2 },
      { name: 'warming-up', context: 'warming-up', healthUnknown: true, healthy: false, nodeCount: 2, readyNodes: 2 },
      { name: 'loading', context: 'loading' },
    ] satisfies ClusterInfo[]

    const { result } = renderHook(() => useClusterStats({
      globalFilteredClusters: clusters,
      gpuByCluster: {},
    }))

    expect(result.current.healthy).toBe(1)
    expect(result.current.unhealthy).toBe(0)
    expect(result.current.loading).toBe(1)
    expect(result.current.healthyNodes).toBe(4)
  })

  it('uses readyNodes for node readiness while preserving total nodes', () => {
    const clusters = [
      { name: 'partial', context: 'partial', healthy: false, reachable: true, nodeCount: 3, readyNodes: 2 },
      { name: 'healthy', context: 'healthy', healthy: true, reachable: true, nodeCount: 2, readyNodes: 2 },
    ] satisfies ClusterInfo[]

    const { result } = renderHook(() => useClusterStats({
      globalFilteredClusters: clusters,
      gpuByCluster: {},
    }))

    expect(result.current.totalNodes).toBe(5)
    expect(result.current.healthyNodes).toBe(4)
    expect(result.current.unhealthy).toBe(1)
  })
})
