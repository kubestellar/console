import { describe, it, expect } from 'vitest'
import { TIKV_DEMO_DATA } from '../tikv'

describe('tikv demo data', () => {
  it('has a valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(TIKV_DEMO_DATA.health)
  })

  it('has stores with required fields', () => {
    expect(TIKV_DEMO_DATA.stores.length).toBeGreaterThan(0)
    for (const s of TIKV_DEMO_DATA.stores) {
      expect(typeof s.storeId).toBe('number')
      expect(s.address).toBeTruthy()
      expect(s.state).toBeTruthy()
      expect(typeof s.regionCount).toBe('number')
      expect(typeof s.leaderCount).toBe('number')
    }
  })

  it('has consistent summary', () => {
    const { summary, stores } = TIKV_DEMO_DATA
    expect(summary.totalStores).toBe(stores.length)
    expect(summary.upStores + summary.downStores).toBeLessThanOrEqual(summary.totalStores)
    expect(summary.totalRegions).toBeGreaterThan(0)
  })

  it('has a lastCheckTime', () => {
    expect(TIKV_DEMO_DATA.lastCheckTime).toBeTruthy()
  })
})
