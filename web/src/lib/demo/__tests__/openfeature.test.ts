import { describe, it, expect } from 'vitest'
import { OPENFEATURE_DEMO_DATA } from '../openfeature'

describe('OPENFEATURE_DEMO_DATA re-export', () => {
  it('exports a valid object with health status', () => {
    expect(OPENFEATURE_DEMO_DATA).toBeDefined()
    expect(['healthy', 'degraded', 'not-installed']).toContain(OPENFEATURE_DEMO_DATA.health)
  })

  it('has providers array', () => {
    expect(OPENFEATURE_DEMO_DATA.providers.length).toBeGreaterThan(0)
  })

  it('has flags array', () => {
    expect(OPENFEATURE_DEMO_DATA.flags.length).toBeGreaterThan(0)
  })
})
