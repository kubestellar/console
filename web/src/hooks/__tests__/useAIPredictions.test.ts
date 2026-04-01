import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../usePredictionSettings', () => ({
  getPredictionSettings: vi.fn(() => ({ aiEnabled: true, minConfidence: 50 })),
  getSettingsForBackend: vi.fn(() => ({})),
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
}))

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
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

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  AI_PREDICTION_TIMEOUT_MS: 30000,
  WS_RECONNECT_DELAY_MS: 5000,
  UI_FEEDBACK_TIMEOUT_MS: 500,
  RETRY_DELAY_MS: 2000,
}))

import { useAIPredictions, getRawAIPredictions, isWSConnected, syncSettingsToBackend } from '../useAIPredictions'

describe('useAIPredictions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})

describe('getRawAIPredictions', () => {
  it('returns an array', () => {
    const raw = getRawAIPredictions()
    expect(Array.isArray(raw)).toBe(true)
  })
})

describe('isWSConnected', () => {
  it('returns a boolean', () => {
    expect(typeof isWSConnected()).toBe('boolean')
  })
})

describe('syncSettingsToBackend', () => {
  it('is callable without error', () => {
    expect(() => syncSettingsToBackend()).not.toThrow()
  })
})
