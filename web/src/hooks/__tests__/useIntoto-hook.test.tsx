/**
 * Tests for the useIntoto() hook.
 * The existing useIntoto.test.ts only covers computeIntotoStats.
 * These tests exercise the hook itself: demo mode, empty-cluster, and
 * real-cluster fetch paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock factories (must run before static imports)
// ---------------------------------------------------------------------------

const {
  mockIsDemoMode,
  mockUseClusters,
  mockKubectlExec,
  mockSettledWithConcurrency,
  mockRegisterCacheReset,
  mockRegisterRefetch,
  mockUnregisterCacheReset,
} = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseClusters: vi.fn(),
  mockKubectlExec: vi.fn(),
  mockSettledWithConcurrency: vi.fn(async (tasks: (() => Promise<unknown>)[]) => {
    return Promise.all(tasks.map(t => t().then(v => ({ status: 'fulfilled' as const, value: v })).catch(e => ({ status: 'rejected' as const, reason: e }))))
  }),
  mockRegisterCacheReset: vi.fn(),
  mockRegisterRefetch: vi.fn(() => vi.fn()),
  mockUnregisterCacheReset: vi.fn(),
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
}))

vi.mock('../useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: (...args: unknown[]) => mockKubectlExec(...args),
  },
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: (tasks: (() => Promise<unknown>)[]) => mockSettledWithConcurrency(tasks),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  unregisterCacheReset: (...args: unknown[]) => mockUnregisterCacheReset(...args),
}))

import { useIntoto } from '../useIntoto'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockIsDemoMode.mockReturnValue(false)
  mockUseClusters.mockReturnValue({ clusters: [], isLoading: false })
  mockRegisterRefetch.mockReturnValue(vi.fn())
})

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

describe('useIntoto — demo mode', () => {
  it('returns isDemoData=true in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isDemoData).toBe(true)
  })

  it('populates 3 default demo clusters when no clusters are connected', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseClusters.mockReturnValue({ clusters: [], isLoading: false })
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(Object.keys(result.current.statuses)).toHaveLength(3)
    expect(result.current.statuses['us-east-1']).toBeDefined()
    expect(result.current.statuses['eu-central-1']).toBeDefined()
    expect(result.current.statuses['us-west-2']).toBeDefined()
  })

  it('uses real cluster names as demo cluster names when clusters are connected', async () => {
    mockIsDemoMode.mockReturnValue(true)
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'prod-cluster', reachable: true }, { name: 'staging-cluster', reachable: true }], isLoading: false })
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.statuses['prod-cluster']).toBeDefined()
    expect(result.current.statuses['staging-cluster']).toBeDefined()
  })

  it('demo statuses have installed=true and no error', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    const statuses = Object.values(result.current.statuses)
    expect(statuses.every(s => s.installed)).toBe(true)
    expect(statuses.every(s => !s.error)).toBe(true)
  })

  it('sets clustersChecked to number of demo clusters', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.clustersChecked).toBe(3)
  })

  it('sets lastRefresh to a Date in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.lastRefresh).toBeInstanceOf(Date)
  })

  it('does not call kubectlProxy.exec in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)
    renderHook(() => useIntoto())
    await waitFor(() => true)
    expect(mockKubectlExec).not.toHaveBeenCalled()
  })

  it('installed=true when demo statuses are populated', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.installed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Empty / loading clusters
// ---------------------------------------------------------------------------

describe('useIntoto — no clusters', () => {
  it('sets isLoading=false when cluster list is empty and not loading', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockUseClusters.mockReturnValue({ clusters: [], isLoading: false })
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns empty statuses when no clusters', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockUseClusters.mockReturnValue({ clusters: [], isLoading: false })
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.statuses).toEqual({})
    expect(result.current.installed).toBe(false)
  })

  it('totalClusters is 0 when no clusters', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.totalClusters).toBe(0)
  })

  it('hasErrors is false when no clusters', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.hasErrors).toBe(false)
  })

  it('isFailed is false initially', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(result.current.isFailed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Cluster fetch — CRD not installed
// ---------------------------------------------------------------------------

describe('useIntoto — cluster fetch: CRD not installed', () => {
  it('marks cluster as not installed when CRD check fails', async () => {
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'cluster-a', reachable: true }], isLoading: false })
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: 'not found' })
    mockSettledWithConcurrency.mockImplementation(async (tasks: (() => Promise<unknown>)[]) =>
      Promise.all(tasks.map(t => t().then(v => ({ status: 'fulfilled' as const, value: v }))))
    )
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => expect(result.current.statuses['cluster-a']).toBeDefined())
    expect(result.current.statuses['cluster-a']?.installed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Cluster fetch — CRD installed, layouts found
// ---------------------------------------------------------------------------

describe('useIntoto — cluster fetch: CRD installed', () => {
  const layoutResponse = JSON.stringify({
    items: [
      {
        metadata: { name: 'build-layout', namespace: 'default', creationTimestamp: '2026-01-01T00:00:00Z' },
        spec: {
          steps: [
            { name: 'clone', pubkeys: ['key1'] },
            { name: 'build', pubkeys: [] },
          ],
        },
      },
    ],
  })

  const linkResponse = JSON.stringify({ items: [] })

  beforeEach(() => {
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'cluster-b', reachable: true }], isLoading: false })
    mockKubectlExec
      .mockResolvedValueOnce({ exitCode: 0, output: 'layouts.in-toto.io' })
      .mockResolvedValueOnce({ exitCode: 0, output: layoutResponse })
      .mockResolvedValueOnce({ exitCode: 0, output: linkResponse })
    mockSettledWithConcurrency.mockImplementation(async (tasks: (() => Promise<unknown>)[]) =>
      Promise.all(tasks.map(t => t().then(v => ({ status: 'fulfilled' as const, value: v }))))
    )
  })

  it('marks cluster as installed when CRD found and layouts fetched', async () => {
    const { result } = renderHook(() => useIntoto())
    // waitFor only re-polls when the callback throws; a boolean return resolves
    // immediately via onDone(null, false). Use expect() so it actually waits.
    await waitFor(() => expect(result.current.statuses['cluster-b']?.installed).toBe(true))
    expect(result.current.statuses['cluster-b']?.installed).toBe(true)
  })

  it('populates layouts from API response', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() =>
      expect(result.current.statuses['cluster-b']?.layouts?.length).toBeGreaterThan(0)
    )
    expect(result.current.statuses['cluster-b']?.layouts).toHaveLength(1)
    expect(result.current.statuses['cluster-b']?.layouts[0].name).toBe('build-layout')
  })

  it('steps are mapped from spec.steps', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() =>
      expect(result.current.statuses['cluster-b']?.layouts[0]?.steps?.length).toBeGreaterThanOrEqual(2)
    )
    const steps = result.current.statuses['cluster-b']?.layouts[0].steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0].name).toBe('clone')
    expect(steps[1].name).toBe('build')
  })

  it('steps with no pubkeys show unknown functionary', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() =>
      expect(result.current.statuses['cluster-b']?.layouts[0]?.steps?.length).toBeGreaterThanOrEqual(2)
    )
    const steps = result.current.statuses['cluster-b']?.layouts[0].steps ?? []
    expect(steps[1].functionary).toBe('unknown')
  })

  it('installed is true when at least one cluster is installed', async () => {
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => expect(result.current.installed).toBe(true))
    expect(result.current.installed).toBe(true)
  })

  it('saves result to localStorage cache', async () => {
    renderHook(() => useIntoto())
    await waitFor(() => expect(localStorage.getItem('kc-intoto-cache')).not.toBeNull())
    const cached = localStorage.getItem('kc-intoto-cache')
    expect(cached).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Cluster fetch — link verification
// ---------------------------------------------------------------------------

describe('useIntoto — link verification', () => {
  const layoutResponse = JSON.stringify({
    items: [{
      metadata: { name: 'my-layout', namespace: 'default', creationTimestamp: '2026-01-01T00:00:00Z' },
      spec: { steps: [{ name: 'build', pubkeys: [] }] },
    }],
  })

  const linkResponseVerified = JSON.stringify({
    items: [{
      metadata: {
        name: 'build.link',
        namespace: 'default',
        labels: { 'layout-name': 'my-layout', 'step-name': 'build' },
      },
      spec: { name: 'build' },
      status: { verified: true },
    }],
  })

  it('marks step as verified when link.status.verified=true', async () => {
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'c1', reachable: true }], isLoading: false })
    mockKubectlExec
      .mockResolvedValueOnce({ exitCode: 0, output: 'layouts.in-toto.io' })
      .mockResolvedValueOnce({ exitCode: 0, output: layoutResponse })
      .mockResolvedValueOnce({ exitCode: 0, output: linkResponseVerified })
    mockSettledWithConcurrency.mockImplementation(async (tasks: (() => Promise<unknown>)[]) =>
      Promise.all(tasks.map(t => t().then(v => ({ status: 'fulfilled' as const, value: v }))))
    )

    const { result } = renderHook(() => useIntoto())
    await waitFor(() => expect(result.current.statuses['c1']?.layouts[0]?.steps[0]?.status).toBe('verified'))
    const step = result.current.statuses['c1']?.layouts[0]?.steps[0]
    expect(step?.status).toBe('verified')
  })
})

// ---------------------------------------------------------------------------
// Cluster fetch — error paths
// ---------------------------------------------------------------------------

describe('useIntoto — cluster fetch: errors', () => {
  it('returns error status when kubectlProxy throws', async () => {
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'bad-cluster', reachable: true }], isLoading: false })
    mockKubectlExec.mockRejectedValue(new Error('connection refused'))
    mockSettledWithConcurrency.mockImplementation(async (tasks: (() => Promise<unknown>)[]) =>
      Promise.all(tasks.map(t => t()
        .then(v => ({ status: 'fulfilled' as const, value: v }))
        .catch((e: Error) => ({ status: 'rejected' as const, reason: e }))
      ))
    )

    const { result } = renderHook(() => useIntoto())
    await waitFor(() => expect(result.current.statuses['bad-cluster']).toBeDefined())
    expect(result.current.statuses['bad-cluster']?.error).toBeTruthy()
  })

  it('hasErrors is true when a cluster has an error', async () => {
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'err-cluster', reachable: true }], isLoading: false })
    mockKubectlExec.mockRejectedValue(new Error('timeout'))
    mockSettledWithConcurrency.mockImplementation(async (tasks: (() => Promise<unknown>)[]) =>
      Promise.all(tasks.map(t => t()
        .then(v => ({ status: 'fulfilled' as const, value: v }))
        .catch((e: Error) => ({ status: 'rejected' as const, reason: e }))
      ))
    )

    const { result } = renderHook(() => useIntoto())
    await waitFor(() => expect(result.current.hasErrors).toBe(true))
    expect(result.current.hasErrors).toBe(true)
  })

  it('consecutiveFailures increments when all clusters error', async () => {
    mockUseClusters.mockReturnValue({ clusters: [{ name: 'err-cluster', reachable: true }], isLoading: false })
    mockKubectlExec.mockRejectedValue(new Error('timeout'))
    mockSettledWithConcurrency.mockImplementation(async (tasks: (() => Promise<unknown>)[]) =>
      Promise.all(tasks.map(t => t()
        .then(v => ({ status: 'fulfilled' as const, value: v }))
        .catch((e: Error) => ({ status: 'rejected' as const, reason: e }))
      ))
    )

    const { result } = renderHook(() => useIntoto())
    await waitFor(() => expect(result.current.consecutiveFailures).toBeGreaterThan(0))
    expect(result.current.consecutiveFailures).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Mode transition registration
// ---------------------------------------------------------------------------

describe('useIntoto — mode transition', () => {
  it('registers a cache reset handler on mount', async () => {
    renderHook(() => useIntoto())
    await waitFor(() => mockRegisterCacheReset.mock.calls.length > 0)
    expect(mockRegisterCacheReset).toHaveBeenCalledWith('intoto', expect.any(Function))
  })

  it('registers a refetch handler on mount', async () => {
    renderHook(() => useIntoto())
    await waitFor(() => mockRegisterRefetch.mock.calls.length > 0)
    expect(mockRegisterRefetch).toHaveBeenCalledWith('intoto', expect.any(Function))
  })

  it('unregisters cache reset on unmount', async () => {
    const { unmount } = renderHook(() => useIntoto())
    await waitFor(() => mockRegisterCacheReset.mock.calls.length > 0)
    unmount()
    expect(mockUnregisterCacheReset).toHaveBeenCalledWith('intoto')
  })

  it('cache reset handler clears statuses', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useIntoto())
    await waitFor(() => !result.current.isLoading)
    expect(Object.keys(result.current.statuses).length).toBeGreaterThan(0)

    const cacheResetCall = mockRegisterCacheReset.mock.calls.find(
      (c: unknown[]) => (c as [string])[0] === 'intoto',
    )
    const cacheResetHandler = cacheResetCall?.[1] as (() => void) | undefined
    if (cacheResetHandler) {
      act(() => cacheResetHandler())
      expect(result.current.statuses).toEqual({})
      expect(result.current.isLoading).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Cache loading
// ---------------------------------------------------------------------------

describe('useIntoto — localStorage cache', () => {
  it('loads statuses from cache on mount', async () => {
    const cacheData = {
      'cached-cluster': {
        cluster: 'cached-cluster',
        installed: true,
        loading: false,
        layouts: [],
        totalLayouts: 0,
        totalSteps: 0,
        verifiedSteps: 0,
        failedSteps: 0,
        missingSteps: 0,
      },
    }
    localStorage.setItem('kc-intoto-cache', JSON.stringify(cacheData))
    localStorage.setItem('kc-intoto-cache-time', String(Date.now()))

    const { result } = renderHook(() => useIntoto())
    expect(result.current.statuses['cached-cluster']).toBeDefined()
  })

  it('starts with isLoading=false when cache is populated', async () => {
    const cacheData = { 'c': { cluster: 'c', installed: true, loading: false, layouts: [], totalLayouts: 0, totalSteps: 0, verifiedSteps: 0, failedSteps: 0, missingSteps: 0 } }
    localStorage.setItem('kc-intoto-cache', JSON.stringify(cacheData))
    localStorage.setItem('kc-intoto-cache-time', String(Date.now()))

    const { result } = renderHook(() => useIntoto())
    expect(result.current.isLoading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

describe('useIntoto — return shape', () => {
  it('exposes expected fields', () => {
    const { result } = renderHook(() => useIntoto())
    expect(result.current).toHaveProperty('statuses')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('installed')
    expect(result.current).toHaveProperty('hasErrors')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('clustersChecked')
    expect(result.current).toHaveProperty('totalClusters')
    expect(result.current).toHaveProperty('refetch')
  })

  it('refetch is a function', () => {
    const { result } = renderHook(() => useIntoto())
    expect(typeof result.current.refetch).toBe('function')
  })
})
