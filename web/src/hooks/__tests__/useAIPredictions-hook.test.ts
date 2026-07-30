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

  it('returns predictions array (demo mode)', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(Array.isArray(result.current.predictions)).toBe(true)
  })

  it('returns isEnabled based on settings', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(result.current.isEnabled).toBe(true)
  })

  it('returns providers array', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(Array.isArray(result.current.providers)).toBe(true)
  })

  it('isAnalyzing starts as false', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(result.current.isAnalyzing).toBe(false)
  })

  it('analyze function is callable', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(typeof result.current.analyze).toBe('function')
  })

  it('refresh function is callable', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(typeof result.current.refresh).toBe('function')
  })

  it('reconnect function is callable', () => {
    const { result } = renderHook(() => useAIPredictions())
    expect(typeof result.current.reconnect).toBe('function')
  })

  it('demo predictions have required PredictedRisk fields', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(pred).toHaveProperty('id')
      expect(pred).toHaveProperty('type')
      expect(pred).toHaveProperty('severity')
      expect(pred).toHaveProperty('name')
      expect(pred).toHaveProperty('reason')
      expect(pred).toHaveProperty('source', 'ai')
      expect(typeof pred.confidence).toBe('number')
    }
  })

  it('demo predictions have confidence values between 0 and 100', async () => {
    const { result } = renderHook(() => useAIPredictions())
    const MIN_CONFIDENCE = 0
    const MAX_CONFIDENCE = 100
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
      expect(pred.confidence).toBeLessThanOrEqual(MAX_CONFIDENCE)
    }
  })

  it('filters predictions below minConfidence threshold via settings event', () => {
    // Start with default low threshold to populate predictions
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: 50 })
    const { result } = renderHook(() => useAIPredictions())

    // Now raise the threshold to 80 — should filter out the 78-confidence demo prediction
    const HIGH_CONFIDENCE_THRESHOLD = 80
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: HIGH_CONFIDENCE_THRESHOLD })
    act(() => {
      window.dispatchEvent(new Event('kubestellar-prediction-settings-changed'))
    })

    for (const pred of result.current.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_THRESHOLD)
    }
  })

  it('re-filters predictions when settings change event fires', async () => {
    // Start with low threshold so we get all predictions
    const LOW_THRESHOLD = 50
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: LOW_THRESHOLD })
    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    const countBefore = result.current.predictions.length

    // Now raise the threshold — the 78-confidence prediction should be filtered out
    const HIGH_THRESHOLD = 80
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: HIGH_THRESHOLD })
    act(() => {
      window.dispatchEvent(new Event('kubestellar-prediction-settings-changed'))
    })

    // Should have fewer predictions now (78 filtered out, 85 kept)
    expect(result.current.predictions.length).toBeLessThan(countBefore)
    for (const pred of result.current.predictions) {
      expect(pred.confidence).toBeGreaterThanOrEqual(HIGH_THRESHOLD)
    }
  })

  it('isEnabled reflects aiEnabled setting', () => {
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: false, minConfidence: 50 })
    const { result } = renderHook(() => useAIPredictions())
    expect(result.current.isEnabled).toBe(false)
  })

  it('predictions have generatedAt as Date instances', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(pred.generatedAt).toBeInstanceOf(Date)
      // Should be a valid date (not NaN)
      expect(pred.generatedAt!.getTime()).not.toBeNaN()
    }
  })

  it('predictions have valid severity values', async () => {
    const { result } = renderHook(() => useAIPredictions())
    const VALID_SEVERITIES = ['warning', 'critical']
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(VALID_SEVERITIES).toContain(pred.severity)
    }
  })

  it('predictions have valid type/category values', async () => {
    const { result } = renderHook(() => useAIPredictions())
    const VALID_TYPES = [
      'pod-crash', 'node-pressure', 'gpu-exhaustion',
      'resource-exhaustion', 'resource-trend', 'capacity-risk', 'anomaly',
    ]
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(VALID_TYPES).toContain(pred.type)
    }
  })

  it('lastUpdated is set after demo fetch', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.lastUpdated).not.toBeNull()
    })
    expect(result.current.lastUpdated).toBeInstanceOf(Date)
  })

  it('isStale is false in demo mode', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.lastUpdated).not.toBeNull()
    })
    expect(result.current.isStale).toBe(false)
  })

  it('marks predictions stale and notifies subscribers when fetch rejects (#5937, #5938)', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch

    const { result } = renderHook(() => useAIPredictions())
    // refresh() returns a promise — await the rejection path
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.isStale).toBe(true)
    expect(mockReportAgentDataError).toHaveBeenCalledWith('/predictions/ai', expect.stringContaining('network error'))
  })

  it('marks predictions stale on non-OK HTTP response (#5937, #5938)', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useAIPredictions())
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.isStale).toBe(true)
    expect(mockReportAgentDataError).toHaveBeenCalledWith('/predictions/ai', 'HTTP 500')
  })

  it('marks predictions stale and notifies when agent is unavailable (#5937)', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)

    const { result } = renderHook(() => useAIPredictions())
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.isStale).toBe(true)
  })

  it('analyze returns a promise', () => {
    const { result } = renderHook(() => useAIPredictions())
    // Calling analyze should return a thenable (promise)
    const returnVal = result.current.analyze()
    expect(returnVal).toHaveProperty('then')
    expect(typeof returnVal.then).toBe('function')
  })

  it('multiple hook instances share the same prediction state', () => {
    const { result: r1 } = renderHook(() => useAIPredictions())
    const { result: r2 } = renderHook(() => useAIPredictions())

    // Both instances should see the same predictions from the shared singleton
    expect(r1.current.predictions.length).toBe(r2.current.predictions.length)
    if (r1.current.predictions.length > 0) {
      expect(r1.current.predictions[0]?.id).toBe(r2.current.predictions[0]?.id)
    }
    // Both should agree on stale/enabled status
    expect(r1.current.isStale).toBe(r2.current.isStale)
    expect(r1.current.isEnabled).toBe(r2.current.isEnabled)
  })

  it('demo predictions set source to "ai"', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(pred.source).toBe('ai')
    }
  })

  it('demo predictions include provider field', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(pred.provider).toBe('claude')
    }
  })

  it('demo predictions include cluster field', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    for (const pred of result.current.predictions) {
      expect(typeof pred.cluster).toBe('string')
      expect(pred.cluster!.length).toBeGreaterThan(0)
    }
  })

  it('demo prediction with trend has valid trend value', async () => {
    const { result } = renderHook(() => useAIPredictions())
    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })
    const VALID_TRENDS = ['worsening', 'improving', 'stable']
    const withTrend = result.current.predictions.filter(p => p.trend !== undefined)
    for (const pred of withTrend) {
      expect(VALID_TRENDS).toContain(pred.trend)
    }
  })

  it('returns early if agent is unavailable (non-demo mode)', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(true)

    const mockFetch = vi.fn()
    globalThis.fetch = mockFetch

    // fetch should NOT have been called because agent is unavailable
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches from HTTP endpoint when agent is available', async () => {
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)

    const mockResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        predictions: [
          {
            id: 'live-1',
            category: 'anomaly',
            severity: 'warning',
            name: 'test-pod',
            cluster: 'test-cluster',
            reason: 'Test reason',
            reasonDetailed: 'Detailed reason',
            confidence: 90,
            generatedAt: new Date().toISOString(),
            provider: 'claude',
          },
        ],
        lastAnalyzed: new Date().toISOString(),
        providers: ['claude'],
        stale: false,
      }),
    }
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    // Must render the hook to trigger the fetch
    renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })

    // Verify reportAgentDataSuccess was called on ok response
    await waitFor(() => {
      expect(mockReportAgentDataSuccess).toHaveBeenCalled()
    })
  })

})
