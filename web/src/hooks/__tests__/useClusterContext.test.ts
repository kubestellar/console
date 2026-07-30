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

import { useClusterContext, deriveProvider } from '../useClusterContext'
import { useClusters } from '../mcp/clusters'

// ---------------------------------------------------------------------------
// Tests: deriveProvider (pure function)
// ---------------------------------------------------------------------------

describe('deriveProvider', () => {
  it('returns "eks" when distribution contains "eks"', () => {
    expect(deriveProvider('eks', 'my-cluster')).toBe('eks')
  })

  it('returns "eks" when name contains "eks" but distribution does not', () => {
    expect(deriveProvider('vanilla-k8s', 'prod-eks-east')).toBe('eks')
  })

  it('returns "gke" when distribution contains "gke"', () => {
    expect(deriveProvider('gke', '')).toBe('gke')
  })

  it('returns "gke" when name contains "gke"', () => {
    expect(deriveProvider(undefined, 'gke-staging')).toBe('gke')
  })

  it('returns "aks" when distribution contains "aks"', () => {
    expect(deriveProvider('aks', 'cluster-1')).toBe('aks')
  })

  it('returns "aks" when name contains "aks"', () => {
    expect(deriveProvider('', 'my-aks-cluster')).toBe('aks')
  })

  it('returns "openshift" when distribution contains "openshift"', () => {
    expect(deriveProvider('openshift', 'ocp-prod')).toBe('openshift')
  })

  it('returns "openshift" when distribution contains "ocp"', () => {
    expect(deriveProvider('ocp-4.14', 'my-cluster')).toBe('openshift')
  })

  it('returns "k3s" when distribution contains "k3s"', () => {
    expect(deriveProvider('k3s', '')).toBe('k3s')
  })

  it('returns "k3s" when name contains "k3s"', () => {
    expect(deriveProvider(undefined, 'edge-k3s-node')).toBe('k3s')
  })

  it('returns "kind" when distribution contains "kind"', () => {
    expect(deriveProvider('kind', '')).toBe('kind')
  })

  it('returns "kind" when name contains "kind"', () => {
    expect(deriveProvider('', 'kind-local')).toBe('kind')
  })

  it('returns "minikube" when distribution contains "minikube"', () => {
    expect(deriveProvider('minikube', '')).toBe('minikube')
  })

  it('returns "minikube" when name contains "minikube"', () => {
    expect(deriveProvider(undefined, 'minikube-dev')).toBe('minikube')
  })

  it('returns "rke" when distribution contains "rke"', () => {
    expect(deriveProvider('rke2', 'rancher-cluster')).toBe('rke')
  })

  it('returns "rke" when name contains "rke"', () => {
    expect(deriveProvider('', 'prod-rke-01')).toBe('rke')
  })

  it('returns undefined when no provider matches', () => {
    expect(deriveProvider('vanilla', 'my-cluster')).toBeUndefined()
  })

  it('returns undefined when both args are undefined', () => {
    expect(deriveProvider(undefined, undefined)).toBeUndefined()
  })

  it('returns undefined when both args are empty strings', () => {
    expect(deriveProvider('', '')).toBeUndefined()
  })

  it('is case-insensitive for distribution', () => {
    expect(deriveProvider('EKS', '')).toBe('eks')
    expect(deriveProvider('GKE', '')).toBe('gke')
    expect(deriveProvider('AKS', '')).toBe('aks')
    expect(deriveProvider('OpenShift', '')).toBe('openshift')
  })

  it('is case-insensitive for name', () => {
    expect(deriveProvider('', 'MY-EKS-CLUSTER')).toBe('eks')
    expect(deriveProvider('', 'GKE-Staging')).toBe('gke')
  })

  it('prioritizes eks over gke when both appear', () => {
    // eks is checked first in the function
    expect(deriveProvider('eks-gke', '')).toBe('eks')
  })

  it('matches distribution before name for openshift/ocp', () => {
    // openshift only matches on distribution, not name
    expect(deriveProvider('openshift-4.14', 'random-name')).toBe('openshift')
  })
})

// ---------------------------------------------------------------------------
// Tests: useClusterContext hook (existing tests preserved)
// ---------------------------------------------------------------------------

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
