import { describe, it, expect } from 'vitest'
import {
  SPIFFE_DEMO_DATA,
  type SpiffeHealth,
  type SvidType,
  type FederationStatus,
} from '../spiffe_status/demoData'

describe('SPIFFE_DEMO_DATA', () => {
  it('is defined', () => {
    expect(SPIFFE_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const validHealth: SpiffeHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(validHealth).toContain(SPIFFE_DEMO_DATA.health)
  })

  it('has entries array with entries', () => {
    expect(Array.isArray(SPIFFE_DEMO_DATA.entries)).toBe(true)
    expect(SPIFFE_DEMO_DATA.entries.length).toBeGreaterThan(0)
  })

  it('each registration entry has required fields', () => {
    const validSvidTypes: SvidType[] = ['x509', 'jwt']
    for (const entry of SPIFFE_DEMO_DATA.entries) {
      expect(typeof entry.spiffeId).toBe('string')
      expect(entry.spiffeId).toMatch(/^spiffe:\/\//)
      expect(typeof entry.parentId).toBe('string')
      expect(typeof entry.selector).toBe('string')
      expect(validSvidTypes).toContain(entry.svidType)
      expect(typeof entry.ttlSeconds).toBe('number')
      expect(entry.ttlSeconds).toBeGreaterThan(0)
      expect(typeof entry.cluster).toBe('string')
    }
  })

  it('has federatedDomains array', () => {
    expect(Array.isArray(SPIFFE_DEMO_DATA.federatedDomains)).toBe(true)
  })

  it('each federated domain has required fields', () => {
    const validStatus: FederationStatus[] = ['active', 'pending', 'failed']
    for (const domain of SPIFFE_DEMO_DATA.federatedDomains) {
      expect(typeof domain.trustDomain).toBe('string')
      expect(typeof domain.bundleEndpoint).toBe('string')
      expect(validStatus).toContain(domain.status)
    }
  })

  it('has stats with required fields', () => {
    expect(typeof SPIFFE_DEMO_DATA.stats.x509SvidCount).toBe('number')
    expect(typeof SPIFFE_DEMO_DATA.stats.jwtSvidCount).toBe('number')
    expect(typeof SPIFFE_DEMO_DATA.stats.registrationEntryCount).toBe('number')
    expect(typeof SPIFFE_DEMO_DATA.stats.agentCount).toBe('number')
    expect(typeof SPIFFE_DEMO_DATA.stats.serverVersion).toBe('string')
  })

  it('has summary with required fields', () => {
    expect(typeof SPIFFE_DEMO_DATA.summary.trustDomain).toBe('string')
    expect(typeof SPIFFE_DEMO_DATA.summary.totalSvids).toBe('number')
    expect(typeof SPIFFE_DEMO_DATA.summary.totalFederatedDomains).toBe('number')
    expect(typeof SPIFFE_DEMO_DATA.summary.totalEntries).toBe('number')
  })
})
