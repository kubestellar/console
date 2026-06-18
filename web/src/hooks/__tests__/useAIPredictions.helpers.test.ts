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

  it('raw predictions preserve original confidence values without filtering', () => {
    const raw = getRawAIPredictions()
    // All demo predictions should be present regardless of current minConfidence
    for (const pred of raw) {
      expect(typeof pred.confidence).toBe('number')
    }
  })

  it('returns predictions that have id, category, severity, name, cluster, reason fields', () => {
    const raw = getRawAIPredictions()
    for (const pred of raw) {
      expect(typeof pred.id).toBe('string')
      expect(typeof pred.category).toBe('string')
      expect(typeof pred.severity).toBe('string')
      expect(typeof pred.name).toBe('string')
      expect(typeof pred.cluster).toBe('string')
      expect(typeof pred.reason).toBe('string')
    }
  })

  it('returns predictions with reasonDetailed as string', () => {
    const raw = getRawAIPredictions()
    for (const pred of raw) {
      expect(typeof pred.reasonDetailed).toBe('string')
      expect(pred.reasonDetailed.length).toBeGreaterThan(0)
    }
  })

  it('returns predictions with provider field', () => {
    const raw = getRawAIPredictions()
    for (const pred of raw) {
      expect(typeof pred.provider).toBe('string')
    }
  })

  it('returns same reference on consecutive calls (singleton)', () => {
    const first = getRawAIPredictions()
    const second = getRawAIPredictions()
    expect(first).toBe(second)
  })
})

// ---------- isWSConnected ----------

describe('isWSConnected', () => {
  it('returns a boolean', () => {
    expect(typeof isWSConnected()).toBe('boolean')
  })

  it('returns false when no WebSocket has been connected', () => {
    // In test environment with demo mode, no real WS connects
    expect(isWSConnected()).toBe(false)
  })

  it('returns false consistently in demo/test environment', () => {
    // Multiple calls should return same value
    const first = isWSConnected()
    const second = isWSConnected()
    expect(first).toBe(second)
    expect(first).toBe(false)
  })
})

// ---------- syncSettingsToBackend ----------

describe('syncSettingsToBackend', () => {
  it('is callable without error', () => {
    expect(() => syncSettingsToBackend()).not.toThrow()
  })

  it('does not throw when no WebSocket is connected', () => {
    // No WS in demo/test mode — should silently no-op
    expect(() => syncSettingsToBackend()).not.toThrow()
  })

  it('is safe to call multiple times', () => {
    expect(() => {
      syncSettingsToBackend()
      syncSettingsToBackend()
      syncSettingsToBackend()
    }).not.toThrow()
  })
})
