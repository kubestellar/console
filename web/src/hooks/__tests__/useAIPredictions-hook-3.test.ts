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

  it('cleans up polling interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useAIPredictions())
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('aborts in-flight analyze requests on unmount without setState warnings', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    let analyzeSignal: AbortSignal | undefined
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/predictions/analyze') && opts?.method === 'POST') {
        analyzeSignal = opts.signal as AbortSignal | undefined
        return new Promise((_, reject) => {
          analyzeSignal?.addEventListener('abort', () => {
            const abortError = new Error('Aborted')
            abortError.name = 'AbortError'
            reject(abortError)
          }, { once: true })
        })
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

    const { result, unmount } = renderHook(() => useAIPredictions())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    act(() => {
      void result.current.analyze()
    })

    unmount()

    await act(async () => {
      await Promise.resolve()
    })

    expect(analyzeSignal?.aborted).toBe(true)
    expect(mockClearActiveTokenCategory).toHaveBeenCalledWith(expect.any(String))
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Can't perform a React state update on an unmounted component")
    )

    consoleErrorSpy.mockRestore()
  })

  it('removes settings change event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useAIPredictions())
    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'kubestellar-prediction-settings-changed',
      expect.any(Function)
    )
    removeEventListenerSpy.mockRestore()
  })

  it('filters fetched predictions by minConfidence setting', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)
    const HIGH_CONFIDENCE = 90
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: HIGH_CONFIDENCE })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [
          {
            id: 'low-conf', category: 'anomaly', severity: 'warning',
            name: 'low', cluster: 'c', reason: 'r', reasonDetailed: 'rd',
            confidence: 50, generatedAt: new Date().toISOString(), provider: 'claude',
          },
          {
            id: 'high-conf', category: 'anomaly', severity: 'warning',
            name: 'high', cluster: 'c', reason: 'r', reasonDetailed: 'rd',
            confidence: 95, generatedAt: new Date().toISOString(), provider: 'claude',
          },
        ],
        lastAnalyzed: new Date().toISOString(),
        providers: ['claude'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    // After fetch, predictions should be filtered: only 95-confidence kept
    await waitFor(() => {
      const filtered = result.current.predictions.filter(p => p.confidence! < HIGH_CONFIDENCE)
      expect(filtered.length).toBe(0)
    })
  })

  it('reconnect resets WS state and is safe to call', () => {
    const { result } = renderHook(() => useAIPredictions())
    // Should not throw even when no WS exists
    expect(() => {
      act(() => {
        result.current.reconnect()
      })
    }).not.toThrow()
  })

  it('analyze stops polling after max timeout', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    // Always return the same old timestamp so the poll never detects completion
    const STALE_TIMESTAMP = '2025-01-01T00:00:00Z'
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/predictions/analyze') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'started' }) })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          predictions: [],
          lastAnalyzed: STALE_TIMESTAMP,
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
      result.current.analyze()
    })

    // Advance past max timeout (ANALYSIS_MAX_TIMEOUT_MS = 60000)
    const MAX_TIMEOUT_PLUS_BUFFER_MS = 65000
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_PLUS_BUFFER_MS)
    })

    // Should have cleared the token category even without detecting new results
    expect(mockClearActiveTokenCategory).toHaveBeenCalled()
  })

})
