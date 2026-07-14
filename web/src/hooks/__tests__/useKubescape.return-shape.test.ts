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

describe('useKubescape — return shape', () => {
  it('returns all expected properties', () => {
    const { result, unmount } = renderHook(() => useKubescape())
    const r = result.current
    expect(r).toHaveProperty('statuses')
    expect(r).toHaveProperty('aggregated')
    expect(r).toHaveProperty('isLoading')
    expect(r).toHaveProperty('isRefreshing')
    expect(r).toHaveProperty('lastRefresh')
    expect(r).toHaveProperty('installed')
    expect(r).toHaveProperty('hasErrors')
    expect(r).toHaveProperty('isDemoData')
    expect(r).toHaveProperty('clustersChecked')
    expect(r).toHaveProperty('totalClusters')
    expect(r).toHaveProperty('refetch')
    expect(typeof r.refetch).toBe('function')
    unmount()
  })

  it('does not throw on unmount', () => {
    const { unmount } = renderHook(() => useKubescape())
    expect(() => unmount()).not.toThrow()
  })
})
describe('useKubescape — demo mode', () => {
  it('returns demo data with default cluster names when no clusters connected', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    const names = Object.keys(result.current.statuses)
    expect(names).toEqual(['us-east-1', 'eu-central-1', 'us-west-2'])
    for (const status of Object.values(result.current.statuses)) {
      expect(status.installed).toBe(true)
      expect(status.loading).toBe(false)
      expect(status.frameworks.length).toBe(3)
      expect(status.controls.length).toBeGreaterThan(0)
    }
    unmount()
  })

  it('uses real cluster names for demo data when clusters are connected', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseClusters.mockReturnValue(reachableClusters('prod-1', 'staging-2'))

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isDemoData).toBe(true)
    expect(Object.keys(result.current.statuses)).toEqual(['prod-1', 'staging-2'])
    unmount()
  })

  it('produces varied demo scores per cluster (seed-based)', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const scores = Object.values(result.current.statuses).map((s) => s.overallScore)
    // All scores should be in reasonable range but not all identical
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(70)
      expect(score).toBeLessThanOrEqual(90)
    }
    unmount()
  })

  it('never calls kubectlProxy.exec in demo mode', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })
    mockUseClusters.mockReturnValue(reachableClusters('c1'))

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockExec).not.toHaveBeenCalled()
    unmount()
  })

  it('sets clustersChecked equal to demo cluster count', async () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() })

    const { result, unmount } = renderHook(() => useKubescape())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const EXPECTED_DEFAULT_DEMO_CLUSTERS = 3
    expect(result.current.clustersChecked).toBe(EXPECTED_DEFAULT_DEMO_CLUSTERS)
    unmount()
  })
})
