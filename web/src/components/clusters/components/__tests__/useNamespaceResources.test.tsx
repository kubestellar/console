/**
 * Unit tests for useNamespaceResources.
 *
 * This hook was extracted from NamespaceResources.tsx in PR #21904 and
 * previously had no dedicated test coverage. These tests exercise:
 *
 *   - podsByDeployment: grouping pods to their owning Deployment vs
 *     standalone pods (prefix-match on `${dep.name}-`).
 *   - View mode toggle (list ↔ tree) and expanded-set toggles for the
 *     tree view's group/item collapse UI.
 *   - handleResourceClick dispatches to the correct drillTo* action per
 *     ResourceKind and invokes the optional onClose callback.
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21904).
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────

// All the drillTo* fns are captured by reference so tests can assert on them.
const drillToPod = vi.fn()
const drillToDeployment = vi.fn()
const drillToService = vi.fn()
const drillToJob = vi.fn()
const drillToHPA = vi.fn()
const drillToConfigMap = vi.fn()
const drillToSecret = vi.fn()
const drillToServiceAccount = vi.fn()
const drillToPVC = vi.fn()

vi.mock('../../../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToPod,
    drillToDeployment,
    drillToService,
    drillToJob,
    drillToHPA,
    drillToConfigMap,
    drillToSecret,
    drillToServiceAccount,
    drillToPVC,
  }),
}))

// Data-source hooks. Individual tests can reassign these before calling
// renderHook to simulate loading/loaded states.
let mockPods: Array<{ name: string; namespace: string; cluster?: string; status: string; ready: string; restarts: number; age: string }> = []
let mockDeployments: Array<{ name: string; namespace: string }> = []
let mockPodsLoading = false
let mockDeploymentsLoading = false

vi.mock('../../../../hooks/useMCP', () => ({
  usePods: () => ({
    pods: mockPods,
    isLoading: mockPodsLoading,
    isRefreshing: false,
    lastRefresh: null,
  }),
  useDeployments: () => ({ deployments: mockDeployments, isLoading: mockDeploymentsLoading }),
  useServices: () => ({ services: [], isLoading: false }),
  useJobs: () => ({ jobs: [], isLoading: false }),
  useHPAs: () => ({ hpas: [], isLoading: false }),
  useConfigMaps: () => ({ configmaps: [], isLoading: false }),
  useSecrets: () => ({ secrets: [], isLoading: false }),
  useServiceAccounts: () => ({ serviceAccounts: [], isLoading: false }),
}))

vi.mock('../../../../hooks/useCachedData', () => ({
  useCachedPVCs: () => ({ pvcs: [], isLoading: false }),
}))

// buildAllResources is exercised by its own test suite (namespaceResourceUtils.test.ts).
// Here we stub it so the hook under test doesn't depend on its output shape.
vi.mock('../namespaceResourceUtils', () => ({
  buildAllResources: vi.fn(() => []),
}))

import { useNamespaceResources } from '../useNamespaceResources'

// ── Test data helpers ─────────────────────────────────────────────────

function makePod(name: string, extra: Partial<{ namespace: string; cluster: string }> = {}) {
  return {
    name,
    namespace: extra.namespace ?? 'default',
    cluster: extra.cluster ?? 'cluster-a',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    age: '1h',
  }
}

function makeDeployment(name: string, namespace = 'default') {
  return { name, namespace }
}

beforeEach(() => {
  mockPods = []
  mockDeployments = []
  mockPodsLoading = false
  mockDeploymentsLoading = false
  vi.clearAllMocks()
})

// ── podsByDeployment ──────────────────────────────────────────────────

describe('useNamespaceResources / podsByDeployment', () => {
  it('groups pods whose names start with "${deployment}-" under that deployment', () => {
    mockDeployments = [makeDeployment('api')]
    mockPods = [makePod('api-abc123'), makePod('api-def456')]

    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    expect(result.current.podsByDeployment.byDeployment['api']).toHaveLength(2)
    expect(result.current.podsByDeployment.standalone).toHaveLength(0)
  })

  it('places pods with no matching deployment prefix into standalone', () => {
    mockDeployments = [makeDeployment('api')]
    mockPods = [makePod('api-abc'), makePod('orphan-pod'), makePod('database-0')]

    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    expect(result.current.podsByDeployment.byDeployment['api']).toEqual([
      expect.objectContaining({ name: 'api-abc' }),
    ])
    expect(result.current.podsByDeployment.standalone.map(p => p.name)).toEqual([
      'orphan-pod',
      'database-0',
    ])
  })

  it('requires the trailing hyphen so it does not match sibling deployment names', () => {
    // "api" must not match "apiserver-xyz" (no `-` after `api`).
    mockDeployments = [makeDeployment('api')]
    mockPods = [makePod('apiserver-xyz')]

    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    expect(result.current.podsByDeployment.byDeployment['api']).toBeUndefined()
    expect(result.current.podsByDeployment.standalone.map(p => p.name)).toEqual(['apiserver-xyz'])
  })

  it('returns empty groups when there are no pods or deployments', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    expect(result.current.podsByDeployment.byDeployment).toEqual({})
    expect(result.current.podsByDeployment.standalone).toEqual([])
  })
})

// ── View mode + expansion state ───────────────────────────────────────

describe('useNamespaceResources / UI state', () => {
  it('defaults to tree view with deployments+pods expanded and no items expanded', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    expect(result.current.viewMode).toBe('tree')
    expect(result.current.expandedTypes.has('deployments')).toBe(true)
    expect(result.current.expandedTypes.has('pods')).toBe(true)
    expect(result.current.expandedItems.size).toBe(0)
  })

  it('setViewMode switches to list view', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    act(() => result.current.setViewMode('list'))
    expect(result.current.viewMode).toBe('list')

    act(() => result.current.setViewMode('tree'))
    expect(result.current.viewMode).toBe('tree')
  })

  it('toggleType adds an unknown type and removes an already-expanded one', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    // Add a new type
    act(() => result.current.toggleType('services'))
    expect(result.current.expandedTypes.has('services')).toBe(true)

    // Remove a default-expanded type
    act(() => result.current.toggleType('pods'))
    expect(result.current.expandedTypes.has('pods')).toBe(false)

    // Removing again re-adds it
    act(() => result.current.toggleType('pods'))
    expect(result.current.expandedTypes.has('pods')).toBe(true)
  })

  it('toggleItem toggles individual item ids independently', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))

    act(() => result.current.toggleItem('deployment/api'))
    act(() => result.current.toggleItem('deployment/web'))
    expect(result.current.expandedItems.has('deployment/api')).toBe(true)
    expect(result.current.expandedItems.has('deployment/web')).toBe(true)

    act(() => result.current.toggleItem('deployment/api'))
    expect(result.current.expandedItems.has('deployment/api')).toBe(false)
    expect(result.current.expandedItems.has('deployment/web')).toBe(true)
  })
})

// ── Loading state ─────────────────────────────────────────────────────

describe('useNamespaceResources / loading state', () => {
  it('reports isInitialLoading only while pods AND deployments are still loading', () => {
    mockPodsLoading = true
    mockDeploymentsLoading = true
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))
    expect(result.current.isInitialLoading).toBe(true)
    expect(result.current.isPartiallyLoading).toBe(true)
  })

  it('drops isInitialLoading once one of pods or deployments finishes', () => {
    mockPodsLoading = false
    mockDeploymentsLoading = true
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))
    expect(result.current.isInitialLoading).toBe(false)
    // still partially loading because deployments haven't finished
    expect(result.current.isPartiallyLoading).toBe(true)
  })

  it('starts with isTimedOut=false (timer has not fired synchronously)', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))
    expect(result.current.isTimedOut).toBe(false)
  })
})

// ── handleResourceClick dispatch ──────────────────────────────────────

describe('useNamespaceResources / handleResourceClick', () => {
  it.each([
    ['Pod',            () => drillToPod],
    ['Deployment',     () => drillToDeployment],
    ['Service',        () => drillToService],
    ['Job',            () => drillToJob],
    ['HPA',            () => drillToHPA],
    ['ConfigMap',      () => drillToConfigMap],
    ['Secret',         () => drillToSecret],
    ['ServiceAccount', () => drillToServiceAccount],
    ['PVC',            () => drillToPVC],
  ] as const)('dispatches %s to the correct drillTo* action', (kind, getMock) => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))
    const data = { foo: 'bar' }

    act(() => result.current.handleResourceClick(kind, 'name-1', 'ns-1', data))

    // Every other drill fn should be untouched
    const target = getMock()
    ;[
      drillToPod, drillToDeployment, drillToService, drillToJob, drillToHPA,
      drillToConfigMap, drillToSecret, drillToServiceAccount, drillToPVC,
    ].forEach(fn => {
      if (fn === target) expect(fn).toHaveBeenCalledWith('cluster-a', 'ns-1', 'name-1', data)
      else expect(fn).not.toHaveBeenCalled()
    })
  })

  it('invokes onClose after dispatching when provided', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default', onClose))

    act(() => result.current.handleResourceClick('Pod', 'p1', 'default'))

    expect(drillToPod).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not throw when onClose is omitted', () => {
    const { result } = renderHook(() => useNamespaceResources('cluster-a', 'default'))
    expect(() => act(() => result.current.handleResourceClick('Pod', 'p1', 'default'))).not.toThrow()
    expect(drillToPod).toHaveBeenCalledOnce()
  })
})
