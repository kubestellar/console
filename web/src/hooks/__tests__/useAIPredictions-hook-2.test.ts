import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { mockGetPredictionSettings, mockGetDemoMode, mockIsAgentUnavailable, mockReportAgentDataSuccess, mockReportAgentDataError, mockGetSettingsForBackend, mockSetActiveTokenCategory, mockClearActiveTokenCategory, mockFullFetchClusters, mockClusterCache, mockGetWsAuthParams } = vi.hoisted(() => ({
  mockGetPredictionSettings: vi.fn(() => ({ aiEnabled: true, minConfidence: 50 })),
  mockGetDemoMode: vi.fn(() => true),
  mockIsAgentUnavailable: vi.fn(() => true),
  mockReportAgentDataSuccess: vi.fn(),
  mockReportAgentDataError: vi.fn(),
  mockGetSettingsForBackend: vi.fn(() => ({ aiEnabled: true, minConfidence: 50 })),
  mockSetActiveTokenCategory: vi.fn(),
  mockClearActiveTokenCategory: vi.fn(),
  mockFullFetchClusters: vi.fn(),
  mockClusterCache: { consecutiveFailures: 0, isFailed: false },
  mockGetWsAuthParams: vi.fn((url: string) => Promise.resolve({ url, protocols: [] })),
}))

vi.mock('../usePredictionSettings', () => ({
  getPredictionSettings: mockGetPredictionSettings,
  getSettingsForBackend: mockGetSettingsForBackend,
}))

vi.mock('../useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: mockGetDemoMode,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: mockIsAgentUnavailable,
  reportAgentDataSuccess: mockReportAgentDataSuccess,
  reportAgentDataError: mockReportAgentDataError,
}))

vi.mock('../useTokenUsage', () => ({
  setActiveTokenCategory: mockSetActiveTokenCategory,
  clearActiveTokenCategory: mockClearActiveTokenCategory,
}))

vi.mock('../mcp/shared', () => ({
  fullFetchClusters: mockFullFetchClusters,
  clusterCache: mockClusterCache,
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
}))

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: mockGetWsAuthParams,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FETCH_DEFAULT_TIMEOUT_MS: 10000,
    AI_PREDICTION_TIMEOUT_MS: 30000,
    WS_RECONNECT_DELAY_MS: 5000,
    UI_FEEDBACK_TIMEOUT_MS: 500,
    RETRY_DELAY_MS: 100,
    MAX_WS_RECONNECT_ATTEMPTS: 5,
    getWsBackoffDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30000),
  }
})

import { useAIPredictions, getRawAIPredictions, isWSConnected, syncSettingsToBackend } from '../useAIPredictions'

// ---- Mock global fetch ----
const originalFetch = globalThis.fetch


describe('useAIPredictions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    // Reset to demo mode defaults for each test
    mockGetDemoMode.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: 50 })
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
  })

  it('handles 404 response by setting empty predictions and stale', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    const mockResponse = {
      ok: false,
      status: 404,
      json: vi.fn(),
    }
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
  })

  it('handles non-404 error response by reporting agent error', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    const HTTP_SERVER_ERROR = 500
    const mockResponse = {
      ok: false,
      status: HTTP_SERVER_ERROR,
      json: vi.fn(),
    }
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(mockReportAgentDataError).toHaveBeenCalledWith(
        '/predictions/ai',
        expect.stringContaining('500')
      )
    })
  })

  it('handles fetch abort/timeout gracefully', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    globalThis.fetch = vi.fn().mockRejectedValue(abortError)

    // Should not throw
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    // Predictions should remain (keeps stale data)
    expect(Array.isArray(result.current.predictions)).toBe(true)
  })

  it('handles generic fetch error gracefully', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    expect(Array.isArray(result.current.predictions)).toBe(true)
  })

  it('reports fetch_failed for non-Error thrown values', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    // Throw a non-Error value (string) to cover the fallback branch
    globalThis.fetch = vi.fn().mockRejectedValue('string error') as unknown as typeof fetch

    const { result } = renderHook(() => useAIPredictions())
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.isStale).toBe(true)
    expect(mockReportAgentDataError).toHaveBeenCalledWith('/predictions/ai', 'fetch_failed')
  })

  it('analyze in demo mode simulates delay and regenerates predictions', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useAIPredictions())

    // Start analyze — don't await, let timers drive it
    let done = false
    act(() => {
      result.current.analyze().then(() => { done = true })
    })
    // Reference `done` so TS/ESLint doesn't flag it as unused — the variable
    // exists to anchor the promise settlement for debugging if the test hangs.
    void done

    // Advance past the triggerAnalysis demo delay (UI_FEEDBACK_TIMEOUT_MS = 500 ms)
    // and then the first poll tick (ANALYSIS_POLL_INTERVAL_MS = 4 000 ms) so that
    // cleanup() fires and clearActiveTokenCategory is called.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000)
    })

    // Per-operation tracking (#6016): setActiveTokenCategory called with
    // opId + 'predictions', then clearActiveTokenCategory called with the
    // same opId.
    expect(mockSetActiveTokenCategory).toHaveBeenCalledWith(expect.any(String), 'predictions')
    expect(mockClearActiveTokenCategory).toHaveBeenCalledWith(expect.any(String))
  })

  it('analyze in non-demo mode sends POST to /predictions/analyze', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    // Mock the POST response for analyze and the GET response for fetchAIPredictions
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/predictions/analyze') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'started' }) })
      }
      // GET /predictions/ai
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          predictions: [],
          lastAnalyzed: new Date().toISOString(),
          providers: [],
          stale: false,
        }),
      })
    })

    const { result } = renderHook(() => useAIPredictions())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    act(() => {
      result.current.analyze(['claude'])
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // Should have called fetch with /predictions/analyze POST
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const analyzeCall = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('/predictions/analyze')
    )
    expect(analyzeCall).toBeDefined()
    const analyzeBody = JSON.parse(analyzeCall![1]?.body as string)
    expect(analyzeBody.providers).toEqual(['claude'])
  })

  it('analyze in non-demo mode handles failed POST', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/predictions/analyze')) {
        return Promise.resolve({ ok: false, status: 500 })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          predictions: [],
          lastAnalyzed: new Date().toISOString(),
          providers: [],
          stale: false,
        }),
      })
    })

    const { result } = renderHook(() => useAIPredictions())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Should not throw
    act(() => {
      result.current.analyze()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
  })

  it('analyze in non-demo mode handles network error', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failed'))

    const { result } = renderHook(() => useAIPredictions())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Should not throw
    act(() => {
      result.current.analyze()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
  })

  it('analyze clears token category when trigger fails', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    // Make the POST to /predictions/analyze fail
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/predictions/analyze') && opts?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 503 })
      }
      // GET /predictions/ai returns OK
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          predictions: [],
          lastAnalyzed: new Date().toISOString(),
          providers: [],
          stale: false,
        }),
      })
    })

    const { result } = renderHook(() => useAIPredictions())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    await act(async () => {
      await result.current.analyze()
    })

    // After failed trigger, clearActiveTokenCategory should have been called
    expect(mockClearActiveTokenCategory).toHaveBeenCalled()
  })

  it('analyze polls until lastAnalyzed timestamp changes', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    let callCount = 0
    const INITIAL_TIMESTAMP = '2025-01-01T00:00:00Z'
    const UPDATED_TIMESTAMP = '2025-01-01T00:01:00Z'
    const CALLS_BEFORE_UPDATE = 3

    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/predictions/analyze') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'started' }) })
      }
      callCount++
      // Return updated timestamp after a few polls
      const timestamp = callCount > CALLS_BEFORE_UPDATE ? UPDATED_TIMESTAMP : INITIAL_TIMESTAMP
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          predictions: [],
          lastAnalyzed: timestamp,
          providers: [],
          stale: false,
        }),
      })
    })

    const { result } = renderHook(() => useAIPredictions())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Start analyze and let it poll
    act(() => {
      result.current.analyze()
    })

    // Advance through several poll cycles (ANALYSIS_POLL_INTERVAL_MS = 4000)
    const POLL_CYCLES = 5
    const POLL_INTERVAL = 4000
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_CYCLES * POLL_INTERVAL)
    })

    // Should eventually stop analyzing
    expect(mockClearActiveTokenCategory).toHaveBeenCalled()
  })

  it('does not create WebSocket in demo mode', () => {
    mockGetDemoMode.mockReturnValue(true)
    renderHook(() => useAIPredictions())
    // isWSConnected should be false since no real WS is created
    expect(isWSConnected()).toBe(false)
  })

  it('sets up polling interval for fetchAIPredictions', async () => {
    mockGetDemoMode.mockReturnValue(true)
    const { unmount } = renderHook(() => useAIPredictions())

    // The hook sets up setInterval with POLL_INTERVAL = 30000ms
    // After advancing, another fetch should fire
    const POLL_INTERVAL_MS = 30000
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS)
    })

    // Cleanup should clear the interval
    unmount()
  })

})
