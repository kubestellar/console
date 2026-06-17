import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPodIssues = vi.fn(() => ({ issues: [] }))
const mockDeploymentIssues = vi.fn(() => ({ issues: [] }))
const mockSecurityIssues = vi.fn(() => ({ issues: [] }))
const mockClusters = vi.fn(() => ({ clusters: [], deduplicatedClusters: [] }))
const mockNodes = vi.fn(() => ({ nodes: [] }))
const mockPods = vi.fn(() => ({ pods: [] }))

vi.mock('../useMCP', () => ({
  usePodIssues: () => mockPodIssues(),
  useDeploymentIssues: () => mockDeploymentIssues(),
  useSecurityIssues: () => mockSecurityIssues(),
  useClusters: () => mockClusters(),
  useNodes: () => mockNodes(),
  usePods: () => mockPods(),
}))

const mockIsSnoozed = vi.fn((_id: string) => false)
const mockIsDismissed = vi.fn((_id: string) => false)
const mockSnoozedMissions: unknown[] = []
const mockDismissedMissions: unknown[] = []

vi.mock('../useSnoozedMissions', () => ({
  useSnoozedMissions: () => ({
    isSnoozed: mockIsSnoozed,
    isDismissed: mockIsDismissed,
    snoozedMissions: mockSnoozedMissions,
    dismissedMissions: mockDismissedMissions,
  }),
}))

vi.mock('../../lib/constants/network', () => ({
  MISSION_SUGGEST_INTERVAL_MS: 120_000,
}))

import { useMissionSuggestions } from '../useMissionSuggestions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a pod issue with configurable restart count */
function makePodIssue(overrides: Record<string, unknown> = {}) {
  return {
    name: 'pod-1',
    namespace: 'default',
    restarts: 10,
    status: 'CrashLoopBackOff',
    ...overrides,
  }
}

/** Create a deployment issue */
function makeDeploymentIssue(overrides: Record<string, unknown> = {}) {
  return {
    name: 'deploy-1',
    namespace: 'default',
    replicas: 3,
    readyReplicas: 1,
    ...overrides,
  }
}

/** Create a security issue */
function makeSecurityIssue(overrides: Record<string, unknown> = {}) {
  return {
    issue: 'CVE-2024-1234',
    severity: 'high',
    cluster: 'prod-cluster',
    ...overrides,
  }
}

/** Create a cluster */
function makeCluster(overrides: Record<string, unknown> = {}) {
  return {
    name: 'cluster-1',
    reachable: true,
    healthy: true,
    errorMessage: '',
    ...overrides,
  }
}

/** Create a node */
function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    name: 'node-1',
    conditions: [],
    ...overrides,
  }
}

/** Create a pod */
function makePod(overrides: Record<string, unknown> = {}) {
  return {
    name: 'pod-1',
    namespace: 'default',
    status: 'Running',
    node: 'node-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMissionSuggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset mocks to empty data
    mockPodIssues.mockReturnValue({ issues: [] })
    mockDeploymentIssues.mockReturnValue({ issues: [] })
    mockSecurityIssues.mockReturnValue({ issues: [] })
    mockClusters.mockReturnValue({ clusters: [], deduplicatedClusters: [] })
    mockNodes.mockReturnValue({ nodes: [] })
    mockPods.mockReturnValue({ pods: [] })
    // Reset snooze/dismiss mocks
    mockIsSnoozed.mockImplementation(() => false)
    mockIsDismissed.mockImplementation(() => false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // 1. Base case
  // -------------------------------------------------------------------------

  it('returns empty suggestions when no issues exist', () => {
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions).toEqual([])
    expect(result.current.hasSuggestions).toBe(false)
    expect(result.current.stats.total).toBe(0)
    expect(result.current.stats.visible).toBe(0)
  })

  // -------------------------------------------------------------------------
  // 2. High-restart pods
  // -------------------------------------------------------------------------

  it('generates a restart mission when pods have high restart counts', () => {
    mockPodIssues.mockReturnValue({
      issues: [makePodIssue({ name: 'crasher', restarts: 15 })],
    })
    const { result } = renderHook(() => useMissionSuggestions())

    const restart = result.current.suggestions.find(s => s.type === 'restart')
    expect(restart).toBeDefined()
    expect(restart!.id).toBe('mission-restart-pods')
    expect(restart!.title).toBe('Investigate Restarting Pods')
    expect(restart!.context.count).toBe(1)
  })

  it('sets restart mission priority to medium when <= 5 pods', () => {
    mockPodIssues.mockReturnValue({
      issues: [
        makePodIssue({ name: 'p1', restarts: 10 }),
        makePodIssue({ name: 'p2', restarts: 8 }),
      ],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    const restart = result.current.suggestions.find(s => s.type === 'restart')
    expect(restart!.priority).toBe('medium')
  })

  it('escalates restart mission priority to high when > 5 pods', () => {
    const pods = Array.from({ length: 7 }, (_, i) =>
      makePodIssue({ name: `pod-${i}`, restarts: 10 })
    )
    mockPodIssues.mockReturnValue({ issues: pods })
    const { result } = renderHook(() => useMissionSuggestions())

    const restart = result.current.suggestions.find(s => s.type === 'restart')
    expect(restart!.priority).toBe('high')
  })

  it('does not generate restart mission for pods with restarts <= threshold', () => {
    mockPodIssues.mockReturnValue({
      issues: [makePodIssue({ restarts: 3 })],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'restart')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 3. Unavailable deployments
  // -------------------------------------------------------------------------

  it('generates an unavailable mission when deployments have unavailable replicas', () => {
    mockDeploymentIssues.mockReturnValue({
      issues: [makeDeploymentIssue({ name: 'web-app', replicas: 3, readyReplicas: 1 })],
    })
    const { result } = renderHook(() => useMissionSuggestions())

    const unavail = result.current.suggestions.find(s => s.type === 'unavailable')
    expect(unavail).toBeDefined()
    expect(unavail!.priority).toBe('high')
    expect(unavail!.context.details![0]).toContain('2/3 unavailable')
  })

  it('does not generate unavailable mission when all replicas are ready', () => {
    mockDeploymentIssues.mockReturnValue({
      issues: [makeDeploymentIssue({ replicas: 3, readyReplicas: 3 })],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'unavailable')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 4. Security issues
  // -------------------------------------------------------------------------

  it('generates a security mission for high severity issues', () => {
    mockSecurityIssues.mockReturnValue({
      issues: [makeSecurityIssue({ severity: 'high' })],
    })
    const { result } = renderHook(() => useMissionSuggestions())

    const sec = result.current.suggestions.find(s => s.type === 'security')
    expect(sec).toBeDefined()
    expect(sec!.priority).toBe('critical')
    expect(sec!.context.count).toBe(1)
  })

  it('ignores non-high severity security issues', () => {
    mockSecurityIssues.mockReturnValue({
      issues: [makeSecurityIssue({ severity: 'low' })],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'security')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 5. Unhealthy clusters
  // -------------------------------------------------------------------------

  it('generates a health mission for unreachable clusters', () => {
    mockClusters.mockReturnValue({
      clusters: [makeCluster({ name: 'prod', reachable: false, errorMessage: 'timeout' })],
      deduplicatedClusters: [makeCluster({ name: 'prod', reachable: false, errorMessage: 'timeout' })],
    })
    const { result } = renderHook(() => useMissionSuggestions())

    const health = result.current.suggestions.find(s => s.type === 'health')
    expect(health).toBeDefined()
    expect(health!.priority).toBe('critical')
    expect(health!.context.details![0]).toContain('timeout')
  })

  it('generates a health mission for unhealthy clusters (healthy=false)', () => {
    mockClusters.mockReturnValue({
      clusters: [makeCluster({ name: 'staging', healthy: false })],
      deduplicatedClusters: [makeCluster({ name: 'staging', healthy: false })],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'health')).toBeDefined()
  })

  it('treats confirmed network failures as unreachable for health missions', () => {
    mockClusters.mockReturnValue({
      clusters: [makeCluster({ name: 'prod', healthy: false, reachable: true, errorType: 'network', errorMessage: 'dial tcp timeout' })],
      deduplicatedClusters: [makeCluster({ name: 'prod', healthy: false, reachable: true, errorType: 'network', errorMessage: 'dial tcp timeout' })],
    })
    const { result } = renderHook(() => useMissionSuggestions())

    const health = result.current.suggestions.find(s => s.type === 'health')
    expect(health).toBeDefined()
    expect(health!.description).toContain('1 cluster is unhealthy or unreachable')
    expect(health!.context.details![0]).toContain('dial tcp timeout')
  })

  it('does not generate a health mission for healthy clusters', () => {
    mockClusters.mockReturnValue({
      clusters: [makeCluster({ reachable: true, healthy: true })],
      deduplicatedClusters: [makeCluster({ reachable: true, healthy: true })],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'health')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 6. Resource limits (pods without limits)
  // -------------------------------------------------------------------------

  it('generates a limits mission when > 10 running pods have no node', () => {
    // The hook uses the heuristic: Running + no node = possibly missing limits
    const pods = Array.from({ length: 12 }, (_, i) =>
      makePod({ name: `pod-${i}`, status: 'Running', node: undefined })
    )
    mockPods.mockReturnValue({ pods })
    const { result } = renderHook(() => useMissionSuggestions())

    const limits = result.current.suggestions.find(s => s.type === 'limits')
    expect(limits).toBeDefined()
    expect(limits!.priority).toBe('low')
    expect(limits!.context.count).toBe(12)
  })

  it('does not generate limits mission when <= 10 qualifying pods', () => {
    const pods = Array.from({ length: 8 }, (_, i) =>
      makePod({ name: `pod-${i}`, status: 'Running', node: undefined })
    )
    mockPods.mockReturnValue({ pods })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'limits')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 7. Node pressure
  // -------------------------------------------------------------------------

  it('generates a resource mission for nodes under memory pressure', () => {
    mockNodes.mockReturnValue({
      nodes: [
        makeNode({
          name: 'big-node',
          conditions: [{ type: 'MemoryPressure', status: 'True' }],
        }),
      ],
    })
    const { result } = renderHook(() => useMissionSuggestions())

    const resource = result.current.suggestions.find(s => s.type === 'resource')
    expect(resource).toBeDefined()
    expect(resource!.priority).toBe('high')
    expect(resource!.context.details).toContain('big-node')
  })

  it('generates a resource mission for nodes under disk pressure', () => {
    mockNodes.mockReturnValue({
      nodes: [
        makeNode({
          name: 'full-disk',
          conditions: [{ type: 'DiskPressure', status: 'True' }],
        }),
      ],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'resource')).toBeDefined()
  })

  it('does not generate resource mission when pressure conditions are False', () => {
    mockNodes.mockReturnValue({
      nodes: [
        makeNode({
          conditions: [{ type: 'MemoryPressure', status: 'False' }],
        }),
      ],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'resource')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 8. Scale review (single-replica deployments)
  // -------------------------------------------------------------------------

  it('generates a scale mission when > 3 single-replica deployments exist', () => {
    const deploys = Array.from({ length: 5 }, (_, i) =>
      makeDeploymentIssue({ name: `svc-${i}`, replicas: 1, readyReplicas: 1 })
    )
    mockDeploymentIssues.mockReturnValue({ issues: deploys })
    const { result } = renderHook(() => useMissionSuggestions())

    const scale = result.current.suggestions.find(s => s.type === 'scale')
    expect(scale).toBeDefined()
    expect(scale!.priority).toBe('low')
    expect(scale!.context.count).toBe(5)
  })

  it('does not generate scale mission when <= 3 single-replica deployments', () => {
    mockDeploymentIssues.mockReturnValue({
      issues: [
        makeDeploymentIssue({ replicas: 1, readyReplicas: 1 }),
        makeDeploymentIssue({ name: 'd2', replicas: 1, readyReplicas: 1 }),
      ],
    })
    const { result } = renderHook(() => useMissionSuggestions())
    expect(result.current.suggestions.find(s => s.type === 'scale')).toBeUndefined()
  })

})
