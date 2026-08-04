/**
 * Unit tests for nodeCache.ts — module-level TTL cache, in-flight dedup,
 * subscriber notification, and offline-detection error suppression logic
 * (fix for #13038 — quiet excessive JSON parse errors on k3d/k3s).
 *
 * The module keeps its cache in module-level `let` variables. There is no
 * exported reset, so we control state entirely by:
 *   1. isolating each `describe` block with vi.resetModules()
 *   2. re-importing nodeCache inside each test to get a fresh copy
 *
 * Run: cd web && npx vitest run src/components/cards/console-missions/__tests__/nodeCache.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NodeData } from '../offlineDataTransforms'

// ── Mock the network dependency ────────────────────────────────────────────

const agentFetchMock = vi.fn()

vi.mock('../../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => agentFetchMock(...args),
}))

// ── Test helpers ───────────────────────────────────────────────────────────

const SAMPLE_NODE: NodeData = {
  name: 'node-1',
} as unknown as NodeData

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}

/** Fresh import of the module under test so module-level state is reset. */
async function loadFreshNodeCache() {
  vi.resetModules()
  return await import('../nodeCache')
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe('nodeCache', () => {
  beforeEach(() => {
    agentFetchMock.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Exported constants ──────────────────────────────────────────────

  describe('exported constants', () => {
    it('exposes documented thresholds', async () => {
      const { NODES_CACHE_TTL, OFFLINE_DETECTION_FAILURE_THRESHOLD, GPU_CLUSTER_EXHAUSTION_THRESHOLD } =
        await loadFreshNodeCache()
      expect(NODES_CACHE_TTL).toBe(30_000)
      expect(OFFLINE_DETECTION_FAILURE_THRESHOLD).toBe(3)
      // 80% cluster GPU exhaustion — must remain in (0, 1)
      expect(GPU_CLUSTER_EXHAUSTION_THRESHOLD).toBeGreaterThan(0)
      expect(GPU_CLUSTER_EXHAUSTION_THRESHOLD).toBeLessThan(1)
      expect(GPU_CLUSTER_EXHAUSTION_THRESHOLD).toBe(0.8)
    })
  })

  // ── getNodesCache ───────────────────────────────────────────────────

  describe('getNodesCache', () => {
    it('returns empty array before any fetch', async () => {
      const { getNodesCache } = await loadFreshNodeCache()
      expect(getNodesCache()).toEqual([])
    })

    it('returns cached nodes after successful fetch', async () => {
      const mod = await loadFreshNodeCache()
      agentFetchMock.mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))
      await mod.fetchAllNodes()
      expect(mod.getNodesCache()).toEqual([SAMPLE_NODE])
    })
  })

  // ── fetchAllNodes: success paths ────────────────────────────────────

  describe('fetchAllNodes — success', () => {
    it('fetches, populates cache, and returns clean result', async () => {
      const { fetchAllNodes, getNodesCache } = await loadFreshNodeCache()
      agentFetchMock.mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))

      const result = await fetchAllNodes()

      expect(result).toEqual({
        nodes: [SAMPLE_NODE],
        error: null,
        consecutiveFailures: 0,
      })
      expect(getNodesCache()).toEqual([SAMPLE_NODE])
      expect(agentFetchMock).toHaveBeenCalledTimes(1)
    })

    it('treats a missing "nodes" field as empty array (defensive)', async () => {
      const { fetchAllNodes } = await loadFreshNodeCache()
      agentFetchMock.mockResolvedValueOnce(jsonResponse({}))

      const result = await fetchAllNodes()

      expect(result.nodes).toEqual([])
      expect(result.error).toBeNull()
    })

    it('reuses cached nodes within TTL window without refetching', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL } = await loadFreshNodeCache()
      agentFetchMock.mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))
      await fetchAllNodes()

      // Advance time to just before TTL expiry
      vi.advanceTimersByTime(NODES_CACHE_TTL - 1)

      const result = await fetchAllNodes()
      expect(result.nodes).toEqual([SAMPLE_NODE])
      expect(agentFetchMock).toHaveBeenCalledTimes(1) // no second fetch
    })

    it('refetches once TTL has elapsed', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL } = await loadFreshNodeCache()
      const first: NodeData = { name: 'first' } as unknown as NodeData
      const second: NodeData = { name: 'second' } as unknown as NodeData
      agentFetchMock
        .mockResolvedValueOnce(jsonResponse({ nodes: [first] }))
        .mockResolvedValueOnce(jsonResponse({ nodes: [second] }))

      await fetchAllNodes()
      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      const result = await fetchAllNodes()

      expect(result.nodes).toEqual([second])
      expect(agentFetchMock).toHaveBeenCalledTimes(2)
    })

    it('does NOT reuse the empty cache within TTL — an empty cache must retry', async () => {
      // First fetch returns empty; a follow-up call should trigger another
      // network attempt because the guard requires nodesCache.length > 0.
      const { fetchAllNodes } = await loadFreshNodeCache()
      agentFetchMock
        .mockResolvedValueOnce(jsonResponse({ nodes: [] }))
        .mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))

      await fetchAllNodes()
      const result = await fetchAllNodes()

      expect(result.nodes).toEqual([SAMPLE_NODE])
      expect(agentFetchMock).toHaveBeenCalledTimes(2)
    })
  })

  // ── fetchAllNodes: error paths ──────────────────────────────────────

  describe('fetchAllNodes — errors', () => {
    it('captures HTTP-error message and increments consecutiveFailures', async () => {
      const { fetchAllNodes, getNodesCache } = await loadFreshNodeCache()
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
      agentFetchMock.mockResolvedValueOnce(errorResponse(503))

      const result = await fetchAllNodes()

      expect(result.error).toBe('HTTP 503')
      expect(result.consecutiveFailures).toBe(1)
      expect(getNodesCache()).toEqual([])
      // No prior cache → uses console.error path
      expect(consoleErr).toHaveBeenCalled()
    })

    it('captures thrown-Error message from agentFetch', async () => {
      const { fetchAllNodes } = await loadFreshNodeCache()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      agentFetchMock.mockRejectedValueOnce(new Error('network down'))

      const result = await fetchAllNodes()

      expect(result.error).toBe('network down')
      expect(result.consecutiveFailures).toBe(1)
    })

    it('captures "Unknown error" when a non-Error value is thrown', async () => {
      const { fetchAllNodes } = await loadFreshNodeCache()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      agentFetchMock.mockRejectedValueOnce('string thrown')

      const result = await fetchAllNodes()

      expect(result.error).toBe('Unknown error')
      expect(result.consecutiveFailures).toBe(1)
    })

    it('accumulates consecutiveFailures across repeated failures', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL } = await loadFreshNodeCache()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      agentFetchMock
        .mockRejectedValueOnce(new Error('boom-1'))
        .mockRejectedValueOnce(new Error('boom-2'))
        .mockRejectedValueOnce(new Error('boom-3'))

      const r1 = await fetchAllNodes()
      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      const r2 = await fetchAllNodes()
      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      const r3 = await fetchAllNodes()

      expect(r1.consecutiveFailures).toBe(1)
      expect(r2.consecutiveFailures).toBe(2)
      expect(r3.consecutiveFailures).toBe(3)
      expect(r3.error).toBe('boom-3')
    })

    it('resets consecutiveFailures back to 0 once a fetch succeeds', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL } = await loadFreshNodeCache()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      agentFetchMock
        .mockRejectedValueOnce(new Error('boom-1'))
        .mockRejectedValueOnce(new Error('boom-2'))
        .mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))

      await fetchAllNodes()
      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      const failed2 = await fetchAllNodes()
      expect(failed2.consecutiveFailures).toBe(2)

      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      const ok = await fetchAllNodes()
      expect(ok.consecutiveFailures).toBe(0)
      expect(ok.error).toBeNull()
    })
  })

  // ── #13038 — noisy-JSON-error suppression on k3d/k3s ────────────────

  describe('fetchAllNodes — JSON-parse error suppression (#13038)', () => {
    it('logs the first THRESHOLD JSON parse errors then goes quiet', async () => {
      // With no prior cache, log goes to console.error.
      const { fetchAllNodes, NODES_CACHE_TTL, OFFLINE_DETECTION_FAILURE_THRESHOLD } =
        await loadFreshNodeCache()
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

      const jsonErr = new Error('Unexpected token < in JSON at position 0')
      // 5 failures > threshold of 3 → last two are suppressed.
      for (let i = 0; i < 5; i++) {
        agentFetchMock.mockRejectedValueOnce(jsonErr)
      }

      for (let i = 0; i < 5; i++) {
        await fetchAllNodes()
        vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      }

      expect(consoleErr).toHaveBeenCalledTimes(OFFLINE_DETECTION_FAILURE_THRESHOLD)
    })

    it('keeps logging non-JSON errors even beyond the threshold', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL, OFFLINE_DETECTION_FAILURE_THRESHOLD } =
        await loadFreshNodeCache()
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

      const nonJsonErr = new Error('ECONNREFUSED 127.0.0.1:443')
      const totalCalls = OFFLINE_DETECTION_FAILURE_THRESHOLD + 2
      for (let i = 0; i < totalCalls; i++) {
        agentFetchMock.mockRejectedValueOnce(nonJsonErr)
      }

      for (let i = 0; i < totalCalls; i++) {
        await fetchAllNodes()
        vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      }

      // Every failure is logged when the error is not JSON-flavored.
      expect(consoleErr).toHaveBeenCalledTimes(totalCalls)
    })

    it('uses console.warn (not error) when cache still has last-known-good data', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL } = await loadFreshNodeCache()
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      agentFetchMock
        .mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))
        .mockRejectedValueOnce(new Error('ECONNRESET'))

      await fetchAllNodes()
      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      const degraded = await fetchAllNodes()

      // Degraded: keep serving the old cache, warn instead of error.
      expect(degraded.nodes).toEqual([SAMPLE_NODE])
      expect(degraded.error).toBe('ECONNRESET')
      expect(consoleWarn).toHaveBeenCalled()
      expect(consoleErr).not.toHaveBeenCalled()
    })

    it('quiets JSON warnings after threshold when a stale cache is present', async () => {
      const { fetchAllNodes, NODES_CACHE_TTL, OFFLINE_DETECTION_FAILURE_THRESHOLD } =
        await loadFreshNodeCache()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Seed cache with a good fetch first
      agentFetchMock.mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))
      await fetchAllNodes()

      // Then five JSON-parse failures
      const jsonErr = new Error('Unexpected token in JSON')
      for (let i = 0; i < 5; i++) agentFetchMock.mockRejectedValueOnce(jsonErr)

      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
        await fetchAllNodes()
      }

      expect(consoleWarn).toHaveBeenCalledTimes(OFFLINE_DETECTION_FAILURE_THRESHOLD)
    })
  })

  // ── Subscribers ─────────────────────────────────────────────────────

  describe('subscribeToNodes', () => {
    it('notifies subscribers with the latest node list after a successful fetch', async () => {
      const { subscribeToNodes, fetchAllNodes } = await loadFreshNodeCache()
      const cb = vi.fn()
      subscribeToNodes(cb)
      agentFetchMock.mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))

      await fetchAllNodes()

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb).toHaveBeenCalledWith([SAMPLE_NODE])
    })

    it('does NOT notify subscribers on failed fetches', async () => {
      const { subscribeToNodes, fetchAllNodes } = await loadFreshNodeCache()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const cb = vi.fn()
      subscribeToNodes(cb)
      agentFetchMock.mockRejectedValueOnce(new Error('offline'))

      await fetchAllNodes()

      expect(cb).not.toHaveBeenCalled()
    })

    it('returns an unsubscribe function that stops further notifications', async () => {
      const { subscribeToNodes, fetchAllNodes, NODES_CACHE_TTL } = await loadFreshNodeCache()
      const cb = vi.fn()
      const unsubscribe = subscribeToNodes(cb)
      agentFetchMock
        .mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))
        .mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE, SAMPLE_NODE] }))

      await fetchAllNodes()
      expect(cb).toHaveBeenCalledTimes(1)

      unsubscribe()
      vi.advanceTimersByTime(NODES_CACHE_TTL + 1)
      await fetchAllNodes()

      // Subscriber removed → still just 1 call.
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('supports multiple independent subscribers', async () => {
      const { subscribeToNodes, fetchAllNodes } = await loadFreshNodeCache()
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      subscribeToNodes(cb1)
      subscribeToNodes(cb2)
      agentFetchMock.mockResolvedValueOnce(jsonResponse({ nodes: [SAMPLE_NODE] }))

      await fetchAllNodes()

      expect(cb1).toHaveBeenCalledWith([SAMPLE_NODE])
      expect(cb2).toHaveBeenCalledWith([SAMPLE_NODE])
    })
  })
})
