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

import { useTrivy } from '../useTrivy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a VulnerabilityReport list response */
function makeVulnReportResponse(
  items: Array<{
    name: string
    namespace: string
    repo?: string
    tag?: string
    critical?: number
    high?: number
    medium?: number
    low?: number
    unknown?: number
  }>
) {
  return {
    output: JSON.stringify({
      items: items.map((i) => ({
        metadata: { name: i.name, namespace: i.namespace },
        report: {
          artifact: { repository: i.repo ?? i.name, tag: i.tag ?? 'latest' },
          summary: {
            criticalCount: i.critical ?? 0,
            highCount: i.high ?? 0,
            mediumCount: i.medium ?? 0,
            lowCount: i.low ?? 0,
            unknownCount: i.unknown ?? 0,
          },
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


describe('useTrivy — mode transition', () => {
  it('registers cache reset and refetch callbacks', () => {
    const { unmount } = renderHook(() => useTrivy())

    expect(mockRegisterCacheReset).toHaveBeenCalledWith('trivy', expect.any(Function))
    expect(mockRegisterRefetch).toHaveBeenCalledWith('trivy', expect.any(Function))
    unmount()
  })

  it('unregisters on unmount', () => {
    const mockUnregisterRefetch = vi.fn()
    mockRegisterRefetch.mockReturnValue(mockUnregisterRefetch)

    const { unmount } = renderHook(() => useTrivy())
    unmount()

    expect(mockUnregisterCacheReset).toHaveBeenCalledWith('trivy')
    expect(mockUnregisterRefetch).toHaveBeenCalled()
  })

  it('cache reset callback clears localStorage and resets state', async () => {
    localStorage.setItem('kc-trivy-cache', '{}')
    localStorage.setItem('kc-trivy-cache-time', '1234')

    const { unmount } = renderHook(() => useTrivy())

    const resetFn = mockRegisterCacheReset.mock.calls[0][1]
    act(() => {
      resetFn()
    })

    expect(localStorage.getItem('kc-trivy-cache')).toBeNull()
    expect(localStorage.getItem('kc-trivy-cache-time')).toBeNull()
    unmount()
  })
})

describe('useTrivy — auto-refresh', () => {
  it('sets up auto-refresh interval when clusters exist', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const trivyIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(trivyIntervals.length).toBeGreaterThan(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('does not set up interval in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const trivyIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(trivyIntervals).toHaveLength(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('does not set up interval when no clusters', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const REFRESH_INTERVAL_MS = 120_000
    const trivyIntervals = setIntervalSpy.mock.calls.filter(
      (call) => call[1] === REFRESH_INTERVAL_MS
    )
    expect(trivyIntervals).toHaveLength(0)

    setIntervalSpy.mockRestore()
    unmount()
  })

  it('clears interval on unmount', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1'))
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()

    clearIntervalSpy.mockRestore()
  })
})

describe('useTrivy — edge cases', () => {
  it('handles empty vulnerability report items', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('empty'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return { output: JSON.stringify({ items: [] }), exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['empty']
    expect(status.installed).toBe(true)
    expect(status.totalReports).toBe(0)
    expect(status.scannedImages).toBe(0)
    expect(status.images).toEqual([])
    expect(status.vulnerabilities.critical).toBe(0)
    unmount()
  })

  it('handles reports with missing artifact info', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-artifact'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1', namespace: 'default' },
              report: {
                summary: { criticalCount: 1, highCount: 2, mediumCount: 3, lowCount: 4, unknownCount: 0 },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-artifact']
    expect(status.totalReports).toBe(1)
    // No repo => not counted as image, but summary still aggregated
    expect(status.scannedImages).toBe(0)
    expect(status.vulnerabilities.critical).toBe(1)
    expect(status.images.length).toBe(0)
    unmount()
  })

  it('handles reports with missing summary', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-summary'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1', namespace: 'ns' },
              report: {
                artifact: { repository: 'myapp', tag: 'v1' },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-summary']
    expect(status.totalReports).toBe(1)
    expect(status.scannedImages).toBe(1)
    // No summary => no vuln counts added
    expect(status.vulnerabilities.critical).toBe(0)
    // Image report still added but with zero counts
    expect(status.images.length).toBe(1)
    expect(status.images[0].critical).toBe(0)
    unmount()
  })

  it('handles reports with missing namespace', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-ns'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1' },
              report: {
                artifact: { repository: 'myapp', tag: 'v1' },
                summary: { criticalCount: 1, highCount: 0, mediumCount: 0, lowCount: 0 },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-ns']
    // Should default namespace to 'default'
    expect(status.images[0].namespace).toBe('default')
    unmount()
  })

  it('handles reports with missing tag', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('no-tag'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) return { output: 'crd-ok', exitCode: 0 }
      return {
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'v1', namespace: 'ns' },
              report: {
                artifact: { repository: 'myapp' },
                summary: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
              },
            },
          ],
        }),
        exitCode: 0,
      }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['no-tag']
    // Should default tag to 'latest'
    expect(status.images[0].tag).toBe('latest')
    unmount()
  })

  it('handles multiple clusters with mixed install status', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('installed', 'bare'))

    mockExec.mockImplementation(async (args: string[], opts?: { context?: string }) => {
      const cluster = opts?.context

      if (cluster === 'installed') {
        if (args.includes('crd')) {
          return { output: 'crd-ok', exitCode: 0 }
        }
        return makeVulnReportResponse([{ name: 'v', namespace: 'ns', critical: 2 }])
      }
      // bare cluster — CRD check fails
      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.statuses['installed'].installed).toBe(true)
    expect(result.current.statuses['bare'].installed).toBe(false)
    expect(result.current.installed).toBe(true)
    unmount()
  })

  it('handles null output on successful exit code', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('null-out'))

    mockExec.mockImplementation(async (args: string[]) => {
      if (args.includes('crd')) {
        return { output: 'crd-ok', exitCode: 0 }
      }
      return { output: null, exitCode: 0 }
    })

    const { result, unmount } = renderHook(() => useTrivy())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['null-out']
    expect(status.installed).toBe(true)
    expect(status.totalReports).toBe(0)
    expect(status.scannedImages).toBe(0)
    unmount()
  })
})
