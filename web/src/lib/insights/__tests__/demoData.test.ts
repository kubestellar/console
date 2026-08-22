import { describe, it, expect } from 'vitest'
import { getDemoInsights } from '../demoData'

const VALID_CATEGORIES = new Set([
  'event-correlation',
  'cluster-delta',
  'cascade-impact',
  'config-drift',
  'resource-imbalance',
  'restart-correlation',
  'rollout-tracker',
])

const VALID_SOURCES = new Set(['heuristic', 'ai'])
const VALID_SEVERITIES = new Set(['critical', 'warning', 'info'])
const VALID_SIGNIFICANCE = new Set(['high', 'medium', 'low'])

describe('getDemoInsights()', () => {
  it('returns a non-empty array', () => {
    const insights = getDemoInsights()
    expect(Array.isArray(insights)).toBe(true)
    expect(insights.length).toBeGreaterThan(0)
  })

  it('is a pure function (no shared mutable state)', () => {
    const a = getDemoInsights()
    const b = getDemoInsights()
    expect(a).not.toBe(b) // fresh array each call
    expect(a.length).toBe(b.length)
    // detectedAt is timestamped at call time, so we assert structural equality
    // on stable fields rather than deep equality on the whole object.
    for (let i = 0; i < a.length; i++) {
      expect(a[i].id).toBe(b[i].id)
      expect(a[i].category).toBe(b[i].category)
      expect(a[i].severity).toBe(b[i].severity)
      expect(a[i].source).toBe(b[i].source)
    }
  })

  describe('per-insight required fields', () => {
    const insights = getDemoInsights()
    it.each(insights.map(i => [i.id, i] as const))(
      '%s has all required MultiClusterInsight fields',
      (_id, i) => {
        expect(typeof i.id).toBe('string')
        expect(i.id.length).toBeGreaterThan(0)
        expect(VALID_CATEGORIES.has(i.category), `bad category ${i.category}`).toBe(true)
        expect(VALID_SOURCES.has(i.source), `bad source ${i.source}`).toBe(true)
        expect(VALID_SEVERITIES.has(i.severity), `bad severity ${i.severity}`).toBe(true)
        expect(typeof i.title).toBe('string')
        expect(i.title.length).toBeGreaterThan(0)
        expect(typeof i.description).toBe('string')
        expect(i.description.length).toBeGreaterThan(0)
        expect(Array.isArray(i.affectedClusters)).toBe(true)
        expect(i.affectedClusters.length).toBeGreaterThan(0)
        expect(typeof i.detectedAt).toBe('string')
        expect(() => new Date(i.detectedAt)).not.toThrow()
        expect(Number.isNaN(Date.parse(i.detectedAt)), `${i.id} detectedAt not ISO`).toBe(false)
      },
    )
  })

  it('all ids are unique', () => {
    const ids = getDemoInsights().map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all ids use the demo- prefix', () => {
    for (const { id } of getDemoInsights()) {
      expect(id.startsWith('demo-'), `${id} missing demo- prefix`).toBe(true)
    }
  })

  it('AI-sourced insights have confidence in [0, 100] and a provider', () => {
    for (const i of getDemoInsights()) {
      if (i.source === 'ai') {
        expect(typeof i.confidence).toBe('number')
        expect(i.confidence!).toBeGreaterThanOrEqual(0)
        expect(i.confidence!).toBeLessThanOrEqual(100)
        expect(typeof i.provider).toBe('string')
        expect(i.provider!.length).toBeGreaterThan(0)
      }
    }
  })

  it('heuristic insights do not carry AI-only confidence/provider', () => {
    for (const i of getDemoInsights()) {
      if (i.source === 'heuristic') {
        expect(i.confidence).toBeUndefined()
        expect(i.provider).toBeUndefined()
      }
    }
  })

  it('cascade-impact insights include a well-formed chain[]', () => {
    const cascades = getDemoInsights().filter(i => i.category === 'cascade-impact')
    expect(cascades.length).toBeGreaterThan(0)
    for (const i of cascades) {
      expect(Array.isArray(i.chain)).toBe(true)
      expect(i.chain!.length).toBeGreaterThan(0)
      for (const link of i.chain!) {
        expect(typeof link.cluster).toBe('string')
        expect(typeof link.resource).toBe('string')
        expect(typeof link.event).toBe('string')
        expect(typeof link.timestamp).toBe('string')
        expect(VALID_SEVERITIES.has(link.severity)).toBe(true)
      }
    }
  })

  it('cluster-delta insights include a well-formed deltas[]', () => {
    const deltas = getDemoInsights().filter(i => i.category === 'cluster-delta')
    expect(deltas.length).toBeGreaterThan(0)
    for (const i of deltas) {
      expect(Array.isArray(i.deltas)).toBe(true)
      expect(i.deltas!.length).toBeGreaterThan(0)
      for (const d of i.deltas!) {
        expect(typeof d.dimension).toBe('string')
        expect(typeof d.clusterA.name).toBe('string')
        expect(typeof d.clusterB.name).toBe('string')
        expect(d.clusterA.value).toBeDefined()
        expect(d.clusterB.value).toBeDefined()
        expect(VALID_SIGNIFICANCE.has(d.significance)).toBe(true)
      }
    }
  })

  it('resource-imbalance and rollout-tracker insights carry numeric metrics', () => {
    const withMetrics = getDemoInsights().filter(i =>
      i.category === 'resource-imbalance' || i.category === 'rollout-tracker',
    )
    expect(withMetrics.length).toBeGreaterThan(0)
    for (const i of withMetrics) {
      // rollout-tracker sometimes uses string status values alongside numbers,
      // so we only assert that numeric fields are numeric; other fields are
      // permitted to be strings.
      expect(i.metrics).toBeDefined()
      for (const [k, v] of Object.entries(i.metrics!)) {
        if (!k.endsWith('_status')) {
          expect(typeof v, `${i.id}.metrics.${k} not number`).toBe('number')
        }
      }
    }
  })

  it('detectedAt timestamps are all in the recent past', () => {
    const now = Date.now()
    for (const i of getDemoInsights()) {
      const t = Date.parse(i.detectedAt)
      expect(t).toBeLessThanOrEqual(now + 1000) // allow tiny clock skew
      expect(now - t).toBeLessThan(60 * 60 * 1000) // within an hour
    }
  })
})
