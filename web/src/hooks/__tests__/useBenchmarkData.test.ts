/**
 * Tests for the useBenchmarkData hook (useCachedBenchmarkReports).
 *
 * Validates SSE streaming, cache fallback, demo data handling,
 * loading states, stream reset, and auth header forwarding.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { BenchmarkReport } from '../../lib/llmd/benchmarkMockData'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const STORAGE_KEY_TOKEN = 'token'

const mockCacheResult = vi.fn()

vi.mock('../mcp/shared', () => ({
    createCachedHook: vi.fn(),
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/cache', () => ({
    createCachedHook: vi.fn(),
  useCache: (opts: { fetcher: () => Promise<unknown> }) => {
    // Store fetcher so tests can call it
    latestFetcher = opts.fetcher
    return mockCacheResult()
  },
}))

vi.mock('../../lib/llmd/benchmarkMockData', () => ({
    createCachedHook: vi.fn(),
  generateBenchmarkReports: () => [{ id: 'demo-1', name: 'Demo Report' }],
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 30_000,
} })

let latestFetcher: (() => Promise<unknown>) | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(id: string): BenchmarkReport {
  return { id, name: `Report ${id}` } as unknown as BenchmarkReport
}

function defaultCacheResult(overrides: Record<string, unknown> = {}) {
  return {
    data: overrides.data ?? [],
    isLoading: overrides.isLoading ?? false,
    isDemoFallback: overrides.isDemoFallback ?? false,
    isRefreshing: overrides.isRefreshing ?? false,
    isFailed: overrides.isFailed ?? false,
    consecutiveFailures: overrides.consecutiveFailures ?? 0,
    ...overrides,
  }
}

/** Create a mock ReadableStream that yields SSE chunks */
function makeSSEStream(events: string[]) {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCachedBenchmarkReports', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
    latestFetcher = null

    mockCacheResult.mockReturnValue(defaultCacheResult())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---- Basic rendering ----

  it('returns expected shape from the hook', async () => {
    // Mock fetch to return a non-ok response so stream completes quickly
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isStreaming')
    expect(result.current).toHaveProperty('streamProgress')
    expect(result.current).toHaveProperty('streamStatus')
    expect(result.current).toHaveProperty('currentSince')
  })

  // ---- Falls back to cache data when no streamed data ----

  it('returns cache data when no streamed data is available', async () => {
    const cachedReports = [makeReport('cached-1')]
    mockCacheResult.mockReturnValue(defaultCacheResult({ data: cachedReports }))

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.data).toEqual(cachedReports)
  })

  // ---- Demo fallback ----

  it('sets isDemoFallback to true when cache indicates demo and not loading', async () => {
    mockCacheResult.mockReturnValue(defaultCacheResult({
      isDemoFallback: true,
      isLoading: false,
    }))

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(result.current.isDemoFallback).toBe(true)
    })
  })

  it('sets isDemoFallback to false when cache is still loading', async () => {
    mockCacheResult.mockReturnValue(defaultCacheResult({
      isDemoFallback: true,
      isLoading: true,
    }))

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    // isDemoFallback should be false during loading
    expect(result.current.isDemoFallback).toBe(false)
  })

  // ---- SSE streaming with batch events ----

  it('uses streamed data over cache data when stream returns batches', async () => {
    const batchData = [makeReport('streamed-1'), makeReport('streamed-2')]
    const stream = makeSSEStream([
      sseEvent('batch', batchData),
      sseEvent('done', {}),
    ])

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as unknown as Response)

    mockCacheResult.mockReturnValue(defaultCacheResult({
      data: [makeReport('cached-old')],
    }))

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(result.current.data.length).toBeGreaterThan(0)
    })
  })

  // ---- Auth headers ----

  it('sends Authorization header when token is present', async () => {
    localStorage.setItem(STORAGE_KEY_TOKEN, 'my-test-token')

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const headers = fetchCall[1]?.headers as Record<string, string>
    expect(headers?.Authorization).toBe('Bearer my-test-token')
  })

  it('does not send Authorization header when no token', async () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN)

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const headers = fetchCall[1]?.headers as Record<string, string>
    expect(headers?.Authorization).toBeUndefined()
  })

  // ---- Stream URL includes since parameter ----

  it('includes since parameter in the stream URL', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const fetchCall = vi.mocked(global.fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain('/api/benchmarks/reports/stream')
    expect(url).toContain('since=')
  })

  // ---- Stream error handling ----

  it('handles stream error gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network failure'))

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    // Should not throw and should return valid structure
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isStreaming')
  })

  // ---- Non-ok response ----

  it('handles non-ok HTTP response from stream endpoint', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 503,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    // Falls back to cache data
    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })
  })

  // ---- resetBenchmarkStream ----

  it('exports resetBenchmarkStream and getBenchmarkStreamSince utilities', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const mod = await import('../useBenchmarkData')
    expect(typeof mod.resetBenchmarkStream).toBe('function')
    expect(typeof mod.getBenchmarkStreamSince).toBe('function')
  })

  // ---- Loading state ----

  it('isLoading is true when cache is loading and no streamed data', async () => {
    mockCacheResult.mockReturnValue(defaultCacheResult({ isLoading: true }))

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.isLoading).toBe(true)
  })

  // ---- Cache fetcher fallback endpoint ----

  it('cache fetcher calls non-streaming fallback endpoint', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    // The useCache fetcher should be available
    expect(latestFetcher).not.toBeNull()

    // Mock the fallback fetch
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ reports: [makeReport('fallback-1')] }),
    } as Response)

    const data = await latestFetcher!()
    expect(data).toEqual([makeReport('fallback-1')])
  })

  it('cache fetcher throws on 503 BENCHMARK_UNAVAILABLE', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    expect(latestFetcher).not.toBeNull()

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as Response)

    await expect(latestFetcher!()).rejects.toThrow('BENCHMARK_UNAVAILABLE')
  })

  // ---- Additional regression tests ----

  // ---- Cache fetcher throws on non-ok non-503 response ----
  it('cache fetcher throws on non-ok non-503 response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    expect(latestFetcher).not.toBeNull()

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response)

    await expect(latestFetcher!()).rejects.toThrow('Benchmark API error: 500')
  })

  // ---- Cache fetcher returns empty array when reports is missing ----
  it('cache fetcher returns empty array when reports field is missing', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    renderHook(() => useCachedBenchmarkReports())

    expect(latestFetcher).not.toBeNull()

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    } as Response)

    const data = await latestFetcher!()
    expect(data).toEqual([])
  })

  // ---- streamProgress reflects report count ----
  it('streamProgress starts at 0', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())
    expect(result.current.streamProgress).toBe(0)
  })

  // ---- isDemoFallback is false when streamed data exists ----
  it('isDemoFallback is false when streamed data exists even if cache says demo', async () => {
    const batchData = [makeReport('stream-1')]
    const stream = makeSSEStream([
      sseEvent('batch', batchData),
      sseEvent('done', {}),
    ])

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as unknown as Response)

    mockCacheResult.mockReturnValue(defaultCacheResult({
      isDemoFallback: true,
      isLoading: false,
    }))

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(result.current.data.length).toBe(1)
    })

    // When we have streamed data, isDemoFallback should be false
    expect(result.current.isDemoFallback).toBe(false)
  })

  // ---- getBenchmarkStreamSince returns current since ----
  it('getBenchmarkStreamSince returns current since value', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { getBenchmarkStreamSince } = await import('../useBenchmarkData')
    const since = getBenchmarkStreamSince()
    expect(typeof since).toBe('string')
  })

  // ---- resetBenchmarkStream re-starts stream ----
  it('resetBenchmarkStream clears data and starts new stream', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { resetBenchmarkStream, getBenchmarkStreamSince } = await import('../useBenchmarkData')

    // Reset with a new since value
    resetBenchmarkStream('30d')

    // The since should be updated
    expect(getBenchmarkStreamSince()).toBe('30d')

    // A new fetch should have been called
    expect(global.fetch).toHaveBeenCalled()
    const lastCall = vi.mocked(global.fetch).mock.calls[vi.mocked(global.fetch).mock.calls.length - 1]
    const url = lastCall[0] as string
    expect(url).toContain('since=30d')
  })

  // ---- Multiple batch events accumulate reports ----
  it('accumulates reports from multiple batch events', async () => {
    const batch1 = [makeReport('batch1-1'), makeReport('batch1-2')]
    const batch2 = [makeReport('batch2-1')]
    const stream = makeSSEStream([
      sseEvent('batch', batch1),
      sseEvent('batch', batch2),
      sseEvent('done', {}),
    ])

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as unknown as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    await waitFor(() => {
      expect(result.current.data.length).toBe(3)
    })
  })

  // ---- isRefreshing passthrough ----
  it('passes through isRefreshing from cache result', async () => {
    mockCacheResult.mockReturnValue(defaultCacheResult({ isRefreshing: true }))

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.isRefreshing).toBe(true)
  })

  // ---- isFailed passthrough ----
  it('passes through isFailed from cache result', async () => {
    mockCacheResult.mockReturnValue(defaultCacheResult({ isFailed: true, consecutiveFailures: 2 }))

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    } as Response)

    const { useCachedBenchmarkReports } = await import('../useBenchmarkData')
    const { result } = renderHook(() => useCachedBenchmarkReports())

    expect(result.current.isFailed).toBe(true)
    expect(result.current.consecutiveFailures).toBe(2)
  })
})
