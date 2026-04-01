import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../mcp/clusters', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [],
    isLoading: false,
  })),
}))

vi.mock('../mcp/operators', () => ({
  useOperators: vi.fn(() => ({
    operators: [],
    isLoading: false,
  })),
}))

vi.mock('../mcp/helm', () => ({
  useHelmReleases: vi.fn(() => ({
    releases: [],
    isLoading: false,
  })),
}))

vi.mock('../mcp/workloads', () => ({
  usePodIssues: vi.fn(() => ({
    issues: [],
    isLoading: false,
  })),
}))

vi.mock('../mcp/security', () => ({
  useSecurityIssues: vi.fn(() => ({
    issues: [],
    isLoading: false,
  })),
}))

import { useClusterContext } from '../useClusterContext'
import { useClusters } from '../mcp/clusters'

describe('useClusterContext', () => {
  it('returns null context when no healthy clusters', () => {
    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('returns context with cluster data when healthy clusters exist', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'eks-prod', healthy: true, isCurrent: true, distribution: 'eks', namespaces: ['default', 'monitoring'] },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext).not.toBeNull()
    expect(result.current.clusterContext?.name).toBe('eks-prod')
    expect(result.current.clusterContext?.provider).toBe('eks')
  })

  it('derives provider from distribution', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'my-gke', healthy: true, distribution: 'gke' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.provider).toBe('gke')
  })

  it('derives provider from cluster name when distribution absent', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'aks-staging', healthy: true },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.provider).toBe('aks')
  })

  it('picks current cluster as primary', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-a', healthy: true, isCurrent: false },
        { name: 'cluster-b', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.name).toBe('cluster-b')
  })

  it('isLoading is true when any sub-hook is loading', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [],
      isLoading: true,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.isLoading).toBe(true)
  })
})
