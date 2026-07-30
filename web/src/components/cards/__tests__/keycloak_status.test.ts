import { describe, it, expect } from 'vitest'
import {
  KEYCLOAK_DEMO_DATA,
  type KeycloakDemoData,
  type KeycloakRealmStatus,
} from '../keycloak_status/demoData'

describe('KEYCLOAK_DEMO_DATA', () => {
  it('is defined', () => {
    expect(KEYCLOAK_DEMO_DATA).toBeDefined()
  })

  it('has valid health status', () => {
    const valid: KeycloakDemoData['health'][] = ['healthy', 'degraded', 'not-installed']
    expect(valid).toContain(KEYCLOAK_DEMO_DATA.health)
  })

  it('has valid lastCheckTime ISO string', () => {
    const t = new Date(KEYCLOAK_DEMO_DATA.lastCheckTime).getTime()
    expect(t).toBeGreaterThan(0)
  })

  describe('operatorPods', () => {
    it('has ready and total counts', () => {
      expect(typeof KEYCLOAK_DEMO_DATA.operatorPods.ready).toBe('number')
      expect(typeof KEYCLOAK_DEMO_DATA.operatorPods.total).toBe('number')
    })

    it('ready does not exceed total', () => {
      expect(KEYCLOAK_DEMO_DATA.operatorPods.ready).toBeLessThanOrEqual(
        KEYCLOAK_DEMO_DATA.operatorPods.total,
      )
    })
  })

  describe('realms', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(KEYCLOAK_DEMO_DATA.realms)).toBe(true)
      expect(KEYCLOAK_DEMO_DATA.realms.length).toBeGreaterThan(0)
    })

    it('each realm has required string fields', () => {
      for (const realm of KEYCLOAK_DEMO_DATA.realms) {
        expect(typeof realm.name).toBe('string')
        expect(realm.name.length).toBeGreaterThan(0)
        expect(typeof realm.namespace).toBe('string')
        expect(typeof realm.cluster).toBe('string')
      }
    })

    it('each realm has valid status', () => {
      const valid: KeycloakRealmStatus[] = ['ready', 'provisioning', 'degraded', 'error']
      for (const realm of KEYCLOAK_DEMO_DATA.realms) {
        expect(valid).toContain(realm.status)
      }
    })

    it('each realm has non-negative numeric counters', () => {
      for (const realm of KEYCLOAK_DEMO_DATA.realms) {
        expect(realm.clients).toBeGreaterThanOrEqual(0)
        expect(realm.users).toBeGreaterThanOrEqual(0)
        expect(realm.activeSessions).toBeGreaterThanOrEqual(0)
        expect(typeof realm.enabled).toBe('boolean')
      }
    })

    it('covers all four status variants', () => {
      const statuses = new Set(KEYCLOAK_DEMO_DATA.realms.map(r => r.status))
      expect(statuses.has('ready')).toBe(true)
      expect(statuses.has('degraded')).toBe(true)
      expect(statuses.has('provisioning')).toBe(true)
      expect(statuses.has('error')).toBe(true)
    })
  })

  describe('totals', () => {
    it('totalClients matches sum of realm clients', () => {
      const sum = KEYCLOAK_DEMO_DATA.realms.reduce((acc, r) => acc + r.clients, 0)
      expect(KEYCLOAK_DEMO_DATA.totalClients).toBe(sum)
    })

    it('totalUsers matches sum of realm users', () => {
      const sum = KEYCLOAK_DEMO_DATA.realms.reduce((acc, r) => acc + r.users, 0)
      expect(KEYCLOAK_DEMO_DATA.totalUsers).toBe(sum)
    })

    it('totalActiveSessions matches sum of realm activeSessions', () => {
      const sum = KEYCLOAK_DEMO_DATA.realms.reduce((acc, r) => acc + r.activeSessions, 0)
      expect(KEYCLOAK_DEMO_DATA.totalActiveSessions).toBe(sum)
    })

    it('all totals are positive', () => {
      expect(KEYCLOAK_DEMO_DATA.totalClients).toBeGreaterThan(0)
      expect(KEYCLOAK_DEMO_DATA.totalUsers).toBeGreaterThan(0)
      expect(KEYCLOAK_DEMO_DATA.totalActiveSessions).toBeGreaterThan(0)
    })
  })
})
