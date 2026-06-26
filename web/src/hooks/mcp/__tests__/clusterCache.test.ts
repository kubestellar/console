import { afterEach, describe, expect, it, vi } from 'vitest'

const mockGetLocalAgentURL = vi.hoisted(() => vi.fn(() => 'http://127.0.0.1:8585'))

vi.mock('../agentFetch', () => ({
  getLocalAgentURL: mockGetLocalAgentURL,
}))

import { clusterCacheRef, resolveAgentBase, resolveApiBase, resolveMcpBase } from '../clusterCache'
import { clusterCacheRef as directClusterCacheRef, setClusterCacheRefClusters } from '../clusterCacheRef'
import type { ClusterInfo } from '../types'

function setWindow(value: (Window & typeof globalThis) | undefined): void {
  Object.defineProperty(globalThis, 'window', {
    value,
    writable: true,
    configurable: true,
  })
}

const originalWindow = globalThis.window

afterEach(() => {
  setWindow(originalWindow)
  setClusterCacheRefClusters([])
  mockGetLocalAgentURL.mockReset()
  mockGetLocalAgentURL.mockReturnValue('http://127.0.0.1:8585')
})

describe('clusterCache URL resolvers', () => {
  it('returns an empty API base when window is unavailable', () => {
    setWindow(undefined)

    expect(resolveApiBase()).toBe('')
    expect(resolveMcpBase()).toBe('/api/mcp')
  })

  it('derives API and MCP bases from window.location.origin', () => {
    setWindow({ location: { origin: 'https://console.example.com' } } as Window & typeof globalThis)

    expect(resolveApiBase()).toBe('https://console.example.com')
    expect(resolveMcpBase()).toBe('https://console.example.com/api/mcp')
  })

  it('delegates agent base resolution to getLocalAgentURL', () => {
    mockGetLocalAgentURL.mockReturnValue('http://localhost:8585')

    expect(resolveAgentBase()).toBe('http://localhost:8585')
    expect(mockGetLocalAgentURL).toHaveBeenCalledTimes(1)
  })

  it('re-exports the shared cluster cache reference', () => {
    expect(clusterCacheRef).toBe(directClusterCacheRef)
  })

  it('reflects cluster cache updates through the re-exported reference', () => {
    const clusters: ClusterInfo[] = [
      { name: 'cluster-a', context: 'ctx-a', reachable: true },
      { name: 'cluster-b', context: 'ctx-b', reachable: false },
    ]

    setClusterCacheRefClusters(clusters)

    expect(clusterCacheRef.clusters).toBe(clusters)
    expect(clusterCacheRef.clusters.map(cluster => cluster.name)).toEqual(['cluster-a', 'cluster-b'])
  })
})
