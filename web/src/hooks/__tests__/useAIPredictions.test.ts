import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { mockGetPredictionSettings, mockGetDemoMode, mockIsAgentUnavailable } = vi.hoisted(() => ({
  mockGetPredictionSettings: vi.fn(() => ({ aiEnabled: true, minConfidence: 50 })),
  mockGetDemoMode: vi.fn(() => true),
  mockIsAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../usePredictionSettings', () => ({
  getPredictionSettings: mockGetPredictionSettings,
  getSettingsForBackend: vi.fn(() => ({})),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: mockIsAgentUnavailable,
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

vi.mock('../useTokenUsage', () => ({
  setActiveTokenCategory: vi.fn(),
}))

vi.mock('../mcp/shared', () => ({
  fullFetchClusters: vi.fn(),
  clusterCache: { consecutiveFailures: 0, isFailed: false },
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  AI_PREDICTION_TIMEOUT_MS: 30000,
  WS_RECONNECT_DELAY_MS: 5000,
  UI_FEEDBACK_TIMEOUT_MS: 500,
  RETRY_DELAY_MS: 2000,
} })

import { useAIPredictions, getRawAIPredictions, isWSConnected, syncSettingsToBackend } from '../useAIPredictions'

describe('useAIPredictions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to demo mode defaults for each test
    mockGetDemoMode.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: 50 })
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

  // ---------- NEW REGRESSION TESTS ----------

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

  it('analyze returns a promise and is a stable callback', () => {
    const { result, rerender } = renderHook(() => useAIPredictions())
    const analyzeFn1 = result.current.analyze
    rerender()
    const analyzeFn2 = result.current.analyze
    // useCallback should produce a stable reference
    expect(analyzeFn1).toBe(analyzeFn2)
    // Calling analyze should return a thenable (promise)
    const returnVal = analyzeFn1()
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
})

describe('getRawAIPredictions', () => {
  it('returns an array', () => {
    const raw = getRawAIPredictions()
    expect(Array.isArray(raw)).toBe(true)
  })

  it('returns AIPrediction objects (not PredictedRisk)', () => {
    const raw = getRawAIPredictions()
    // Raw predictions should have 'category' (not 'type') and 'generatedAt' as string
    for (const pred of raw) {
      expect(pred).toHaveProperty('category')
      expect(typeof pred.generatedAt).toBe('string')
    }
  })
})

describe('isWSConnected', () => {
  it('returns a boolean', () => {
    expect(typeof isWSConnected()).toBe('boolean')
  })

  it('returns false when no WebSocket has been connected', () => {
    // In test environment with demo mode, no real WS connects
    expect(isWSConnected()).toBe(false)
  })
})

describe('syncSettingsToBackend', () => {
  it('is callable without error', () => {
    expect(() => syncSettingsToBackend()).not.toThrow()
  })

  it('does not throw when no WebSocket is connected', () => {
    // No WS in demo/test mode — should silently no-op
    expect(() => syncSettingsToBackend()).not.toThrow()
  })
})
