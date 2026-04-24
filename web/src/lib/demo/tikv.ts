/**
 * TiKV Status Card — Demo Data & Type Definitions
 *
 * Models TiKV store nodes for the TiKV (CNCF graduated) distributed
 * key-value store. Each store reports region/leader counts and capacity
 * utilization so operators can spot hotspots or uneven leader distribution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TikvStoreState = 'Up' | 'Offline' | 'Tombstone' | 'Down'

export interface TikvStore {
  storeId: number
  address: string
  state: TikvStoreState
  version: string
  regionCount: number
  leaderCount: number
  /** Total store capacity in bytes. */
  capacityBytes: number
  /** Available capacity in bytes. */
  availableBytes: number
}

export interface TikvSummary {
  totalStores: number
  upStores: number
  downStores: number
  totalRegions: number
  totalLeaders: number
}

export interface TikvStatusData {
  health: 'healthy' | 'degraded' | 'not-installed'
  stores: TikvStore[]
  summary: TikvSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data — shown when TiKV is not installed or in demo mode
// ---------------------------------------------------------------------------

// Named constants (no magic numbers)
const BYTES_PER_GIB = 1024 * 1024 * 1024
const DEMO_CAPACITY_GIB = 500
const DEMO_AVAILABLE_GIB_HEALTHY = 320
const DEMO_AVAILABLE_GIB_WARM = 180
const DEMO_AVAILABLE_GIB_LOW = 90

const DEMO_STORES: TikvStore[] = [
  {
    storeId: 1,
    address: 'tikv-0.tikv-peer.tidb:20160',
    state: 'Up',
    version: '7.5.1',
    regionCount: 1248,
    leaderCount: 420,
    capacityBytes: DEMO_CAPACITY_GIB * BYTES_PER_GIB,
    availableBytes: DEMO_AVAILABLE_GIB_HEALTHY * BYTES_PER_GIB,
  },
  {
    storeId: 2,
    address: 'tikv-1.tikv-peer.tidb:20160',
    state: 'Up',
    version: '7.5.1',
    regionCount: 1256,
    leaderCount: 416,
    capacityBytes: DEMO_CAPACITY_GIB * BYTES_PER_GIB,
    availableBytes: DEMO_AVAILABLE_GIB_WARM * BYTES_PER_GIB,
  },
  {
    storeId: 3,
    address: 'tikv-2.tikv-peer.tidb:20160',
    state: 'Up',
    version: '7.5.1',
    regionCount: 1233,
    leaderCount: 412,
    capacityBytes: DEMO_CAPACITY_GIB * BYTES_PER_GIB,
    availableBytes: DEMO_AVAILABLE_GIB_HEALTHY * BYTES_PER_GIB,
  },
  {
    storeId: 4,
    address: 'tikv-3.tikv-peer.tidb:20160',
    state: 'Down',
    version: '7.5.1',
    regionCount: 0,
    leaderCount: 0,
    capacityBytes: DEMO_CAPACITY_GIB * BYTES_PER_GIB,
    availableBytes: DEMO_AVAILABLE_GIB_LOW * BYTES_PER_GIB,
  },
]

const DEMO_TOTAL_REGIONS = DEMO_STORES.reduce((acc, s) => acc + s.regionCount, 0)
const DEMO_TOTAL_LEADERS = DEMO_STORES.reduce((acc, s) => acc + s.leaderCount, 0)
const DEMO_UP_STORES = DEMO_STORES.filter(s => s.state === 'Up').length
const DEMO_DOWN_STORES = DEMO_STORES.length - DEMO_UP_STORES

export const TIKV_DEMO_DATA: TikvStatusData = {
  health: 'degraded',
  stores: DEMO_STORES,
  summary: {
    totalStores: DEMO_STORES.length,
    upStores: DEMO_UP_STORES,
    downStores: DEMO_DOWN_STORES,
    totalRegions: DEMO_TOTAL_REGIONS,
    totalLeaders: DEMO_TOTAL_LEADERS,
  },
  lastCheckTime: new Date().toISOString(),
}
