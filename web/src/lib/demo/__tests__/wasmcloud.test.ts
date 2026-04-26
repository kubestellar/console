import { describe, it, expect } from 'vitest'
import { WASMCLOUD_DEMO_DATA } from '../wasmcloud'

describe('WASMCLOUD_DEMO_DATA re-export', () => {
  it('exports a valid object with health status', () => {
    expect(WASMCLOUD_DEMO_DATA).toBeDefined()
    expect(['healthy', 'degraded', 'not-installed']).toContain(WASMCLOUD_DEMO_DATA.health)
  })

  it('has hosts array', () => {
    expect(WASMCLOUD_DEMO_DATA.hosts.length).toBeGreaterThan(0)
  })

  it('has summary', () => {
    expect(typeof WASMCLOUD_DEMO_DATA.summary.totalHosts).toBe('number')
  })
})
