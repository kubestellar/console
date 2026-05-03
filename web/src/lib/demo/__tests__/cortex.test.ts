import { describe, it, expect } from 'vitest'
import { CORTEX_DEMO_DATA } from '../cortex'

describe('CORTEX_DEMO_DATA', () => {
  const data = CORTEX_DEMO_DATA

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(data.health)
  })

  it('has a version string', () => {
    expect(data.version).toBeTruthy()
  })

  it('has components with required fields', () => {
    expect(data.components.length).toBeGreaterThan(0)
    for (const c of data.components) {
      expect(c.name).toBeTruthy()
      expect(['running', 'pending', 'failed', 'unknown']).toContain(c.status)
      expect(typeof c.replicasDesired).toBe('number')
      expect(typeof c.replicasReady).toBe('number')
    }
  })

  it('includes canonical Cortex component names', () => {
    const names = data.components.map(c => c.name)
    expect(names).toContain('distributor')
    expect(names).toContain('ingester')
    expect(names).toContain('querier')
  })

  it('has ingestion metrics', () => {
    const m = data.metrics
    expect(typeof m.activeSeries).toBe('number')
    expect(m.activeSeries).toBeGreaterThan(0)
    expect(typeof m.ingestionRatePerSec).toBe('number')
    expect(typeof m.queryRatePerSec).toBe('number')
    expect(typeof m.tenantCount).toBe('number')
  })

  it('has consistent summary', () => {
    const s = data.summary
    expect(s.totalPods).toBeGreaterThanOrEqual(s.runningPods)
    expect(s.totalComponents).toBe(new Set(data.components.map(c => c.name)).size)
  })

  it('has a valid lastCheckTime', () => {
    expect(new Date(data.lastCheckTime).getTime()).toBeGreaterThan(0)
  })
})
