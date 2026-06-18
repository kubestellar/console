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

vi.mock('../useDemoMode', () => ({
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

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  AI_PREDICTION_TIMEOUT_MS: 30000,
  WS_RECONNECT_DELAY_MS: 5000,
  UI_FEEDBACK_TIMEOUT_MS: 500,
  RETRY_DELAY_MS: 100,
  MAX_WS_RECONNECT_ATTEMPTS: 5,
  getWsBackoffDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30000),
}))

import { useAIPredictions, getRawAIPredictions, isWSConnected, syncSettingsToBackend } from '../useAIPredictions'

// ---- Mock global fetch ----
const originalFetch = globalThis.fetch

describe('aiPredictionToRisk transformation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
  })

  it('maps category to type field', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [
          {
            id: 'map-test-1', category: 'pod-crash', severity: 'critical',
            name: 'crashing-pod', cluster: 'prod', reason: 'OOMKilled',
            reasonDetailed: 'Pod killed by OOM', confidence: 95,
            generatedAt: TIMESTAMP, provider: 'openai',
          },
        ],
        lastAnalyzed: TIMESTAMP,
        providers: ['openai'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.length).toBeGreaterThan(0)
    })

    const pred = result.current.predictions.find(p => p.id === 'map-test-1')
    expect(pred).toBeDefined()
    // category 'pod-crash' becomes type 'pod-crash'
    expect(pred!.type).toBe('pod-crash')
    // source is always 'ai'
    expect(pred!.source).toBe('ai')
    // generatedAt is converted from string to Date
    expect(pred!.generatedAt).toBeInstanceOf(Date)
    expect(pred!.generatedAt!.toISOString()).toBe('2025-06-15T12:00:00.000Z')
    // provider is preserved
    expect(pred!.provider).toBe('openai')
    // cluster is preserved
    expect(pred!.cluster).toBe('prod')
    // name is preserved
    expect(pred!.name).toBe('crashing-pod')
    // reason is preserved
    expect(pred!.reason).toBe('OOMKilled')
    // reasonDetailed is preserved
    expect(pred!.reasonDetailed).toBe('Pod killed by OOM')
    // confidence is preserved
    expect(pred!.confidence).toBe(95)
    // severity is preserved
    expect(pred!.severity).toBe('critical')
  })

  it('preserves optional namespace field when present', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [
          {
            id: 'ns-test', category: 'resource-exhaustion', severity: 'warning',
            name: 'busy-pod', cluster: 'staging', namespace: 'kube-system',
            reason: 'CPU near limit', reasonDetailed: 'Details here',
            confidence: 80, generatedAt: TIMESTAMP, provider: 'claude',
          },
        ],
        lastAnalyzed: TIMESTAMP,
        providers: ['claude'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.find(p => p.id === 'ns-test')).toBeDefined()
    })

    const pred = result.current.predictions.find(p => p.id === 'ns-test')
    expect(pred).toBeDefined()
    expect(pred!.namespace).toBe('kube-system')
  })

  it('preserves optional trend field when present', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [
          {
            id: 'trend-test', category: 'resource-trend', severity: 'warning',
            name: 'trending-node', cluster: 'prod', reason: 'Memory rising',
            reasonDetailed: 'Trending upward', confidence: 70,
            generatedAt: TIMESTAMP, provider: 'claude', trend: 'worsening',
          },
        ],
        lastAnalyzed: TIMESTAMP,
        providers: ['claude'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.find(p => p.id === 'trend-test')).toBeDefined()
    })

    const pred = result.current.predictions.find(p => p.id === 'trend-test')
    expect(pred).toBeDefined()
    expect(pred!.trend).toBe('worsening')
  })

  it('leaves namespace undefined when not present in prediction', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [
          {
            id: 'no-ns-test', category: 'node-pressure', severity: 'critical',
            name: 'stressed-node', cluster: 'prod', reason: 'High CPU',
            reasonDetailed: 'Node under load', confidence: 88,
            generatedAt: TIMESTAMP, provider: 'claude',
          },
        ],
        lastAnalyzed: TIMESTAMP,
        providers: ['claude'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.find(p => p.id === 'no-ns-test')).toBeDefined()
    })

    const pred = result.current.predictions.find(p => p.id === 'no-ns-test')
    expect(pred).toBeDefined()
    expect(pred!.namespace).toBeUndefined()
    expect(pred!.trend).toBeUndefined()
  })

  it('transforms all prediction categories correctly', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    const ALL_CATEGORIES = [
      'pod-crash', 'node-pressure', 'gpu-exhaustion',
      'resource-exhaustion', 'resource-trend', 'capacity-risk', 'anomaly',
    ] as const

    const predictions = ALL_CATEGORIES.map((category, idx) => ({
      id: `cat-${idx}`, category, severity: 'warning' as const,
      name: `resource-${idx}`, cluster: 'test', reason: `reason-${idx}`,
      reasonDetailed: `detail-${idx}`, confidence: 90,
      generatedAt: TIMESTAMP, provider: 'claude',
    }))

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions,
        lastAnalyzed: TIMESTAMP,
        providers: ['claude'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.length).toBe(ALL_CATEGORIES.length)
    })

    // Each prediction's type should match the original category
    for (let i = 0; i < ALL_CATEGORIES.length; i++) {
      const pred = result.current.predictions.find(p => p.id === `cat-${i}`)
      expect(pred).toBeDefined()
      expect(pred!.type).toBe(ALL_CATEGORIES[i])
      expect(pred!.source).toBe('ai')
    }
  })

  it('handles edge case with confidence at exact threshold', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    const THRESHOLD = 75
    mockGetPredictionSettings.mockReturnValue({ aiEnabled: true, minConfidence: THRESHOLD })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [
          {
            id: 'exact-threshold', category: 'anomaly', severity: 'warning',
            name: 'border-case', cluster: 'test', reason: 'Edge case',
            reasonDetailed: 'At exact threshold', confidence: THRESHOLD,
            generatedAt: TIMESTAMP, provider: 'claude',
          },
          {
            id: 'below-threshold', category: 'anomaly', severity: 'warning',
            name: 'below-case', cluster: 'test', reason: 'Below',
            reasonDetailed: 'Below threshold', confidence: THRESHOLD - 1,
            generatedAt: TIMESTAMP, provider: 'claude',
          },
        ],
        lastAnalyzed: TIMESTAMP,
        providers: ['claude'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.predictions.length).toBe(1)
    })

    // Prediction at exact threshold should be included (>=)
    expect(result.current.predictions[0]!.id).toBe('exact-threshold')
  })

  it('returns providers from successful fetch', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [],
        lastAnalyzed: TIMESTAMP,
        providers: ['claude', 'openai', 'gemini'],
        stale: false,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.providers.length).toBe(3)
    })

    expect(result.current.providers).toContain('claude')
    expect(result.current.providers).toContain('openai')
    expect(result.current.providers).toContain('gemini')
  })

  it('reports stale flag from server response', async () => {
    const TIMESTAMP = '2025-06-15T12:00:00Z'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        predictions: [],
        lastAnalyzed: TIMESTAMP,
        providers: [],
        stale: true,
      }),
    })

    const { result } = renderHook(() => useAIPredictions())

    await waitFor(() => {
      expect(result.current.isStale).toBe(true)
    })
  })
})
