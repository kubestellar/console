/**
 * Tests for alertRulesEngine.ts — covers the three exported pure functions:
 * generateId, isLocalDevCluster, and shallowEqualRecords.
 *
 * The main createAlertRulesEngine factory requires full React + MCP context
 * wiring and is exercised by integration tests. These unit tests target the
 * side-effect-free helpers that are independently testable.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../alertStorage', () => ({
  DEFAULT_TEMPERATURE_THRESHOLD_F: 100,
  DEFAULT_WIND_SPEED_THRESHOLD_MPH: 40,
  MAX_ALERTS: 500,
}))

vi.mock('../notifications', () => ({
  isClusterUnreachable: vi.fn(() => false),
}))

vi.mock('../alerts/deduplication', () => ({
  alertDedupKey: (...args: unknown[]) => args.join('|'),
}))

import { generateId, isLocalDevCluster, shallowEqualRecords } from '../alertRulesEngine'

// ── generateId ────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateId()).toBe('string')
    expect(generateId().length).toBeGreaterThan(0)
  })

  it('starts with "alert_" prefix', () => {
    expect(generateId()).toMatch(/^alert_/)
  })

  it('generates unique IDs across consecutive calls', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateId()))
    expect(ids.size).toBe(10)
  })
})

// ── isLocalDevCluster ─────────────────────────────────────────────────────

describe('isLocalDevCluster', () => {
  it('returns true for k3d distribution', () => {
    expect(isLocalDevCluster({ distribution: 'k3d' })).toBe(true)
  })

  it('returns true for k3s distribution', () => {
    expect(isLocalDevCluster({ distribution: 'k3s' })).toBe(true)
  })

  it('returns true for kind distribution', () => {
    expect(isLocalDevCluster({ distribution: 'kind' })).toBe(true)
  })

  it('returns true for minikube distribution', () => {
    expect(isLocalDevCluster({ distribution: 'minikube' })).toBe(true)
  })

  it('returns false for cloud distribution without local server', () => {
    expect(isLocalDevCluster({ distribution: 'eks', server: 'https://remote.example.com' })).toBe(false)
  })

  it('returns false when no distribution and no server', () => {
    expect(isLocalDevCluster({})).toBe(false)
  })

  it('returns true for localhost server', () => {
    expect(isLocalDevCluster({ server: 'https://localhost:6443' })).toBe(true)
  })

  it('returns true for 127.0.0.1 server', () => {
    expect(isLocalDevCluster({ server: 'https://127.0.0.1:6443' })).toBe(true)
  })

  it('returns false for remote server with no distribution', () => {
    expect(isLocalDevCluster({ server: 'https://10.0.0.1:6443' })).toBe(false)
  })

  it('distribution check takes priority over server', () => {
    // Distribution matches → true even for a non-local server URL
    expect(isLocalDevCluster({ distribution: 'kind', server: 'https://remote.example.com' })).toBe(true)
  })
})

// ── shallowEqualRecords ───────────────────────────────────────────────────

describe('shallowEqualRecords', () => {
  it('returns true when both are null', () => {
    expect(shallowEqualRecords(null, null)).toBe(true)
  })

  it('returns true when both are undefined', () => {
    expect(shallowEqualRecords(undefined, undefined)).toBe(true)
  })

  it('returns true for null and undefined', () => {
    expect(shallowEqualRecords(null, undefined)).toBe(true)
  })

  it('returns false when first is null and second is object', () => {
    expect(shallowEqualRecords(null, { a: 1 })).toBe(false)
  })

  it('returns false when first is object and second is null', () => {
    expect(shallowEqualRecords({ a: 1 }, null)).toBe(false)
  })

  it('returns true for equal shallow objects', () => {
    expect(shallowEqualRecords({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
  })

  it('returns false for objects with different values', () => {
    expect(shallowEqualRecords({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns false when key counts differ', () => {
    expect(shallowEqualRecords({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('returns true for two empty objects', () => {
    expect(shallowEqualRecords({}, {})).toBe(true)
  })

  it('does not recurse into nested objects (shallow comparison)', () => {
    const nested = { x: 1 }
    // Same reference → equal; different reference with same content → not equal
    expect(shallowEqualRecords({ a: nested }, { a: nested })).toBe(true)
    expect(shallowEqualRecords({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false)
  })
})
