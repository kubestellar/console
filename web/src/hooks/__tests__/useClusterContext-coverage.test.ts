/**
 * Additional coverage tests for useClusterContext.ts
 *
 * Targets uncovered branches in the useClusterContext hook:
 * - Operator name stripping (-operator, -controller suffixes)
 * - Helm release chart name parsing
 * - Pod issues with nested issues and non-Running status
 * - Security issues aggregation
 * - Namespace-based label detection (istio, linkerd, monitoring, cert-manager)
 * - Distribution label
 * - Fallback to first healthy cluster when none is current
 */

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
import { useOperators } from '../mcp/operators'
import { useHelmReleases } from '../mcp/helm'
import { usePodIssues } from '../mcp/workloads'
import { useSecurityIssues } from '../mcp/security'

describe('useClusterContext — additional coverage', () => {
  it('extracts base name from operators with -operator suffix', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useOperators).mockReturnValue({
      operators: [
        { name: 'prometheus-operator' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.resources).toContain('prometheus-operator')
    expect(result.current.clusterContext?.resources).toContain('prometheus')
  })

  it('extracts base name from operators with -controller suffix', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useOperators).mockReturnValue({
      operators: [
        { name: 'ingress-controller' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.resources).toContain('ingress-controller')
    expect(result.current.clusterContext?.resources).toContain('ingress')
  })

  it('parses helm chart base names stripping version suffix', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useHelmReleases).mockReturnValue({
      releases: [
        { name: 'my-prometheus', chart: 'prometheus-25.8.0' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.resources).toContain('my-prometheus')
    expect(result.current.clusterContext?.resources).toContain('prometheus')
  })

  it('collects pod issues and non-Running statuses', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(usePodIssues).mockReturnValue({
      issues: [
        { issues: ['CrashLoopBackOff', 'OOMKilled'], status: 'CrashLoopBackOff' },
        { issues: [], status: 'Running' },
        { issues: ['ImagePullBackOff'], status: 'Pending' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    const issues = result.current.clusterContext?.issues || []
    expect(issues).toContain('CrashLoopBackOff')
    expect(issues).toContain('OOMKilled')
    expect(issues).toContain('ImagePullBackOff')
    expect(issues).toContain('Pending')
    // Running status should NOT be added
    expect(issues).not.toContain('Running')
  })

  it('collects security issues', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useSecurityIssues).mockReturnValue({
      issues: [
        { issue: 'Privileged container detected' },
        { issue: 'Missing network policy' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    const issues = result.current.clusterContext?.issues || []
    expect(issues).toContain('Privileged container detected')
    expect(issues).toContain('Missing network policy')
  })

  it('sets distribution label from primary cluster', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'eks-prod', healthy: true, isCurrent: true, distribution: 'eks-1.28' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.labels['distribution']).toBe('eks-1.28')
  })

  it('detects istio namespace and sets label', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true, namespaces: ['default', 'istio-system'] },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.labels['cncf.io/project']).toBe('istio')
  })

  it('detects linkerd namespace and sets label', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true, namespaces: ['linkerd', 'default'] },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.labels['cncf.io/project']).toBe('linkerd')
  })

  it('detects monitoring namespace and sets label', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true, namespaces: ['monitoring'] },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.labels['monitoring']).toBe('true')
  })

  it('detects prometheus namespace and sets monitoring label', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true, namespaces: ['prometheus-system'] },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.labels['monitoring']).toBe('true')
  })

  it('detects cert-manager namespace and sets label', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true, namespaces: ['cert-manager'] },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.labels['cert-manager']).toBe('true')
  })

  it('falls back to first healthy cluster when none is current', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'first-healthy', healthy: true, isCurrent: false },
        { name: 'second-healthy', healthy: true, isCurrent: false },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.name).toBe('first-healthy')
  })

  it('filters out unhealthy clusters', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'unhealthy', healthy: false, isCurrent: true },
        { name: 'healthy-one', healthy: true, isCurrent: false },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext?.name).toBe('healthy-one')
  })

  it('handles null operators gracefully', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useOperators).mockReturnValue({
      operators: null,
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext).not.toBeNull()
    expect(result.current.clusterContext?.resources).toBeDefined()
  })

  it('handles null releases gracefully', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useHelmReleases).mockReturnValue({
      releases: null,
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext).not.toBeNull()
  })

  it('handles null podIssues gracefully', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(usePodIssues).mockReturnValue({
      issues: null,
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext).not.toBeNull()
  })

  it('handles null securityIssues gracefully', () => {
    vi.mocked(useClusters).mockReturnValue({
      deduplicatedClusters: [
        { name: 'cluster-1', healthy: true, isCurrent: true },
      ],
      isLoading: false,
    } as never)
    vi.mocked(useSecurityIssues).mockReturnValue({
      issues: null,
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClusterContext())
    expect(result.current.clusterContext).not.toBeNull()
  })
})
