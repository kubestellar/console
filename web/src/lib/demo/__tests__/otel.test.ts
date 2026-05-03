import { describe, it, expect } from 'vitest'
import { OTEL_DEMO_DATA } from '../otel'

describe('otel demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(OTEL_DEMO_DATA.health)
  })

  it('has collectors with required fields', () => {
    expect(OTEL_DEMO_DATA.collectors.length).toBeGreaterThan(0)
    for (const c of OTEL_DEMO_DATA.collectors) {
      expect(c.name).toBeTruthy()
      expect(c.state).toBeTruthy()
      expect(Array.isArray(c.pipelines)).toBe(true)
    }
  })

  it('has consistent summary counts', () => {
    const { summary, collectors } = OTEL_DEMO_DATA
    expect(summary.totalCollectors).toBe(collectors.length)
    expect(summary.runningCollectors + summary.degradedCollectors)
      .toBeLessThanOrEqual(summary.totalCollectors)
  })

  it('has a lastCheckTime', () => {
    expect(OTEL_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
