/**
 * Unit tests for hooks/mcp/sharedImpl.constants.ts
 *
 * Covers the exported function getEffectiveInterval and verifies
 * the exported constants have expected values.
 */
import { describe, it, expect } from 'vitest'
import {
  getEffectiveInterval,
  CLUSTER_POLL_INTERVAL_MS,
  GPU_POLL_INTERVAL_MS,
  CACHE_TTL_MS,
  CLUSTER_NOTIFY_DEBOUNCE_MS,
  MIN_REFRESH_INDICATOR_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
  MAX_HEALTH_CHECK_FAILURES,
  MAX_DISTRIBUTION_FAILURES,
  HEALTH_CHECK_CONCURRENCY,
  WS_BACKEND_RECHECK_INTERVAL,
} from '../sharedImpl.constants'

// ── getEffectiveInterval ──────────────────────────────────────────────────────

describe('getEffectiveInterval', () => {
  const BASE = 60_000 // 60 seconds — mirrors CLUSTER_POLL_INTERVAL_MS

  it('returns base interval when failures is 0', () => {
    expect(getEffectiveInterval(BASE, 0)).toBe(BASE)
  })

  it('returns base interval when failures is omitted (default 0)', () => {
    expect(getEffectiveInterval(BASE)).toBe(BASE)
  })

  it('returns base interval when failures is negative', () => {
    expect(getEffectiveInterval(BASE, -1)).toBe(BASE)
  })

  it('doubles base interval on 1 failure (2^1 = 2)', () => {
    expect(getEffectiveInterval(BASE, 1)).toBe(BASE * 2)
  })

  it('quadruples on 2 failures (2^2 = 4)', () => {
    expect(getEffectiveInterval(BASE, 2)).toBe(BASE * 4)
  })

  it('8x on 3 failures (2^3 = 8)', () => {
    expect(getEffectiveInterval(BASE, 3)).toBe(BASE * 8)
  })

  it('caps at MAX_BACKOFF_INTERVAL_MS on 4 failures (60k * 16 = 960k > 600k)', () => {
    expect(getEffectiveInterval(BASE, 4)).toBe(600_000)
  })

  it('caps at MAX_BACKOFF_INTERVAL_MS on 5 failures', () => {
    expect(getEffectiveInterval(BASE, 5)).toBe(600_000)
  })

  it('caps exponent at 5 — 6+ failures same as 5', () => {
    expect(getEffectiveInterval(BASE, 6)).toBe(getEffectiveInterval(BASE, 5))
    expect(getEffectiveInterval(BASE, 100)).toBe(getEffectiveInterval(BASE, 5))
  })

  it('caps result at MAX_BACKOFF_INTERVAL_MS (600 000ms)', () => {
    // 1 s base × 2^5 = 32 s — under cap
    expect(getEffectiveInterval(1_000, 5)).toBe(32_000)
    // 30 s base × 2^5 = 960 s — over cap → 600 000 ms
    expect(getEffectiveInterval(30_000, 5)).toBe(600_000)
  })

  it('uses correct cap: exactly 600 000 ms', () => {
    // Choose a base that, even at the minimum 1 failure multiplier (2), exceeds cap
    expect(getEffectiveInterval(600_001, 1)).toBe(600_000)
  })
})

// ── constant values ───────────────────────────────────────────────────────────

describe('sharedImpl.constants exports', () => {
  it('CLUSTER_POLL_INTERVAL_MS is 60 000', () => {
    expect(CLUSTER_POLL_INTERVAL_MS).toBe(60_000)
  })

  it('GPU_POLL_INTERVAL_MS is 30 000', () => {
    expect(GPU_POLL_INTERVAL_MS).toBe(30_000)
  })

  it('CACHE_TTL_MS equals CLUSTER_POLL_INTERVAL_MS', () => {
    expect(CACHE_TTL_MS).toBe(CLUSTER_POLL_INTERVAL_MS)
  })

  it('CLUSTER_NOTIFY_DEBOUNCE_MS is 50', () => {
    expect(CLUSTER_NOTIFY_DEBOUNCE_MS).toBe(50)
  })

  it('MIN_REFRESH_INDICATOR_MS is 500', () => {
    expect(MIN_REFRESH_INDICATOR_MS).toBe(500)
  })

  it('MAX_RECONNECT_ATTEMPTS is 3', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(3)
  })

  it('RECONNECT_BASE_DELAY_MS is 5 000', () => {
    expect(RECONNECT_BASE_DELAY_MS).toBe(5_000)
  })

  it('MAX_HEALTH_CHECK_FAILURES is 3', () => {
    expect(MAX_HEALTH_CHECK_FAILURES).toBe(3)
  })

  it('MAX_DISTRIBUTION_FAILURES is 2', () => {
    expect(MAX_DISTRIBUTION_FAILURES).toBe(2)
  })

  it('HEALTH_CHECK_CONCURRENCY is 6', () => {
    expect(HEALTH_CHECK_CONCURRENCY).toBe(6)
  })

  it('WS_BACKEND_RECHECK_INTERVAL is 120 000', () => {
    expect(WS_BACKEND_RECHECK_INTERVAL).toBe(120_000)
  })
})
