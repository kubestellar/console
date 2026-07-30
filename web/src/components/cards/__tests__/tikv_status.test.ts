import { describe, it, expect } from 'vitest'
import {
  TIKV_DEMO_DATA,
  type TikvStoreState,
} from '../../../lib/demo/tikv'

describe('TIKV_DEMO_DATA (card-level)', () => {
  it('has valid health status', () => {
    expect(['healthy', 'degraded', 'not-installed']).toContain(TIKV_DEMO_DATA.health)
  })

  describe('stores', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(TIKV_DEMO_DATA.stores)).toBe(true)
      expect(TIKV_DEMO_DATA.stores.length).toBeGreaterThan(0)
    })

    it('each store has required fields with valid state', () => {
      const validStates: TikvStoreState[] = ['Up', 'Offline', 'Tombstone', 'Down']
      for (const s of TIKV_DEMO_DATA.stores) {
        expect(typeof s.storeId).toBe('number')
        expect(s.storeId).toBeGreaterThan(0)
        expect(typeof s.address).toBe('string')
        expect(s.address.length).toBeGreaterThan(0)
        expect(validStates).toContain(s.state)
        expect(typeof s.version).toBe('string')
        expect(typeof s.regionCount).toBe('number')
        expect(s.regionCount).toBeGreaterThanOrEqual(0)
        expect(typeof s.leaderCount).toBe('number')
        expect(s.leaderCount).toBeGreaterThanOrEqual(0)
      }
    })

    it('each store has valid capacity bytes', () => {
      for (const s of TIKV_DEMO_DATA.stores) {
        expect(typeof s.capacityBytes).toBe('number')
        expect(s.capacityBytes).toBeGreaterThan(0)
        expect(typeof s.availableBytes).toBe('number')
        expect(s.availableBytes).toBeGreaterThanOrEqual(0)
        expect(s.availableBytes).toBeLessThanOrEqual(s.capacityBytes)
      }
    })

    it('leaderCount does not exceed regionCount per store', () => {
      for (const s of TIKV_DEMO_DATA.stores) {
        expect(s.leaderCount).toBeLessThanOrEqual(s.regionCount)
      }
    })
  })

  describe('summary', () => {
    it('totalStores matches stores array', () => {
      expect(TIKV_DEMO_DATA.summary.totalStores).toBe(TIKV_DEMO_DATA.stores.length)
    })

    it('upStores + downStores does not exceed totalStores', () => {
      const { upStores, downStores, totalStores } = TIKV_DEMO_DATA.summary
      expect(upStores + downStores).toBeLessThanOrEqual(totalStores)
    })

    it('totalRegions is sum of store regionCounts', () => {
      const sum = TIKV_DEMO_DATA.stores.reduce((s, st) => s + st.regionCount, 0)
      expect(TIKV_DEMO_DATA.summary.totalRegions).toBe(sum)
    })

    it('totalLeaders is sum of store leaderCounts', () => {
      const sum = TIKV_DEMO_DATA.stores.reduce((s, st) => s + st.leaderCount, 0)
      expect(TIKV_DEMO_DATA.summary.totalLeaders).toBe(sum)
    })

    it('totalLeaders does not exceed totalRegions', () => {
      expect(TIKV_DEMO_DATA.summary.totalLeaders).toBeLessThanOrEqual(
        TIKV_DEMO_DATA.summary.totalRegions,
      )
    })
  })

  it('has valid lastCheckTime', () => {
    expect(new Date(TIKV_DEMO_DATA.lastCheckTime).getTime()).not.toBeNaN()
  })
})
