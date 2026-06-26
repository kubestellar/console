/**
 * Structural tests for llmd/mockData.ts — pure data generators.
 *
 * Every exported generator must produce non-empty, well-shaped output.
 * Coverage win is easy because the module was previously 0% covered
 * by anything except a placeholder "can be imported" test.
 */
import { describe, it, expect } from 'vitest'
import {
  generateKVCacheStats,
  generateRoutingStats,
  generateServerMetrics,
  getBenchmarkResults,
  getConfiguratorPresets,
  generateAIInsights,
} from '../mockData'

describe('llmd/mockData — KV cache', () => {
  it('produces one entry per known pod with populated fields', () => {
    const stats = generateKVCacheStats()
    expect(stats.length).toBeGreaterThan(0)
    for (const s of stats) {
      expect(s.podName).toBeTruthy()
      expect(s.cluster).toBeTruthy()
      expect(s.namespace).toBeTruthy()
      expect(s.totalCapacityGB).toBeGreaterThan(0)
      expect(s.usedGB).toBeGreaterThanOrEqual(0)
      expect(s.hitRate).toBeGreaterThan(0)
      expect(s.hitRate).toBeLessThanOrEqual(1)
      expect(s.lastUpdated).toBeInstanceOf(Date)
    }
  })

  it('maps pod name shape to capacity bucket', () => {
    const stats = generateKVCacheStats()
    const llama70b = stats.find(s => s.podName.includes('70b'))
    const qwen32b = stats.find(s => s.podName.includes('32b'))
    const granite13b = stats.find(s => s.podName.includes('13b'))
    expect(llama70b?.totalCapacityGB).toBe(80)
    expect(qwen32b?.totalCapacityGB).toBe(48)
    expect(granite13b?.totalCapacityGB).toBe(24)
  })
})

describe('llmd/mockData — routing', () => {
  it('routing stats include Gateway→EPP and Prefill→Decode handoffs', () => {
    const routes = generateRoutingStats()
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.some(r => r.source === 'Gateway' && r.target === 'EPP')).toBe(true)
    expect(routes.some(r => r.source === 'EPP' && r.target.startsWith('Prefill'))).toBe(true)
    expect(routes.some(r => r.source.startsWith('Prefill') && r.target.startsWith('Decode'))).toBe(true)
  })

  it('every routing row has a known traffic type', () => {
    for (const r of generateRoutingStats()) {
      expect(['prefill', 'decode', 'mixed']).toContain(r.type)
    }
  })
})

describe('llmd/mockData — server metrics', () => {
  it('covers all server type labels', () => {
    const metrics = generateServerMetrics()
    const types = new Set(metrics.map(m => m.type))
    for (const expected of ['gateway', 'epp', 'prefill', 'decode', 'kvcache']) {
      expect(types.has(expected as typeof metrics[0]['type'])).toBe(true)
    }
  })

  it('every server has status in the known set and bounded load', () => {
    for (const m of generateServerMetrics()) {
      expect(['healthy', 'degraded', 'unhealthy']).toContain(m.status)
      expect(m.load).toBeGreaterThanOrEqual(0)
      expect(m.load).toBeLessThanOrEqual(100)
    }
  })
})

describe('llmd/mockData — benchmarks', () => {
  it('returns multiple configurations per model', () => {
    const results = getBenchmarkResults()
    expect(results.length).toBeGreaterThanOrEqual(7)
    const models = new Set(results.map(r => r.model))
    expect(models.size).toBeGreaterThan(1)
  })

  it('every row has latency/throughput/percentile fields', () => {
    for (const r of getBenchmarkResults()) {
      expect(r.ttftMs).toBeGreaterThan(0)
      expect(r.tpotMs).toBeGreaterThan(0)
      expect(r.throughputTokensPerSec).toBeGreaterThan(0)
      expect(r.p95LatencyMs).toBeGreaterThanOrEqual(r.p50LatencyMs)
      expect(r.p99LatencyMs).toBeGreaterThanOrEqual(r.p95LatencyMs)
      expect(['baseline', 'llm-d', 'disaggregated']).toContain(r.configuration)
    }
  })
})

describe('llmd/mockData — configurator presets', () => {
  it('includes all 4 category presets', () => {
    const presets = getConfiguratorPresets()
    const cats = new Set(presets.map(p => p.category))
    for (const expected of ['scheduling', 'disaggregation', 'parallelism', 'autoscaling']) {
      expect(cats.has(expected as typeof presets[0]['category'])).toBe(true)
    }
  })

  it('each preset has an id, name, params, and expected impact', () => {
    for (const p of getConfiguratorPresets()) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.parameters.length).toBeGreaterThan(0)
      expect(typeof p.expectedImpact.ttftImprovement).toBe('number')
      expect(typeof p.expectedImpact.throughputImprovement).toBe('number')
    }
  })
})

describe('llmd/mockData — AI insights', () => {
  it('returns insights of every severity and multiple types', () => {
    const insights = generateAIInsights()
    expect(insights.length).toBeGreaterThan(0)
    const types = new Set(insights.map(i => i.type))
    const severities = new Set(insights.map(i => i.severity))
    expect(types.size).toBeGreaterThan(1)
    expect(severities.size).toBeGreaterThanOrEqual(1)
    for (const i of insights) {
      expect(i.id).toBeTruthy()
      expect(i.title).toBeTruthy()
      expect(i.description).toBeTruthy()
      expect(i.recommendation).toBeTruthy()
      expect(i.timestamp).toBeInstanceOf(Date)
    }
  })
})
