import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockPodIssues = vi.fn()
const mockDeploymentIssues = vi.fn()
const mockEvents = vi.fn()
const mockDeployments = vi.fn()
const mockServices = vi.fn()
const mockPods = vi.fn()
const mockPVCs = vi.fn()

vi.mock('../../../hooks/useMCP', () => ({
  usePodIssues: (...a: unknown[]) => mockPodIssues(...a),
  useDeploymentIssues: (...a: unknown[]) => mockDeploymentIssues(...a),
  useEvents: (...a: unknown[]) => mockEvents(...a),
  useDeployments: (...a: unknown[]) => mockDeployments(...a),
  useServices: (...a: unknown[]) => mockServices(...a),
  usePods: (...a: unknown[]) => mockPods(...a),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedPVCs: (...a: unknown[]) => mockPVCs(...a),
}))

import { useNamespaceDrillDown } from './useNamespaceDrillDown'

describe('useNamespaceDrillDown', () => {
  beforeEach(() => {
    mockPodIssues.mockReset()
    mockDeploymentIssues.mockReset()
    mockEvents.mockReset()
    mockDeployments.mockReset()
    mockServices.mockReset()
    mockPods.mockReset()
    mockPVCs.mockReset()

    mockPodIssues.mockReturnValue({ issues: [] })
    mockDeploymentIssues.mockReturnValue({ issues: [] })
    mockEvents.mockReturnValue({ events: [] })
    mockDeployments.mockReturnValue({ deployments: [] })
    mockServices.mockReturnValue({ services: [] })
    mockPods.mockReturnValue({ pods: [] })
    mockPVCs.mockReturnValue({ pvcs: [] })
  })

  it('uses the short cluster (last path segment) for resource hooks', () => {
    renderHook(() => useNamespaceDrillDown('org/short-c1', 'nsA'))
    expect(mockDeployments).toHaveBeenCalledWith('short-c1', 'nsA')
    expect(mockServices).toHaveBeenCalledWith('short-c1', 'nsA')
    expect(mockPods).toHaveBeenCalledWith('short-c1', 'nsA')
    expect(mockPVCs).toHaveBeenCalledWith('short-c1', 'nsA')
    expect(mockEvents).toHaveBeenCalledWith('org/short-c1', 'nsA', 20)
    expect(mockPodIssues).toHaveBeenCalledWith('org/short-c1')
  })

  it('falls back to full cluster when there is no slash', () => {
    renderHook(() => useNamespaceDrillDown('single', 'nsA'))
    expect(mockDeployments).toHaveBeenCalledWith('single', 'nsA')
  })

  it('filters pod issues, deployment issues, and events by namespace', () => {
    mockPodIssues.mockReturnValue({
      issues: [
        { name: 'p1', namespace: 'nsA', status: 'Running', restarts: 0 },
        { name: 'p2', namespace: 'nsB', status: 'Running', restarts: 0 },
      ],
    })
    mockDeploymentIssues.mockReturnValue({
      issues: [
        { name: 'd1', namespace: 'nsA', cluster: 'org/short-c1', replicas: 1, readyReplicas: 0 },
        { name: 'd2', namespace: 'nsB', cluster: 'org/short-c1', replicas: 1, readyReplicas: 0 },
        { name: 'd3', namespace: 'nsA', cluster: 'other/short-c1', replicas: 1, readyReplicas: 0 },
      ],
    })
    mockEvents.mockReturnValue({
      events: [
        { type: 'Normal', reason: 'Started', message: 'ok', object: 'pod/p1', namespace: 'nsA' },
        { type: 'Warning', reason: 'Failed', message: 'x', object: 'pod/p2', namespace: 'nsB' },
      ],
    })

    const { result } = renderHook(() => useNamespaceDrillDown('org/short-c1', 'nsA'))
    expect(result.current.podIssues.map((p) => p.name)).toEqual(['p1'])
    expect(result.current.deploymentIssues.map((d) => d.name)).toEqual(['d1'])
    expect(result.current.nsEvents.map((e) => e.object)).toEqual(['pod/p1'])
  })

  it('deployment-issue filter matches when cluster contains the org prefix of the input cluster', () => {
    mockDeploymentIssues.mockReturnValue({
      issues: [
        // cluster includes 'org' (the first segment of 'org/short-c1'), so retained
        { name: 'd1', namespace: 'nsA', cluster: 'org-mirror', replicas: 1, readyReplicas: 0 },
      ],
    })
    const { result } = renderHook(() => useNamespaceDrillDown('org/short-c1', 'nsA'))
    expect(result.current.deploymentIssues.map((d) => d.name)).toEqual(['d1'])
  })

  it('normalises falsy resource-hook returns to empty arrays', () => {
    mockDeployments.mockReturnValue({ deployments: undefined })
    mockServices.mockReturnValue({ services: null })
    mockPods.mockReturnValue({ pods: undefined })
    mockPVCs.mockReturnValue({ pvcs: null })

    const { result } = renderHook(() => useNamespaceDrillDown('org/short-c1', 'nsA'))
    expect(result.current.allDeployments).toEqual([])
    expect(result.current.allServices).toEqual([])
    expect(result.current.allPods).toEqual([])
    expect(result.current.allPVCs).toEqual([])
  })
})
