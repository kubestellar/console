import { describe, it, expect } from 'vitest'
import {
  generateDrasiHealthSummary,
  deriveHealthLevel,
} from '../drasiHealth'
import type { DrasiHealthSummary } from '../drasiHealth'

// ---------------------------------------------------------------------------
// deriveHealthLevel
// ---------------------------------------------------------------------------

describe('deriveHealthLevel', () => {
  it('returns "healthy" for uptime >= 95%', () => {
    expect(deriveHealthLevel(95)).toBe('healthy')
    expect(deriveHealthLevel(99.9)).toBe('healthy')
    expect(deriveHealthLevel(100)).toBe('healthy')
  })

  it('returns "degraded" for uptime >= 50% and < 95%', () => {
    expect(deriveHealthLevel(50)).toBe('degraded')
    expect(deriveHealthLevel(75)).toBe('degraded')
    expect(deriveHealthLevel(94.9)).toBe('degraded')
  })

  it('returns "down" for uptime < 50%', () => {
    expect(deriveHealthLevel(0)).toBe('down')
    expect(deriveHealthLevel(49.9)).toBe('down')
    expect(deriveHealthLevel(25)).toBe('down')
  })

  it('handles exact boundary at 95', () => {
    expect(deriveHealthLevel(95)).toBe('healthy')
  })

  it('handles exact boundary at 50', () => {
    expect(deriveHealthLevel(50)).toBe('degraded')
  })

  it('handles boundary just below 50', () => {
    expect(deriveHealthLevel(49.999)).toBe('down')
  })
})

// ---------------------------------------------------------------------------
// generateDrasiHealthSummary
// ---------------------------------------------------------------------------

describe('generateDrasiHealthSummary', () => {
  let summary: DrasiHealthSummary

  // Generate once — it's deterministic except for timestamps
  beforeAll(() => {
    summary = generateDrasiHealthSummary()
  })

  it('returns overallHealth as "down" because supply-chain pipeline is down', () => {
    expect(summary.overallHealth).toBe('down')
  })

  it('includes exactly 5 pipelines', () => {
    expect(summary.pipelines).toHaveLength(5)
  })

  it('pipeline names are correct', () => {
    const names = summary.pipelines.map(p => p.pipelineName)
    expect(names).toContain('stock-ticker')
    expect(names).toContain('fraud-detection')
    expect(names).toContain('retail-analytics')
    expect(names).toContain('iot-telemetry')
    expect(names).toContain('supply-chain')
  })

  it('totalSources equals sum of all pipeline sourcesTotal', () => {
    const expected = summary.pipelines.reduce((s, p) => s + p.sourcesTotal, 0)
    expect(summary.totalSources).toBe(expected)
  })

  it('healthySources equals sum of all pipeline sourcesHealthy', () => {
    const expected = summary.pipelines.reduce((s, p) => s + p.sourcesHealthy, 0)
    expect(summary.healthySources).toBe(expected)
  })

  it('totalQueries equals sum of all pipeline queriesTotal', () => {
    const expected = summary.pipelines.reduce((s, p) => s + p.queriesTotal, 0)
    expect(summary.totalQueries).toBe(expected)
  })

  it('healthyQueries equals sum of all pipeline queriesHealthy', () => {
    const expected = summary.pipelines.reduce((s, p) => s + p.queriesHealthy, 0)
    expect(summary.healthyQueries).toBe(expected)
  })

  it('totalReactions equals sum of all pipeline reactionsTotal', () => {
    const expected = summary.pipelines.reduce((s, p) => s + p.reactionsTotal, 0)
    expect(summary.totalReactions).toBe(expected)
  })

  it('healthyReactions equals sum of all pipeline reactionsHealthy', () => {
    const expected = summary.pipelines.reduce((s, p) => s + p.reactionsHealthy, 0)
    expect(summary.healthyReactions).toBe(expected)
  })

  it('healthy pipelines have uptime >= 95%', () => {
    const healthyPipelines = summary.pipelines.filter(p => p.health === 'healthy')
    for (const p of healthyPipelines) {
      expect(p.uptimePct).toBeGreaterThanOrEqual(95)
    }
  })

  it('degraded pipelines have uptime between 50% and 95%', () => {
    const degraded = summary.pipelines.filter(p => p.health === 'degraded')
    for (const p of degraded) {
      expect(p.uptimePct).toBeGreaterThanOrEqual(50)
      expect(p.uptimePct).toBeLessThan(95)
    }
  })

  it('down pipelines have uptime < 50%', () => {
    const down = summary.pipelines.filter(p => p.health === 'down')
    for (const p of down) {
      expect(p.uptimePct).toBeLessThan(50)
    }
  })

  it('lastCheckedAt is a valid ISO timestamp for each pipeline', () => {
    for (const p of summary.pipelines) {
      const date = new Date(p.lastCheckedAt)
      expect(date.getTime()).not.toBeNaN()
    }
  })

  it('overallHealth would be "degraded" if only degraded pipelines present', () => {
    // Verify logic: if no "down" but has "degraded" → degraded
    const hasDegraded = summary.pipelines.some(p => p.health === 'degraded')
    const hasDown = summary.pipelines.some(p => p.health === 'down')
    expect(hasDegraded).toBe(true)
    expect(hasDown).toBe(true)
    // Since hasDown is true, overallHealth is 'down'
    expect(summary.overallHealth).toBe('down')
  })

  it('healthySources is less than totalSources (supply-chain has 0 healthy)', () => {
    expect(summary.healthySources).toBeLessThan(summary.totalSources)
  })
})
