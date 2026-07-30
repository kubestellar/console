import { describe, it, expect } from 'vitest'
import {
  TUF_DEMO_DATA,
  type TufHealth,
  type TufRoleName,
  type TufMetadataStatus,
} from '../../../lib/demo/tuf'

describe('TUF_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    const valid: TufHealth[] = ['healthy', 'degraded', 'not-installed', 'unknown']
    expect(valid).toContain(TUF_DEMO_DATA.health)
  })

  it('has a specVersion string', () => {
    expect(typeof TUF_DEMO_DATA.specVersion).toBe('string')
    expect(TUF_DEMO_DATA.specVersion.length).toBeGreaterThan(0)
  })

  it('has a repository string', () => {
    expect(typeof TUF_DEMO_DATA.repository).toBe('string')
    expect(TUF_DEMO_DATA.repository.length).toBeGreaterThan(0)
  })

  describe('roles', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(TUF_DEMO_DATA.roles)).toBe(true)
      expect(TUF_DEMO_DATA.roles.length).toBeGreaterThan(0)
    })

    it('each role has required fields', () => {
      const validNames: TufRoleName[] = ['root', 'targets', 'snapshot', 'timestamp']
      const validStatuses: TufMetadataStatus[] = [
        'signed', 'unsigned', 'expired', 'expiring-soon',
      ]
      for (const r of TUF_DEMO_DATA.roles) {
        expect(validNames).toContain(r.name)
        expect(typeof r.version).toBe('number')
        expect(r.version).toBeGreaterThan(0)
        expect(typeof r.expiresAt).toBe('string')
        expect(new Date(r.expiresAt).getTime()).not.toBeNaN()
        expect(typeof r.threshold).toBe('number')
        expect(r.threshold).toBeGreaterThan(0)
        expect(typeof r.keyCount).toBe('number')
        expect(r.keyCount).toBeGreaterThanOrEqual(r.threshold)
        expect(validStatuses).toContain(r.status)
      }
    })

    it('covers all four TUF roles', () => {
      const names = new Set(TUF_DEMO_DATA.roles.map(r => r.name))
      expect(names.has('root')).toBe(true)
      expect(names.has('targets')).toBe(true)
      expect(names.has('snapshot')).toBe(true)
      expect(names.has('timestamp')).toBe(true)
    })
  })

  describe('summary', () => {
    it('totalRoles matches roles array', () => {
      expect(TUF_DEMO_DATA.summary.totalRoles).toBe(TUF_DEMO_DATA.roles.length)
    })

    it('signed + expired + expiringSoon does not exceed total', () => {
      const { signedRoles, expiredRoles, expiringSoonRoles, totalRoles } = TUF_DEMO_DATA.summary
      expect(signedRoles + expiredRoles + expiringSoonRoles).toBeLessThanOrEqual(totalRoles)
    })

    it('signedRoles matches roles with signed status', () => {
      const signed = TUF_DEMO_DATA.roles.filter(r => r.status === 'signed').length
      expect(TUF_DEMO_DATA.summary.signedRoles).toBe(signed)
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(TUF_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
