import { describe, it, expect, beforeEach } from 'vitest'
import {
  getClusterHealthState,
  isClusterHealthy,
  isClusterUnreachable,
  isClusterTokenExpired,
  isClusterNetworkOffline,
  summarizeClusterHealth,
  isClusterLoading,
  formatMetadata,
  loadClusterCards,
  saveClusterCards,
} from './utils'
import type { ClusterInfo } from '../../hooks/useMCP'

describe('getClusterHealthState', () => {
  it('returns unknown for never connected cluster', () => {
    const cluster = { neverConnected: true } as ClusterInfo
    expect(getClusterHealthState(cluster)).toBe('unknown')
  })

  it('returns unreachable when reachable is false', () => {
    const cluster = { reachable: false } as ClusterInfo
    expect(getClusterHealthState(cluster)).toBe('unreachable')
  })

  it('returns unreachable for auth error type', () => {
    const cluster = { errorType: 'auth' } as ClusterInfo
    expect(getClusterHealthState(cluster)).toBe('unreachable')
  })

  it('returns healthy when healthy is true', () => {
    const cluster = { healthy: true } as ClusterInfo
    expect(getClusterHealthState(cluster)).toBe('healthy')
  })

  it('returns unhealthy when healthy is false', () => {
    const cluster = { healthy: false } as ClusterInfo
    expect(getClusterHealthState(cluster)).toBe('unhealthy')
  })

  it('returns loading when refreshing with no node data', () => {
    const cluster = { refreshing: true, nodeCount: 0 } as ClusterInfo
    expect(getClusterHealthState(cluster)).toBe('loading')
  })
})

describe('isClusterHealthy', () => {
  it('returns true for healthy cluster', () => {
    const cluster = { healthy: true } as ClusterInfo
    expect(isClusterHealthy(cluster)).toBe(true)
  })

  it('returns false for unhealthy cluster', () => {
    const cluster = { healthy: false } as ClusterInfo
    expect(isClusterHealthy(cluster)).toBe(false)
  })
})

describe('isClusterUnreachable', () => {
  it('returns true when reachable is false', () => {
    const cluster = { reachable: false } as ClusterInfo
    expect(isClusterUnreachable(cluster)).toBe(true)
  })

  it('returns true for auth error type', () => {
    const cluster = { errorType: 'auth' } as ClusterInfo
    expect(isClusterUnreachable(cluster)).toBe(true)
  })

  it('returns false for reachable cluster', () => {
    const cluster = { reachable: true } as ClusterInfo
    expect(isClusterUnreachable(cluster)).toBe(false)
  })
})

describe('isClusterTokenExpired', () => {
  it('returns true for auth error type', () => {
    const cluster = { errorType: 'auth' } as ClusterInfo
    expect(isClusterTokenExpired(cluster)).toBe(true)
  })

  it('returns false for other error types', () => {
    const cluster = { errorType: 'network' } as ClusterInfo
    expect(isClusterTokenExpired(cluster)).toBe(false)
  })
})

describe('isClusterNetworkOffline', () => {
  it('returns true for unreachable cluster with network error', () => {
    const cluster = { reachable: false, errorType: 'network' } as ClusterInfo
    expect(isClusterNetworkOffline(cluster)).toBe(true)
  })

  it('returns false for reachable cluster', () => {
    const cluster = { reachable: true } as ClusterInfo
    expect(isClusterNetworkOffline(cluster)).toBe(false)
  })
})

describe('summarizeClusterHealth', () => {
  it('counts healthy clusters correctly', () => {
    const clusters = [
      { healthy: true } as ClusterInfo,
      { healthy: true } as ClusterInfo,
    ]
    const summary = summarizeClusterHealth(clusters)
    expect(summary.healthy).toBe(2)
  })

  it('counts unreachable clusters correctly', () => {
    const clusters = [
      { reachable: false } as ClusterInfo,
      { errorType: 'network' } as ClusterInfo,
    ]
    const summary = summarizeClusterHealth(clusters)
    expect(summary.unreachable).toBe(2)
  })

  it('returns zero counts for empty array', () => {
    const summary = summarizeClusterHealth([])
    expect(summary.healthy).toBe(0)
    expect(summary.unhealthy).toBe(0)
    expect(summary.unreachable).toBe(0)
  })
})

describe('isClusterLoading', () => {
  it('returns true when refreshing is true', () => {
    const cluster = { refreshing: true } as ClusterInfo
    expect(isClusterLoading(cluster)).toBe(true)
  })

  it('returns false when refreshing is false', () => {
    const cluster = { refreshing: false } as ClusterInfo
    expect(isClusterLoading(cluster)).toBe(false)
  })
})

describe('formatMetadata', () => {
  it('formats labels correctly', () => {
    const labels = { app: 'nginx', tier: 'frontend' }
    const result = formatMetadata(labels, undefined)
    expect(result).toContain('Labels:')
    expect(result).toContain('app=nginx')
  })

  it('returns empty string for no metadata', () => {
    const result = formatMetadata(undefined, undefined)
    expect(result).toBe('')
  })
})

describe('loadClusterCards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty array when no cards are saved', () => {
    const cards = loadClusterCards()
    expect(cards).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem('kubestellar-clusters-cards', 'invalid-json')
    const cards = loadClusterCards()
    expect(cards).toEqual([])
  })

  it('loads saved cards correctly', () => {
    const testCards = [
      { id: 'card-1', card_type: 'test', config: {} },
    ]
    localStorage.setItem('kubestellar-clusters-cards', JSON.stringify(testCards))
    const cards = loadClusterCards()
    expect(cards).toEqual(testCards)
  })
})

describe('saveClusterCards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves cards to localStorage', () => {
    const testCards = [{ id: 'card-1', card_type: 'test', config: {} }]
    saveClusterCards(testCards)
    const stored = localStorage.getItem('kubestellar-clusters-cards')
    expect(stored).toBe(JSON.stringify(testCards))
  })
})
