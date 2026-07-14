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

describe('useKubescape — empty and loading states', () => {
  it('sets isLoading false when no clusters and not loading', async () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: false })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.totalClusters).toBe(0)
    expect(Object.keys(result.current.statuses)).toHaveLength(0)
    unmount()
  })

  it('keeps isLoading true while clusters are still resolving', () => {
    mockUseClusters.mockReturnValue({ deduplicatedClusters: [], clusters: [], isLoading: true })

    const { result, unmount } = renderHook(() => useKubescape())
    // When clustersLoading is true and no cache, isLoading should remain true
    expect(result.current.isLoading).toBe(true)
    unmount()
  })

  it('only includes reachable clusters', async () => {
    mockUseClusters.mockReturnValue({
      deduplicatedClusters: [
        { name: 'reachable-1', reachable: true },
        { name: 'unreachable-1', reachable: false },
      ],
      clusters: [
        { name: 'reachable-1', reachable: true },
        { name: 'unreachable-1', reachable: false },
      ],
      isLoading: false,
    })

    // Return "not installed" for the reachable cluster
    mockExec.mockResolvedValue({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.totalClusters).toBe(1)
    unmount()
  })
})
describe('useKubescape — live data fetch', () => {
  it('fetches scan data for a single installed cluster', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('prod'))

    // Phase 1: API resources check passes
    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      // Phase 2: scan summaries
      .mockResolvedValueOnce(
        makeScanSummaryResponse([
          { name: 'nginx', namespace: 'default', critical: 2, high: 3, medium: 1, low: 0 },
          { name: 'redis', namespace: 'cache', critical: 0, high: 1, medium: 0, low: 0 },
        ])
      )
      // Phase 3: detail scans
      .mockResolvedValueOnce(
        makeDetailResponse([
          {
            name: 'nginx-scan',
            namespace: 'default',
            controls: {
              'C-0034': { status: 'passed', name: 'Automatic mapping of service account' },
              'C-0017': { status: 'failed', name: 'Immutable container filesystem' },
            },
          },
        ])
      )

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.installed).toBe(true)
    expect(result.current.isDemoData).toBe(false)
    expect(result.current.totalClusters).toBe(1)

    const prodStatus = result.current.statuses['prod']
    expect(prodStatus).toBeDefined()
    expect(prodStatus.installed).toBe(true)
    expect(prodStatus.loading).toBe(false)
    expect(prodStatus.error).toBeUndefined()
    // With detailed scans, controls should be populated
    expect(prodStatus.controls.length).toBeGreaterThan(0)
    expect(prodStatus.frameworks.length).toBe(3) // NSA-CISA, MITRE, CIS
    unmount()
  })

  it('falls back to CRD check when API resource check fails', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('prod'))

    // Phase 1a: api-resources fails (no output match)
    mockExec
      .mockResolvedValueOnce({ output: 'some-other-resource', exitCode: 0 })
      // Phase 1b: CRD fallback succeeds
      .mockResolvedValueOnce({
        output: 'customresourcedefinition.apiextensions.k8s.io/workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      // Phase 2: scan summaries
      .mockResolvedValueOnce(
        makeScanSummaryResponse([{ name: 'app', namespace: 'ns', critical: 1 }])
      )
      // Phase 3: detail scans fail (no data)
      .mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.installed).toBe(true)
    const status = result.current.statuses['prod']
    expect(status.installed).toBe(true)
    expect(status.totalControls).toBeGreaterThan(0)
    unmount()
  })

  it('marks cluster as not installed when both API and CRD checks fail', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('bare'))

    // Phase 1a: api-resources check — no kubescape resources
    mockExec
      .mockResolvedValueOnce({ output: '', exitCode: 0 })
      // Phase 1b: CRD check fails
      .mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.installed).toBe(false)
    expect(result.current.statuses['bare'].installed).toBe(false)
    expect(result.current.statuses['bare'].overallScore).toBe(0)
    unmount()
  })

  it('handles scan fetch failure with error message', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('broken'))

    // Phase 1: API check passes
    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      // Phase 2: scan fetch fails
      .mockResolvedValueOnce({ output: 'forbidden: insufficient permissions', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['broken']
    expect(status.installed).toBe(true)
    expect(status.error).toBe('forbidden: insufficient permissions')
    expect(result.current.hasErrors).toBe(true)
    unmount()
  })

  it('handles scan fetch failure with default error when output is empty', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('empty-err'))

    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      .mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['empty-err']
    expect(status.error).toBe('Failed to fetch Kubescape scan data')
    unmount()
  })

  it('computes correct overall score from detailed control data', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('scored'))

    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      // Scan summaries
      .mockResolvedValueOnce(makeScanSummaryResponse([{ name: 'w1', namespace: 'ns' }]))
      // Detail: 3 controls — 2 pass-dominant, 1 fail-dominant => 67%
      .mockResolvedValueOnce(
        makeDetailResponse([
          {
            name: 'w1',
            namespace: 'ns',
            controls: {
              'C-001': { status: 'passed', name: 'Control A' },
              'C-002': { status: 'passed', name: 'Control B' },
              'C-003': { status: 'failed', name: 'Control C' },
            },
          },
        ])
      )

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['scored']
    const EXPECTED_TOTAL = 3
    const EXPECTED_PASSED = 2
    const EXPECTED_FAILED = 1
    const EXPECTED_SCORE = Math.round((EXPECTED_PASSED / EXPECTED_TOTAL) * 100)
    expect(status.totalControls).toBe(EXPECTED_TOTAL)
    expect(status.passedControls).toBe(EXPECTED_PASSED)
    expect(status.failedControls).toBe(EXPECTED_FAILED)
    expect(status.overallScore).toBe(EXPECTED_SCORE)
    unmount()
  })

  it('sorts controls by failed count descending', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('sorted'))

    mockExec
      .mockResolvedValueOnce({
        output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
        exitCode: 0,
      })
      .mockResolvedValueOnce(makeScanSummaryResponse([{ name: 'w', namespace: 'ns' }]))
      .mockResolvedValueOnce({
        output: JSON.stringify({
          items: [
            {
              metadata: { name: 'w', namespace: 'ns' },
              spec: {
                controls: {
                  'C-low': { status: { status: 'failed' }, name: 'Low fail' },
                  'C-high': { status: { status: 'failed' }, name: 'High fail' },
                },
              },
            },
            {
              metadata: { name: 'w2', namespace: 'ns' },
              spec: {
                controls: {
                  'C-low': { status: { status: 'passed' }, name: 'Low fail' },
                  'C-high': { status: { status: 'failed' }, name: 'High fail' },
                },
              },
            },
          ],
        }),
        exitCode: 0,
      })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const controls = result.current.statuses['sorted'].controls
    expect(controls.length).toBe(2)
    // C-high has 2 failed, C-low has 1 failed => C-high first
    expect(controls[0].id).toBe('C-high')
    expect(controls[0].failed).toBe(2)
    expect(controls[1].id).toBe('C-low')
    expect(controls[1].failed).toBe(1)
    unmount()
  })

  it('handles exception in fetchSingleCluster (non-demo error)', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('crash'))

    mockExec.mockRejectedValue(new Error('network timeout'))

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['crash']
    expect(status.installed).toBe(false)
    expect(status.error).toBe('network timeout')
    unmount()
  })

  it('handles non-Error exception in fetchSingleCluster', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('weird'))

    mockExec.mockRejectedValue('string error')

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const status = result.current.statuses['weird']
    expect(status.error).toBe('Connection failed')
    unmount()
  })

  it('suppresses console.error for demo mode errors', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('demo-err'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockExec.mockRejectedValue(new Error('demo mode'))

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // "demo mode" errors should not be logged
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
    unmount()
  })
})
describe('useKubescape — aggregation', () => {
  it('averages overallScore across installed clusters', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('c1', 'c2'))

    // Use args-based routing to handle parallel execution
    mockExec.mockImplementation(async (args: string[], opts?: { context?: string }) => {
      const cmd = args[0]
      const cluster = opts?.context

      // Phase 1: API resource check — both clusters have kubescape
      if (cmd === 'api-resources') {
        return {
          output: 'workloadconfigurationscansummaries.spdx.softwarecomposition.kubescape.io',
          exitCode: 0,
        }
      }

      // Phase 2: scan summaries — same for both
      if (args.includes('workloadconfigurationscansummaries')) {
        return makeScanSummaryResponse([{ name: 'w', namespace: 'ns' }])
      }

      // Phase 3: detail — c1 gets all passed (100%), c2 gets all failed (0%)
      if (args.includes('workloadconfigurationscans')) {
        const isFirst = cluster === 'c1'
        return makeDetailResponse([
          {
            name: 'w',
            namespace: 'ns',
            controls: {
              'C-1': { status: isFirst ? 'passed' : 'failed' },
              'C-2': { status: isFirst ? 'passed' : 'failed' },
            },
          },
        ])
      }

      return { output: '', exitCode: 1 }
    })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Average of 100 and 0 = 50
    const EXPECTED_AVG = 50
    expect(result.current.aggregated.overallScore).toBe(EXPECTED_AVG)
    unmount()
  })

  it('returns zero aggregated when no clusters are installed', async () => {
    mockUseClusters.mockReturnValue(reachableClusters('bare'))
    // Both checks fail => not installed
    mockExec
      .mockResolvedValueOnce({ output: '', exitCode: 0 })
      .mockResolvedValueOnce({ output: '', exitCode: 1 })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.aggregated.overallScore).toBe(0)
    expect(result.current.aggregated.frameworks).toEqual([])
    expect(result.current.aggregated.totalControls).toBe(0)
    unmount()
  })
})
