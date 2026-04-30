/**
 * Tests for hooks/mcp/clusterCacheRef.ts
 *
 * Covers: getter/setter, isolation between calls.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { clusterCacheRef, setClusterCacheRefClusters } from '../clusterCacheRef'
import type { ClusterInfo } from '../types'

describe('clusterCacheRef', () => {
  beforeEach(() => {
    // Reset to empty before each test
    setClusterCacheRefClusters([])
  })

  it('starts with empty clusters array', () => {
    expect(clusterCacheRef.clusters).toEqual([])
  })

  it('setClusterCacheRefClusters updates the getter', () => {
    const clusters: ClusterInfo[] = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: false },
    ]
    setClusterCacheRefClusters(clusters)
    expect(clusterCacheRef.clusters).toHaveLength(2)
    expect(clusterCacheRef.clusters[0].name).toBe('cluster-a')
    expect(clusterCacheRef.clusters[1].reachable).toBe(false)
  })

  it('subsequent calls to setter replace previous clusters', () => {
    setClusterCacheRefClusters([{ name: 'first', context: 'c1' }] as ClusterInfo[])
    expect(clusterCacheRef.clusters).toHaveLength(1)

    setClusterCacheRefClusters([
      { name: 'second', context: 'c2' },
      { name: 'third', context: 'c3' },
    ] as ClusterInfo[])
    expect(clusterCacheRef.clusters).toHaveLength(2)
    expect(clusterCacheRef.clusters[0].name).toBe('second')
  })

  it('setting to empty array clears clusters', () => {
    setClusterCacheRefClusters([{ name: 'a', context: 'c' }] as ClusterInfo[])
    setClusterCacheRefClusters([])
    expect(clusterCacheRef.clusters).toEqual([])
  })

  it('getter returns reference (not copy) of the array', () => {
    const clusters = [{ name: 'ref-test', context: 'c' }] as ClusterInfo[]
    setClusterCacheRefClusters(clusters)
    // Same reference
    expect(clusterCacheRef.clusters).toBe(clusters)
  })
})
