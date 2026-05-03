import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'kc-auth-token', LOCAL_AGENT_HTTP_URL: 'http://localhost:4201', LOCAL_AGENT_WS_URL: 'ws://localhost:4201' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual }
})

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn((url: string) => url),
}))

const mod = await import('../useAIPredictions')
const {
  aiPredictionToRisk,
  DEMO_AI_PREDICTIONS,
  DEGRADED_RECONNECT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  ANALYSIS_POLL_INTERVAL_MS,
  ANALYSIS_MAX_TIMEOUT_MS,
} = mod.__testables

describe('aiPredictionToRisk', () => {
  it('converts a prediction to PredictedRisk format', () => {
    const prediction = {
      id: 'pred-1',
      category: 'resource-trend',
      severity: 'warning',
      name: 'test-pod',
      cluster: 'test-cluster',
      namespace: 'default',
      reason: 'High CPU usage',
      reasonDetailed: 'Details here',
      confidence: 85,
      generatedAt: '2026-01-01T00:00:00Z',
      provider: 'claude',
      trend: 'worsening',
    }
    const risk = aiPredictionToRisk(prediction as never)
    expect(risk.id).toBe('pred-1')
    expect(risk.type).toBe('resource-trend')
    expect(risk.severity).toBe('warning')
    expect(risk.name).toBe('test-pod')
    expect(risk.cluster).toBe('test-cluster')
    expect(risk.namespace).toBe('default')
    expect(risk.reason).toBe('High CPU usage')
    expect(risk.source).toBe('ai')
    expect(risk.confidence).toBe(85)
    expect(risk.provider).toBe('claude')
    expect(risk.trend).toBe('worsening')
    expect(risk.generatedAt).toBeInstanceOf(Date)
  })

  it('handles missing optional fields', () => {
    const prediction = {
      id: 'pred-2',
      category: 'anomaly',
      severity: 'info',
      name: 'pod-x',
      cluster: 'c1',
      reason: 'Minor issue',
      confidence: 50,
      generatedAt: '2026-01-01T00:00:00Z',
      provider: 'test',
    }
    const risk = aiPredictionToRisk(prediction as never)
    expect(risk.id).toBe('pred-2')
    expect(risk.namespace).toBeUndefined()
    expect(risk.trend).toBeUndefined()
  })
})

describe('DEMO_AI_PREDICTIONS', () => {
  it('is a non-empty array', () => {
    expect(DEMO_AI_PREDICTIONS.length).toBeGreaterThan(0)
  })

  it('each prediction has required fields', () => {
    for (const p of DEMO_AI_PREDICTIONS) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.category).toBe('string')
      expect(typeof p.severity).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.cluster).toBe('string')
      expect(typeof p.reason).toBe('string')
      expect(typeof p.confidence).toBe('number')
      expect(typeof p.generatedAt).toBe('string')
      expect(typeof p.provider).toBe('string')
    }
  })

  it('confidence values are between 0 and 100', () => {
    for (const p of DEMO_AI_PREDICTIONS) {
      expect(p.confidence).toBeGreaterThanOrEqual(0)
      expect(p.confidence).toBeLessThanOrEqual(100)
    }
  })
})

describe('constants', () => {
  it('DEGRADED_RECONNECT_INTERVAL_MS is 60 seconds', () => {
    expect(DEGRADED_RECONNECT_INTERVAL_MS).toBe(60_000)
  })

  it('POLL_INTERVAL_MS is 30 seconds', () => {
    expect(POLL_INTERVAL_MS).toBe(30_000)
  })

  it('ANALYSIS_POLL_INTERVAL_MS is 4 seconds', () => {
    expect(ANALYSIS_POLL_INTERVAL_MS).toBe(4_000)
  })

  it('ANALYSIS_MAX_TIMEOUT_MS is 60 seconds', () => {
    expect(ANALYSIS_MAX_TIMEOUT_MS).toBe(60_000)
  })

  it('ANALYSIS_MAX_TIMEOUT_MS > ANALYSIS_POLL_INTERVAL_MS', () => {
    expect(ANALYSIS_MAX_TIMEOUT_MS).toBeGreaterThan(ANALYSIS_POLL_INTERVAL_MS)
  })
})
