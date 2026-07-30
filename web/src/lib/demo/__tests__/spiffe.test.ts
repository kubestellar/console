/**
 * Tests for lib/demo/spiffe.ts
 */
import { describe, it, expect } from 'vitest'
import { SPIFFE_DEMO_DATA } from '../spiffe'

describe('SPIFFE_DEMO_DATA', () => {
  it('exports a defined object', () => {
    expect(SPIFFE_DEMO_DATA).toBeDefined()
  })

  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed', 'unknown']).toContain(SPIFFE_DEMO_DATA.health)
  })

  it('has registration entries array', () => {
    expect(Array.isArray(SPIFFE_DEMO_DATA.entries)).toBe(true)
    expect(SPIFFE_DEMO_DATA.entries.length).toBeGreaterThan(0)
    for (const e of SPIFFE_DEMO_DATA.entries) {
      expect(typeof e.spiffeId).toBe('string')
      expect(e.spiffeId.startsWith('spiffe://')).toBe(true)
    }
  })

  it('has federated domains array', () => {
    expect(Array.isArray(SPIFFE_DEMO_DATA.federatedDomains)).toBe(true)
  })

  it('has a lastCheckTime string', () => {
    expect(typeof SPIFFE_DEMO_DATA.lastCheckTime).toBe('string')
  })

  it('has summary with trust domain and counts', () => {
    const s = SPIFFE_DEMO_DATA.summary
    expect(typeof s.trustDomain).toBe('string')
    expect(s.trustDomain.length).toBeGreaterThan(0)
    expect(typeof s.totalSvids).toBe('number')
    expect(typeof s.totalFederatedDomains).toBe('number')
    expect(typeof s.totalEntries).toBe('number')
    expect(s.totalEntries).toBeGreaterThan(0)
  })

  it('summary.totalEntries matches entries array length', () => {
    expect(SPIFFE_DEMO_DATA.summary.totalEntries).toBe(SPIFFE_DEMO_DATA.entries.length)
  })
})
