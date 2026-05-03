/**
 * Tests for the exported pure/async functions in useCachedThanosStatus.ts.
 * The hook itself is covered by useCachedThanosStatus.test.tsx.
 * These tests cover getDemoThanosStatus and fetchThanosStatus which have
 * no dedicated test cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { getDemoThanosStatus, fetchThanosStatus } from '../useCachedThanosStatus'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// getDemoThanosStatus
// ---------------------------------------------------------------------------

describe('getDemoThanosStatus', () => {
  it('returns a valid ThanosStatus object', () => {
    const status = getDemoThanosStatus()
    expect(status).toHaveProperty('targets')
    expect(status).toHaveProperty('storeGateways')
    expect(status).toHaveProperty('queryHealth')
    expect(status).toHaveProperty('lastCheckTime')
  })

  it('returns at least one target', () => {
    const { targets } = getDemoThanosStatus()
    expect(targets.length).toBeGreaterThan(0)
  })

  it('targets have expected shape', () => {
    const { targets } = getDemoThanosStatus()
    for (const t of targets) {
      expect(t).toHaveProperty('name')
      expect(t).toHaveProperty('health')
      expect(t).toHaveProperty('lastScrape')
      expect(['up', 'down']).toContain(t.health)
    }
  })

  it('returns at least one store gateway', () => {
    const { storeGateways } = getDemoThanosStatus()
    expect(storeGateways.length).toBeGreaterThan(0)
  })

  it('store gateways have expected shape', () => {
    const { storeGateways } = getDemoThanosStatus()
    for (const sg of storeGateways) {
      expect(sg).toHaveProperty('name')
      expect(sg).toHaveProperty('health')
      expect(['healthy', 'unhealthy']).toContain(sg.health)
    }
  })

  it('queryHealth is degraded (demo has a down target)', () => {
    const { queryHealth } = getDemoThanosStatus()
    expect(queryHealth).toBe('degraded')
  })

  it('lastCheckTime is a valid ISO string', () => {
    const { lastCheckTime } = getDemoThanosStatus()
    expect(() => new Date(lastCheckTime)).not.toThrow()
    expect(new Date(lastCheckTime).toISOString()).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// fetchThanosStatus
// ---------------------------------------------------------------------------

describe('fetchThanosStatus', () => {
  const makePromResponse = (results: object[]) => ({
    status: 'success',
    data: { resultType: 'vector', result: results },
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    await expect(fetchThanosStatus()).rejects.toThrow('HTTP 503')
  })

  it('throws when API status is not success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'error', data: null }),
    })
    await expect(fetchThanosStatus()).rejects.toThrow('Unexpected')
  })

  it('throws when data.result is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', data: {} }),
    })
    await expect(fetchThanosStatus()).rejects.toThrow('Unexpected')
  })

  it('returns healthy status when all targets are up', async () => {
    const result = [
      { metric: { job: 'prometheus', instance: '10.0.0.1:9090' }, value: [1700000000, '1'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse(result),
    })
    const status = await fetchThanosStatus()
    expect(status.queryHealth).toBe('healthy')
    expect(status.targets[0].health).toBe('up')
  })

  it('returns degraded status when a target is down', async () => {
    const result = [
      { metric: { job: 'prometheus', instance: '10.0.0.1:9090' }, value: [1700000000, '0'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse(result),
    })
    const status = await fetchThanosStatus()
    expect(status.queryHealth).toBe('degraded')
    expect(status.targets[0].health).toBe('down')
  })

  it('identifies store gateways by job label', async () => {
    const result = [
      { metric: { job: 'thanos-store-gw', instance: 'store-0:10901' }, value: [1700000000, '1'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse(result),
    })
    const status = await fetchThanosStatus()
    expect(status.storeGateways).toHaveLength(1)
    expect(status.storeGateways[0].health).toBe('healthy')
  })

  it('uses job/instance combo for target name', async () => {
    const result = [
      { metric: { job: 'prometheus', instance: 'host:9090' }, value: [1700000000, '1'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse(result),
    })
    const status = await fetchThanosStatus()
    expect(status.targets[0].name).toBe('prometheus/host:9090')
  })

  it('uses only job for name when instance is missing', async () => {
    const result = [
      { metric: { job: 'prometheus' }, value: [1700000000, '1'] },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse(result),
    })
    const status = await fetchThanosStatus()
    expect(status.targets[0].name).toBe('prometheus')
  })

  it('returns lastCheckTime as an ISO string', async () => {
    const result = [{ metric: { job: 'prom' }, value: [1700000000, '1'] }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse(result),
    })
    const status = await fetchThanosStatus()
    expect(() => new Date(status.lastCheckTime)).not.toThrow()
  })

  it('handles empty results array (no targets)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePromResponse([]),
    })
    const status = await fetchThanosStatus()
    expect(status.targets).toHaveLength(0)
    expect(status.queryHealth).toBe('healthy')
  })
})
