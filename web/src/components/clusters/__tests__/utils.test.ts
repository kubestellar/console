/**
 * Cluster Utils Tests
 *
 * Tests cluster utility functions for health detection, formatting, and storage.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeSetItem: vi.fn(),
}))

import {
  isClusterUnreachable,
  isClusterHealthy,
  isClusterTokenExpired,
  isClusterNetworkOffline,
  isClusterLoading,
  formatMetadata,
  loadClusterCards,
  saveClusterCards,
} from '../utils'

const makeCluster = (overrides = {}) => ({
  name: 'test-cluster',
  context: 'test-context',
  healthy: true,
  reachable: true,
  nodeCount: 3,
  refreshing: false,
  errorType: undefined,
  ...overrides,
})

describe('isClusterUnreachable', () => {
  it('returns false for reachable cluster', () => {
    expect(isClusterUnreachable(makeCluster() as never)).toBe(false)
  })

  it('returns true when reachable is false', () => {
    expect(isClusterUnreachable(makeCluster({ reachable: false }) as never)).toBe(true)
  })

  it('returns true for timeout error type', () => {
    expect(isClusterUnreachable(makeCluster({ errorType: 'timeout' }) as never)).toBe(true)
  })

  it('returns true for network error type', () => {
    expect(isClusterUnreachable(makeCluster({ errorType: 'network' }) as never)).toBe(true)
  })

  it('returns true for certificate error type', () => {
    expect(isClusterUnreachable(makeCluster({ errorType: 'certificate' }) as never)).toBe(true)
  })

  it('returns true for auth error type', () => {
    expect(isClusterUnreachable(makeCluster({ errorType: 'auth' }) as never)).toBe(true)
  })
})

describe('isClusterHealthy', () => {
  it('returns true when healthy flag is true', () => {
    expect(isClusterHealthy(makeCluster({ healthy: true }) as never)).toBe(true)
  })

  it('returns false when healthy is explicitly false even with nodes', () => {
    // PR #5449: healthy===false is authoritative — node presence does NOT override
    expect(isClusterHealthy(makeCluster({ healthy: false, nodeCount: 1 }) as never)).toBe(false)
  })

  it('returns false when unhealthy with no nodes', () => {
    expect(isClusterHealthy(makeCluster({ healthy: false, nodeCount: 0 }) as never)).toBe(false)
  })
})

describe('isClusterTokenExpired', () => {
  it('returns true for auth error type', () => {
    expect(isClusterTokenExpired(makeCluster({ errorType: 'auth' }) as never)).toBe(true)
  })

  it('returns false for other error types', () => {
    expect(isClusterTokenExpired(makeCluster({ errorType: 'network' }) as never)).toBe(false)
  })
})

describe('isClusterNetworkOffline', () => {
  it('returns true for unreachable non-auth errors', () => {
    expect(isClusterNetworkOffline(makeCluster({ reachable: false, errorType: 'network' }) as never)).toBe(true)
  })

  it('returns false for auth errors (token expired, not network)', () => {
    expect(isClusterNetworkOffline(makeCluster({ reachable: false, errorType: 'auth' }) as never)).toBe(false)
  })

  it('returns false for reachable clusters', () => {
    expect(isClusterNetworkOffline(makeCluster() as never)).toBe(false)
  })
})

describe('isClusterLoading', () => {
  it('returns true when refreshing', () => {
    expect(isClusterLoading(makeCluster({ refreshing: true }) as never)).toBe(true)
  })

  it('returns false when not refreshing', () => {
    expect(isClusterLoading(makeCluster({ refreshing: false }) as never)).toBe(false)
  })
})

describe('formatMetadata', () => {
  it('returns empty string for no metadata', () => {
    expect(formatMetadata()).toBe('')
  })

  it('formats labels', () => {
    const result = formatMetadata({ env: 'prod', app: 'web' })
    expect(result).toContain('Labels:')
    expect(result).toContain('env=prod')
    expect(result).toContain('app=web')
  })

  it('formats annotations', () => {
    const result = formatMetadata(undefined, { 'note': 'hello' })
    expect(result).toContain('Annotations:')
    expect(result).toContain('note=hello')
  })

  it('truncates long annotation values', () => {
    const longValue = 'a'.repeat(100)
    const result = formatMetadata(undefined, { key: longValue })
    expect(result).toContain('...')
  })

  it('shows count for labels beyond limit', () => {
    const labels: Record<string, string> = {}
    const LABELS_SHOWN = 5
    const EXTRA_LABELS = 3
    for (let i = 0; i < LABELS_SHOWN + EXTRA_LABELS; i++) {
      labels[`key${i}`] = `val${i}`
    }
    const result = formatMetadata(labels)
    expect(result).toContain(`${EXTRA_LABELS} more`)
  })
})

describe('loadClusterCards', () => {
  it('returns empty array when no stored data', () => {
    const cards = loadClusterCards()
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBe(0)
  })
})

describe('saveClusterCards', () => {
  it('does not throw when saving cards', () => {
    expect(() => {
      saveClusterCards([{ id: 'test', card_type: 'pod_issues', config: {} }])
    }).not.toThrow()
  })
})
