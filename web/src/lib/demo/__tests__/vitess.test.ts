import { describe, it, expect } from 'vitest'
import { VITESS_DEMO_DATA } from '../vitess'

describe('vitess demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(VITESS_DEMO_DATA.health)
  })

  it('has keyspaces with required fields', () => {
    expect(VITESS_DEMO_DATA.keyspaces.length).toBeGreaterThan(0)
    for (const k of VITESS_DEMO_DATA.keyspaces) {
      expect(k.name).toBeTruthy()
      expect(typeof k.tabletCount).toBe('number')
    }
  })

  it('has tablets with required fields', () => {
    expect(VITESS_DEMO_DATA.tablets.length).toBeGreaterThan(0)
    for (const t of VITESS_DEMO_DATA.tablets) {
      expect(t.alias).toBeTruthy()
      expect(t.keyspace).toBeTruthy()
      expect(t.type).toBeTruthy()
      expect(t.state).toBeTruthy()
    }
  })

  it('has consistent summary counts', () => {
    const { summary } = VITESS_DEMO_DATA
    expect(summary.totalKeyspaces).toBe(VITESS_DEMO_DATA.keyspaces.length)
    expect(summary.totalTablets).toBe(VITESS_DEMO_DATA.tablets.length)
    expect(summary.primaryTablets + summary.replicaTablets + summary.rdonlyTablets)
      .toBe(summary.totalTablets)
  })

  it('has a lastCheckTime', () => {
    expect(VITESS_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
