/**
 * Tests for hooks/mcp/sharedImpl.state.ts — pure subscriber management
 * and cache-update logic.
 *
 * Scope: subscribeClusterCache/Data/UI, notifyCluster*Subscribers,
 * clearClusterCacheOnLogout, updateClusterCache (partial), updateSingleClusterInCache,
 * initialFetchStarted getter/setter.
 *
 * Heavy module-level side effects (localStorage reads, demo-mode subscriptions,
 * modeTransition registration) are neutralised by mocking all transitive
 * imports before the module is loaded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Prevent side-effect imports from blowing up ───────────────────────────────

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, startTransition: (cb: () => void) => cb() }
})

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: vi.fn(() => false),
  isNetlifyDeployment: false,
  subscribeDemoMode: vi.fn(),
}))

vi.mock('../../../lib/modeTransition', () => ({
  registerCacheReset: vi.fn(),
  triggerAllRefetches: vi.fn(),
}))

vi.mock('../../../lib/cache', () => ({
  resetAllCacheFailures: vi.fn(),
}))

vi.mock('../clusterCacheRef', () => ({
  setClusterCacheRefClusters: vi.fn(),
}))

vi.mock('../clusterUtils', () => ({
  shareMetricsBetweenSameServerClusters: vi.fn((clusters: unknown[]) => clusters),
}))

vi.mock('../sharedImpl.persistence', () => ({
  CLUSTER_CACHE_KEY: 'cluster-cache',
  CLUSTER_DIST_CACHE_KEY: 'cluster-dist-cache',
  applyDistributionCache: vi.fn((clusters: unknown[]) => clusters),
  updateDistributionCache: vi.fn(),
  loadClusterCacheFromStorage: vi.fn(() => []),
  saveClusterCacheToStorage: vi.fn(),
  mergeWithStoredClusters: vi.fn((clusters: unknown[]) => clusters),
  getLiveClustersForFallback: vi.fn((clusters: unknown[]) => clusters),
}))

vi.mock('../sharedImpl.demo', () => ({
  getDemoClusters: vi.fn(() => []),
}))

vi.mock('../sharedImpl.constants', () => ({
  CLUSTER_NOTIFY_DEBOUNCE_MS: 0,
}))

vi.mock('../sharedImpl.types', () => ({
  updatesTouchData: vi.fn(() => true),
  updatesTouchUI: vi.fn(() => true),
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import {
  subscribeClusterCache,
  subscribeClusterData,
  subscribeClusterUI,
  notifyClusterDataSubscribers,
  notifyClusterUISubscribers,
  notifyClusterSubscribers,
  clearClusterCacheOnLogout,
  setInitialFetchStarted,
  getInitialFetchStarted,
  clusterCache,
  updateClusterCache,
  dataSubscribers,
  uiSubscribers,
  clusterSubscribers,
} from '../sharedImpl.state'

beforeEach(() => {
  // Clear subscriber sets so tests are isolated
  dataSubscribers.clear()
  uiSubscribers.clear()
  clusterSubscribers.clear()
})

// ── subscribeClusterCache ─────────────────────────────────────────────────────

describe('subscribeClusterCache', () => {
  it('adds callback to clusterSubscribers set', () => {
    const cb = vi.fn()
    subscribeClusterCache(cb)
    expect(clusterSubscribers.has(cb)).toBe(true)
  })

  it('returns unsubscribe fn that removes the callback', () => {
    const cb = vi.fn()
    const unsub = subscribeClusterCache(cb)
    unsub()
    expect(clusterSubscribers.has(cb)).toBe(false)
  })
})

// ── subscribeClusterData ──────────────────────────────────────────────────────

describe('subscribeClusterData', () => {
  it('adds callback to dataSubscribers set', () => {
    const cb = vi.fn()
    subscribeClusterData(cb)
    expect(dataSubscribers.has(cb)).toBe(true)
  })

  it('returns unsubscribe fn that removes the callback', () => {
    const cb = vi.fn()
    const unsub = subscribeClusterData(cb)
    unsub()
    expect(dataSubscribers.has(cb)).toBe(false)
  })
})

// ── subscribeClusterUI ────────────────────────────────────────────────────────

describe('subscribeClusterUI', () => {
  it('adds callback to uiSubscribers set', () => {
    const cb = vi.fn()
    subscribeClusterUI(cb)
    expect(uiSubscribers.has(cb)).toBe(true)
  })

  it('returns unsubscribe fn that removes the callback', () => {
    const cb = vi.fn()
    const unsub = subscribeClusterUI(cb)
    unsub()
    expect(uiSubscribers.has(cb)).toBe(false)
  })
})

// ── notifyClusterDataSubscribers ──────────────────────────────────────────────

describe('notifyClusterDataSubscribers', () => {
  it('calls all data subscribers with current cache snapshot', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    subscribeClusterData(cb1)
    subscribeClusterData(cb2)
    notifyClusterDataSubscribers()
    expect(cb1).toHaveBeenCalledOnce()
    expect(cb2).toHaveBeenCalledOnce()
    expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ clusters: expect.any(Array) }))
  })

  it('does not call UI subscribers', () => {
    const uiCb = vi.fn()
    subscribeClusterUI(uiCb)
    notifyClusterDataSubscribers()
    expect(uiCb).not.toHaveBeenCalled()
  })
})

// ── notifyClusterUISubscribers ────────────────────────────────────────────────

describe('notifyClusterUISubscribers', () => {
  it('calls all UI subscribers with current cache snapshot', () => {
    const cb = vi.fn()
    subscribeClusterUI(cb)
    notifyClusterUISubscribers()
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ clusters: expect.any(Array) }))
  })

  it('does not call data subscribers', () => {
    const dataCb = vi.fn()
    subscribeClusterData(dataCb)
    notifyClusterUISubscribers()
    expect(dataCb).not.toHaveBeenCalled()
  })
})

// ── notifyClusterSubscribers ──────────────────────────────────────────────────

describe('notifyClusterSubscribers', () => {
  it('calls legacy, UI, and data subscribers', () => {
    const legacyCb = vi.fn()
    const uiCb = vi.fn()
    const dataCb = vi.fn()
    subscribeClusterCache(legacyCb)
    subscribeClusterUI(uiCb)
    subscribeClusterData(dataCb)
    notifyClusterSubscribers()
    expect(legacyCb).toHaveBeenCalledOnce()
    expect(uiCb).toHaveBeenCalledOnce()
    expect(dataCb).toHaveBeenCalledOnce()
  })

  it('passes the same cache snapshot to all subscribers', () => {
    const snapshots: unknown[] = []
    subscribeClusterCache((s) => snapshots.push(s))
    subscribeClusterUI((s) => snapshots.push(s))
    notifyClusterSubscribers()
    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toBe(snapshots[1])
  })
})

// ── initialFetchStarted getter/setter ────────────────────────────────────────

describe('initialFetchStarted', () => {
  it('defaults to false', () => {
    expect(getInitialFetchStarted()).toBe(false)
  })

  it('can be set to true', () => {
    setInitialFetchStarted(true)
    expect(getInitialFetchStarted()).toBe(true)
  })

  it('can be reset to false', () => {
    setInitialFetchStarted(true)
    setInitialFetchStarted(false)
    expect(getInitialFetchStarted()).toBe(false)
  })
})

// ── clearClusterCacheOnLogout ─────────────────────────────────────────────────

describe('clearClusterCacheOnLogout', () => {
  it('resets isLoading to true', () => {
    clearClusterCacheOnLogout()
    expect(clusterCache.isLoading).toBe(true)
  })

  it('clears clusters to empty array', () => {
    // Seed some clusters
    updateClusterCache({ clusters: [{ name: 'prod' } as never] })
    clearClusterCacheOnLogout()
    expect(clusterCache.clusters).toEqual([])
  })

  it('resets error and failure counters', () => {
    clearClusterCacheOnLogout()
    expect(clusterCache.error).toBeNull()
    expect(clusterCache.consecutiveFailures).toBe(0)
    expect(clusterCache.isFailed).toBe(false)
    expect(clusterCache.isRefreshing).toBe(false)
  })

  it('notifies subscribers after logout clear', () => {
    const cb = vi.fn()
    subscribeClusterCache(cb)
    clearClusterCacheOnLogout()
    expect(cb).toHaveBeenCalled()
  })
})

// ── updateClusterCache ────────────────────────────────────────────────────────

describe('updateClusterCache', () => {
  it('applies partial updates to clusterCache in place', () => {
    updateClusterCache({ isRefreshing: true })
    expect(clusterCache.isRefreshing).toBe(true)
    updateClusterCache({ isRefreshing: false })
    expect(clusterCache.isRefreshing).toBe(false)
  })

  it('notifies UI subscribers on ui-touching update', () => {
    const uiCb = vi.fn()
    subscribeClusterUI(uiCb)
    updateClusterCache({ isLoading: false })
    expect(uiCb).toHaveBeenCalled()
  })
})
