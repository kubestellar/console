import { describe, it, expect } from 'vitest'
import { __testables, getRawAIPredictions, isWSConnected } from '../useAIPredictions'
import type { AIPrediction } from '../../types/predictions'

const {
  aiPredictionToRisk,
  coercePredictionText,
  sanitizeAIPrediction,
  sanitizeAIPredictions,
  DEMO_AI_PREDICTIONS,
  DEGRADED_RECONNECT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  ANALYSIS_POLL_INTERVAL_MS,
  ANALYSIS_MAX_TIMEOUT_MS,
} = __testables

function makePrediction(overrides: Partial<AIPrediction> = {}): AIPrediction {
  return {
    id: 'pred-1',
    category: 'resource-trend',
    severity: 'warning',
    name: 'test-pod',
    cluster: 'test-cluster',
    reason: 'Memory usage trending up',
    reasonDetailed: 'Detailed explanation here',
    confidence: 85,
    generatedAt: '2026-07-01T12:00:00Z',
    provider: 'claude',
    ...overrides,
  }
}

// ── coercePredictionText ────────────────────────────────────────

describe('coercePredictionText', () => {
  it('returns string value as-is', () => {
    expect(coercePredictionText('hello', 'fallback')).toBe('hello')
  })

  it('returns empty string as-is (not fallback)', () => {
    expect(coercePredictionText('', 'fallback')).toBe('')
  })

  it('converts number to string', () => {
    expect(coercePredictionText(42, 'fallback')).toBe('42')
  })

  it('converts boolean to string', () => {
    expect(coercePredictionText(true, 'fallback')).toBe('true')
    expect(coercePredictionText(false, 'fallback')).toBe('false')
  })

  it('converts bigint to string', () => {
    expect(coercePredictionText(BigInt(999), 'fallback')).toBe('999')
  })

  it('returns fallback for null', () => {
    expect(coercePredictionText(null, 'my-fallback')).toBe('my-fallback')
  })

  it('returns fallback for undefined', () => {
    expect(coercePredictionText(undefined, 'fb')).toBe('fb')
  })

  it('serializes object to JSON string', () => {
    const result = coercePredictionText({ key: 'val' }, 'fallback')
    expect(result).toBe('{"key":"val"}')
  })

  it('serializes array to JSON string', () => {
    const result = coercePredictionText([1, 2, 3], 'fallback')
    expect(result).toBe('[1,2,3]')
  })

  it('returns fallback for circular reference (JSON.stringify throws)', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(coercePredictionText(circular, 'safe-fallback')).toBe('safe-fallback')
  })
})

// ── sanitizeAIPrediction ────────────────────────────────────────

describe('sanitizeAIPrediction', () => {
  it('passes through valid prediction unchanged', () => {
    const pred = makePrediction()
    const result = sanitizeAIPrediction(pred)
    expect(result.name).toBe('test-pod')
    expect(result.cluster).toBe('test-cluster')
    expect(result.reason).toBe('Memory usage trending up')
    expect(result.reasonDetailed).toBe('Detailed explanation here')
  })

  it('replaces null name with fallback', () => {
    const pred = makePrediction({ name: null as unknown as string })
    const result = sanitizeAIPrediction(pred)
    expect(result.name).toBe('Unknown resource')
  })

  it('replaces undefined cluster with fallback', () => {
    const pred = makePrediction({ cluster: undefined as unknown as string })
    const result = sanitizeAIPrediction(pred)
    expect(result.cluster).toBe('unknown')
  })

  it('replaces null reason with fallback', () => {
    const pred = makePrediction({ reason: null as unknown as string })
    const result = sanitizeAIPrediction(pred)
    expect(result.reason).toBe('AI response unavailable')
  })

  it('replaces null reasonDetailed with sanitized reason', () => {
    const pred = makePrediction({ reason: 'Custom reason', reasonDetailed: null as unknown as string })
    const result = sanitizeAIPrediction(pred)
    expect(result.reasonDetailed).toBe('Custom reason')
  })

  it('coerces numeric name to string', () => {
    const pred = makePrediction({ name: 12345 as unknown as string })
    const result = sanitizeAIPrediction(pred)
    expect(result.name).toBe('12345')
  })

  it('preserves other fields (id, category, severity, confidence)', () => {
    const pred = makePrediction({ id: 'abc', category: 'anomaly', severity: 'critical', confidence: 92 })
    const result = sanitizeAIPrediction(pred)
    expect(result.id).toBe('abc')
    expect(result.category).toBe('anomaly')
    expect(result.severity).toBe('critical')
    expect(result.confidence).toBe(92)
  })
})

// ── sanitizeAIPredictions ───────────────────────────────────────

describe('sanitizeAIPredictions', () => {
  it('returns empty array for empty input', () => {
    expect(sanitizeAIPredictions([])).toEqual([])
  })

  it('sanitizes all predictions in array', () => {
    const preds = [
      makePrediction({ name: null as unknown as string }),
      makePrediction({ cluster: undefined as unknown as string }),
    ]
    const results = sanitizeAIPredictions(preds)
    expect(results[0].name).toBe('Unknown resource')
    expect(results[1].cluster).toBe('unknown')
  })

  it('preserves array length', () => {
    const preds = [makePrediction(), makePrediction(), makePrediction()]
    expect(sanitizeAIPredictions(preds)).toHaveLength(3)
  })
})

// ── aiPredictionToRisk ──────────────────────────────────────────

describe('aiPredictionToRisk', () => {
  it('maps prediction fields to PredictedRisk format', () => {
    const pred = makePrediction({
      id: 'risk-1',
      category: 'anomaly',
      severity: 'critical',
      name: 'api-pod',
      cluster: 'prod',
      namespace: 'default',
      reason: 'High memory',
      reasonDetailed: 'Detailed memory info',
      confidence: 95,
      generatedAt: '2026-07-01T10:00:00Z',
      provider: 'gpt4',
      trend: 'worsening',
    })

    const risk = aiPredictionToRisk(pred)

    expect(risk.id).toBe('risk-1')
    expect(risk.type).toBe('anomaly')
    expect(risk.severity).toBe('critical')
    expect(risk.name).toBe('api-pod')
    expect(risk.cluster).toBe('prod')
    expect(risk.namespace).toBe('default')
    expect(risk.reason).toBe('High memory')
    expect(risk.reasonDetailed).toBe('Detailed memory info')
    expect(risk.source).toBe('ai')
    expect(risk.confidence).toBe(95)
    expect(risk.provider).toBe('gpt4')
    expect(risk.trend).toBe('worsening')
  })

  it('converts generatedAt string to Date object', () => {
    const pred = makePrediction({ generatedAt: '2026-07-01T10:00:00Z' })
    const risk = aiPredictionToRisk(pred)
    expect(risk.generatedAt).toBeInstanceOf(Date)
    expect(risk.generatedAt!.toISOString()).toBe('2026-07-01T10:00:00.000Z')
  })

  it('sanitizes before converting (null name gets fallback)', () => {
    const pred = makePrediction({ name: null as unknown as string })
    const risk = aiPredictionToRisk(pred)
    expect(risk.name).toBe('Unknown resource')
  })

  it('sets source to "ai" always', () => {
    const risk = aiPredictionToRisk(makePrediction())
    expect(risk.source).toBe('ai')
  })

  it('handles missing optional fields (namespace, trend)', () => {
    const pred = makePrediction()
    const risk = aiPredictionToRisk(pred)
    expect(risk.namespace).toBeUndefined()
    expect(risk.trend).toBeUndefined()
  })
})

// ── Constants ───────────────────────────────────────────────────

describe('useAIPredictions constants', () => {
  it('DEGRADED_RECONNECT_INTERVAL_MS is reasonable (30s-120s)', () => {
    expect(DEGRADED_RECONNECT_INTERVAL_MS).toBeGreaterThanOrEqual(30_000)
    expect(DEGRADED_RECONNECT_INTERVAL_MS).toBeLessThanOrEqual(120_000)
  })

  it('POLL_INTERVAL_MS is reasonable (10s-60s)', () => {
    expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000)
    expect(POLL_INTERVAL_MS).toBeLessThanOrEqual(60_000)
  })

  it('ANALYSIS_POLL_INTERVAL_MS is less than ANALYSIS_MAX_TIMEOUT_MS', () => {
    expect(ANALYSIS_POLL_INTERVAL_MS).toBeLessThan(ANALYSIS_MAX_TIMEOUT_MS)
  })

  it('ANALYSIS_MAX_TIMEOUT_MS is reasonable (30s-120s)', () => {
    expect(ANALYSIS_MAX_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000)
    expect(ANALYSIS_MAX_TIMEOUT_MS).toBeLessThanOrEqual(120_000)
  })

  it('DEMO_AI_PREDICTIONS is a non-empty array', () => {
    expect(Array.isArray(DEMO_AI_PREDICTIONS)).toBe(true)
    expect(DEMO_AI_PREDICTIONS.length).toBeGreaterThan(0)
  })

  it('DEMO_AI_PREDICTIONS have required fields', () => {
    for (const pred of DEMO_AI_PREDICTIONS) {
      expect(pred.id).toBeTruthy()
      expect(pred.category).toBeTruthy()
      expect(pred.severity).toBeTruthy()
      expect(pred.name).toBeTruthy()
      expect(pred.cluster).toBeTruthy()
      expect(pred.reason).toBeTruthy()
      expect(pred.confidence).toBeGreaterThan(0)
      expect(pred.provider).toBeTruthy()
    }
  })
})

// ── Exported functions ──────────────────────────────────────────

describe('exported utility functions', () => {
  it('getRawAIPredictions returns an array', () => {
    const result = getRawAIPredictions()
    expect(Array.isArray(result)).toBe(true)
  })

  it('isWSConnected returns a boolean', () => {
    const result = isWSConnected()
    expect(typeof result).toBe('boolean')
  })
})
