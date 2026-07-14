import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Increase test timeout for hooks with async retry/backoff logic
vi.setConfig({ testTimeout: 15_000 })

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseClusters = vi.fn(() => ({
  deduplicatedClusters: [] as Array<{ name: string; reachable: boolean }>,
  clusters: [] as Array<{ name: string; reachable: boolean }>,
  isLoading: false,
}))

vi.mock('../useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
}))

const mockExec = vi.fn()
vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockExec(...args) },
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10_000 }
})

const mockUseDemoMode = vi.fn(() => ({
  isDemoMode: false,
  toggleDemoMode: vi.fn(),
  setDemoMode: vi.fn(),
}))

vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  useDemoMode: (...args: unknown[]) => mockUseDemoMode(...args),
  getDemoMode: vi.fn(() => false),
}
))

const mockRegisterRefetch = vi.fn(() => vi.fn())
const mockRegisterCacheReset = vi.fn()
const mockUnregisterCacheReset = vi.fn()

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: (...args: unknown[]) => mockRegisterRefetch(...args),
  registerCacheReset: (...args: unknown[]) => mockRegisterCacheReset(...args),
  unregisterCacheReset: (...args: unknown[]) => mockUnregisterCacheReset(...args),
}))

vi.mock('../../lib/utils/concurrency', () => ({
  settledWithConcurrency: vi.fn(async (tasks: Array<() => Promise<unknown>>) =>
    Promise.allSettled(tasks.map((t) => t()))
  ),
}))

import { useKubescape } from '../useKubescape'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a workloadconfigurationscansummaries JSON response */
function makeScanSummaryResponse(items: Array<{
  name: string; namespace: string;
  critical?: number; high?: number; medium?: number; low?: number;
}>) {
  return {
    output: JSON.stringify({
      items: items.map((i) => ({
        metadata: { name: i.name, namespace: i.namespace },
        spec: {
          severities: {
            critical: i.critical ?? 0,
            high: i.high ?? 0,
            medium: i.medium ?? 0,
            low: i.low ?? 0,
          },
        },
      })),
    }),
    exitCode: 0,
  }
}

/** Builds a workloadconfigurationscans (detail) JSON response */
function makeDetailResponse(items: Array<{
  name: string; namespace: string;
  controls: Record<string, { status: string; name?: string }>;
}>) {
  return {
    output: JSON.stringify({
      items: items.map((i) => ({
        metadata: { name: i.name, namespace: i.namespace },
        spec: {
          controls: Object.fromEntries(
            Object.entries(i.controls).map(([id, ctrl]) => [
              id,
              { status: { status: ctrl.status }, name: ctrl.name ?? id },
            ])
          ),
        },
      })),
    }),
    exitCode: 0,
  }
}

function reachableClusters(...names: string[]) {
  const entries = names.map((n) => ({ name: n, reachable: true }))
  return { deduplicatedClusters: entries, clusters: entries, isLoading: false }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseDemoMode.mockReturnValue({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
  mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })
  mockExec.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

// ==========================================================================
// Return shape & basic contract
// ==========================================================================

describe('useKubescape — cache', () => {
  it('saves completed statuses to localStorage after fetch', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('cached'))

    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      .mockResolvedValueOnce(makeScanSummaryResponse([{ name: 'x', namespace: 'ns' }]))
      .mockResolvedValueOnce({ output: '{"items":[]}', exitCode: 0 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const cached = localStorage.getItem('kc-kubescape-cache')
    expect(cached).not.toBeNull()
    const parsed = JSON.parse(cached!)
    expect(parsed).toHaveProperty('cached')
    expect(parsed['cached'].cluster).toBe('cached')

    const cacheTime = localStorage.getItem('kc-kubescape-cache-time')
    expect(cacheTime).not.toBeNull()
    unmount()
  })

  it('loads from cache on initialization', async () => {
    const cachedStatuses = {
      'cached-cluster': {
        cluster: 'cached-cluster',
        installed: true,
        loading: false,
        overallScore: 85,
        frameworks: [],
        totalControls: 10,
        passedControls: 8,
        failedControls: 2,
        controls: [],
      },
    }
    localStorage.setItem('kc-kubescape-cache', JSON.stringify(cachedStatuses))
    localStorage.setItem('kc-kubescape-cache-time', Date.now().toString())

    const { result, unmount } = renderHook(() => useKubescape())

    // Should have cached data immediately
    expect(result.current.statuses['cached-cluster']).toBeDefined()
    expect(result.current.statuses['cached-cluster'].overallScore).toBe(85)
    expect(result.current.lastRefresh).not.toBeNull()
    unmount()
  })

  it('handles corrupt cache JSON gracefully', async () => {
    localStorage.setItem('kc-kubescape-cache', 'not-valid{{{')
    localStorage.setItem('kc-kubescape-cache-time', '12345')

    const { result, unmount } = renderHook(() => useKubescape())
    // Corrupt cache should be ignored, hook starts fresh with no statuses
    expect(Object.keys(result.current.statuses)).toHaveLength(0)
    // With no clusters, isLoading resolves to false quickly
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
  })

  it('returns null when cache key is missing', () => {
    // No cache set at all
    const { result, unmount } = renderHook(() => useKubescape())
    expect(result.current.lastRefresh).toBeNull()
    unmount()
  })
})
describe('useKubescape — refetch', () => {
  it('refetch triggers a new data fetch', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('r1'))

    // Initial: not installed
    mockExec
      .mockResolvedValueOnce({ output: '', exitCode: 0 })
      .mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.installed).toBe(false)

    // Now install kubescape and refetch
    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      .mockResolvedValueOnce(makeScanSummaryResponse([{ name: 'a', namespace: 'ns' }]))
      .mockResolvedValueOnce({ output: '{"items":[]}', exitCode: 0 })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.installed).toBe(true)
    unmount()
  })

  it('refetch with empty clusters does nothing', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.refetch()
    })

    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('prevents concurrent refetch calls', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))

    let resolveExec: (value: unknown) => void
    const execPromise = new Promise((resolve) => {
      resolveExec = resolve
    })
    mockExec.mockReturnValue(execPromise)

    const { result, unmount } = renderHook(() => useKubescape())

    // First refetch starts (from useEffect)
    // Wait a tick for the effect to fire
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // Try to refetch again while first is in progress — should be a no-op
    const refetchPromise = act(async () => {
      await result.current.refetch()
    })

    // Resolve the exec to unblock
    resolveExec!({ output: '', exitCode: 1 })

    // Also need second CRD check call
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    await refetchPromise

    unmount()
  })
})
describe('useKubescape — mode transition', () => {
  it('registers cache reset and refetch callbacks', () => {
    const { unmount } = renderHook(() => useKubescape())

    expect(mockRegisterCacheReset).toHaveBeenCalledWith('kubescape', expect.any(Function))
    expect(mockRegisterRefetch).toHaveBeenCalledWith('kubescape', expect.any(Function))
    unmount()
  })

  it('unregisters on unmount', () => {
    const mockUnregisterRefetch = vi.fn()
    mockRegisterRefetch.mockReturnValue(mockUnregisterRefetch)

    const { unmount } = renderHook(() => useKubescape())
    unmount()

    expect(mockUnregisterCacheReset).toHaveBeenCalledWith('kubescape')
    expect(mockUnregisterRefetch).toHaveBeenCalled()
  })

  it('cache reset callback clears localStorage and resets state', async () => {
    // Pre-populate cache
    localStorage.setItem('kc-kubescape-cache', '{}')
    localStorage.setItem('kc-kubescape-cache-time', '1234')

    const { unmount } = renderHook(() => useKubescape())

    // Get the reset callback that was registered
    const resetFn = mockRegisterCacheReset.mock.calls[0][1]
    act(() => {
      resetFn()
    })

    expect(localStorage.getItem('kc-kubescape-cache')).toBeNull()
    expect(localStorage.getItem('kc-kubescape-cache-time')).toBeNull()
    unmount()
  })
})
describe('useKubescape — auto-refresh', () => {
  it('sets up auto-refresh interval when clusters exist', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const kubescapeIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(kubescapeIntervals.length).toBeGreaterThan(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('does not set up interval in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const kubescapeIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(kubescapeIntervals).toHaveLength(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('does not set up interval when no clusters', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const kubescapeIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(kubescapeIntervals).toHaveLength(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('clears interval on unmount', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()

    clearIntervalSpy.mockRestore()
  })
})
describe('useKubescape — edge cases', () => {
  it('handles empty scan summary items', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('empty'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'api-resources') {
        return {
          output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
          exitCode: 0,
        }
      }
      // Both scan summaries and details return empty items
      return { output: JSON.stringify({ items: [] }), exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['empty']
    expect(status.installed).toBe(true)
    expect(status.overallScore).toBe(0)
    expect(status.totalControls).toBe(0)
    expect(status.frameworks).toEqual([])
    unmount()
  })

  it('handles scan summary with missing severities', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('sparse'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'api-resources') {
        return {
          output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
          exitCode: 0,
        }
      }
      if (args.includes('workloadconfigurationscansummaries')) {
        return {
          output: JSON.stringify({
            items: [{ metadata: { name: 'x', namespace: 'ns' }, spec: {} }],
          }),
          exitCode: 0,
        }
      }
      // Detail returns empty
      return { output: '{"items":[]}', exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['sparse']
    expect(status.installed).toBe(true)
    // With no severities, failedControls=0, totalControls=1 (each item +1)
    expect(status.totalControls).toBe(1)
    expect(status.passedControls).toBe(1)
    unmount()
  })

  it('handles detail scan with controls missing status/name', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('partial'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'api-resources') {
        return {
          output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
          exitCode: 0,
        }
      }
      if (args.includes('workloadconfigurationscansummaries')) {
        return makeScanSummaryResponse([{ name: 'w', namespace: 'ns' }])
      }
      if (args.includes('workloadconfigurationscans')) {
        return {
          output: JSON.stringify({
            items: [
              {
                metadata: { name: 'w', namespace: 'ns' },
                spec: {
                  controls: {
                    'C-001': { status: {}, name: undefined },
                    'C-002': {},
                  },
                },
              },
            ],
          }),
          exitCode: 0,
        }
      }
      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['partial']
    expect(status.controls.length).toBe(2)
    // Without 'passed' status, both default to failed
    expect(status.failedControls).toBe(2)
    unmount()
  })

  it('handles multiple clusters with mixed install status', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('installed', 'bare'))

    mockExec.mockImplementation(async (args: string[], opts?: { context?: string }) => {
      const cluster = opts?.context

      if (cluster === 'installed') {
        if (args[0] === 'api-resources') {
          return {
            output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
            exitCode: 0,
          }
        }
        if (args.includes('workloadconfigurationscansummaries')) {
          return makeScanSummaryResponse([{ name: 'w', namespace: 'ns', critical: 1 }])
        }
        return { output: '{"items":[]}', exitCode: 0 }
      }

      // bare cluster — api-resources has nothing, CRD check fails
      if (args[0] === 'api-resources') {
        return { output: '', exitCode: 0 }
      }
      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.statuses['installed'].installed).toBe(true)
    expect(result.current.statuses['bare'].installed).toBe(false)
    // installed should be true because at least one cluster has it
    expect(result.current.installed).toBe(true)
    unmount()
  })

  it('returns overallScore 0 when totalControls is 0', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('zero'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'api-resources') {
        return {
          output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
          exitCode: 0,
        }
      }
      return { output: JSON.stringify({ items: [] }), exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.statuses['zero'].overallScore).toBe(0)
    unmount()
  })

  it('generates framework scores from overall when no detailed data', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('fw'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'api-resources') {
        return {
          output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
          exitCode: 0,
        }
      }
      if (args.includes('workloadconfigurationscansummaries')) {
        return makeScanSummaryResponse([
          { name: 'w1', namespace: 'ns', critical: 1, high: 2 },
          { name: 'w2', namespace: 'ns', critical: 0, high: 1 },
        ])
      }
      // Detail fetch fails
      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['fw']
    expect(status.frameworks.length).toBe(3)
    expect(status.frameworks.map((f) => f.name)).toEqual([
      'NSA-CISA',
      'MITRE ATT&CK',
      'CIS Benchmark',
    ])
    // NSA-CISA should be overallScore + 4
    expect(status.frameworks[0].score).toBe(Math.min(100, status.overallScore + 4))
    // MITRE should be overallScore - 3
    expect(status.frameworks[1].score).toBe(Math.max(0, status.overallScore - 3))
    unmount()
  })
})
