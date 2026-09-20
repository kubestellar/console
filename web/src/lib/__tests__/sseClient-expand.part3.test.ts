/**
 * Expanded deep branch-coverage tests for sseClient.ts (part 3 of 3)
 *
 * Split from sseClient-expand.test.ts to keep files under the LOC limit.
 * Covers:
 * - onDone callback with valid summary
 * - All retries exhausted
 * - Query params edge cases (special characters, zero values)
 * - SSE constants / auth failure GA4 emit behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSSE } from '../sseClient'
import { makeSSEResponse } from './sseClient-expand.setup'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

let testId = 3000

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../analytics', () => ({
  emitSseAuthFailure: vi.fn(),
}))

import { emitSseAuthFailure } from '../analytics'
const mockEmitSseAuth = vi.mocked(emitSseAuthFailure)

describe('sseClient expanded', () => {
  // =========================================================================
  // onDone callback with valid summary
  // =========================================================================

  describe('onDone callback', () => {
    it('calls onDone with parsed summary object', async () => {
      const onDone = vi.fn()
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        { event: 'done', data: { totalClusters: 1, totalItems: 1, elapsed: '150ms' } },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      await fetchSSE({
        url: `/api/ondone-valid-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
        onDone,
      })

      expect(onDone).toHaveBeenCalledTimes(1)
      expect(onDone).toHaveBeenCalledWith({
        totalClusters: 1,
        totalItems: 1,
        elapsed: '150ms',
      })
    })

    it('does not crash when onDone is not provided', async () => {
      const events = [
        { event: 'done', data: { totalClusters: 0 } },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/no-ondone-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        // No onDone callback
      })

      expect(result).toEqual([])
    })
  })

  // =========================================================================
  // All retries exhausted
  // =========================================================================

  describe('all retries exhausted', () => {
    it('rejects with SSE stream error after max retries', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockRejectedValue(new Error('persistent failure'))

      const uniqueUrl = `/api/exhaust-${testId++}`
      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const handled = promise.catch((e: Error) => e.message)

      // Advance through all retry delays
      // Attempt 0 fails, retry at 1s
      // Attempt 1 fails, retry at 2s
      // Attempt 2 fails, retry at 4s
      // Attempt 3 fails, retry at 8s
      // Attempt 4 fails, retry at 16s
      // Attempt 5 fails -> all exhausted, rejects
      for (let i = 0; i < 15; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      expect(result).toContain('SSE stream error')
    })
  })

  // =========================================================================
  // Query params with special characters
  // =========================================================================

  describe('query params edge cases', () => {
    it('handles params with special characters', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/special-${testId++}`,
        params: { namespace: 'my-ns/test', label: 'app=web&version=2' },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('namespace=')
      expect(url).toContain('label=')
    })

    it('handles param value of 0', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/zero-param-${testId++}`,
        params: { limit: 0 },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('limit=0')
    })
  })

  describe('SSE auth failure GA4 emit', () => {
    it('emits emitSseAuthFailure on 401 response', async () => {
      // emitSseAuthFailure only fires when a token is present (real auth failure)
      localStorage.setItem('token', 'fake-token')
      vi.mocked(fetch).mockResolvedValue(new Response('Unauthorized', { status: 401 }))

      const result = await fetchSSE({
        url: `/api/sse-401-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(mockEmitSseAuth).toHaveBeenCalledTimes(1)
      expect(mockEmitSseAuth).toHaveBeenCalledWith(expect.stringContaining('/api/sse-401-'))
      expect(result).toEqual([])
      localStorage.removeItem('token')
    })

    it('does not emit emitSseAuthFailure on 503 response', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValue(new Response('Unavailable', { status: 503 }))

      const result = await fetchSSE({
        url: `/api/sse-503-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(mockEmitSseAuth).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('does not retry on 404 response', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }))

      const result = await fetchSSE({
        url: `/api/sse-404-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      expect(debugSpy).toHaveBeenCalledWith('[SSE] Non-retryable error (endpoint unavailable or auth) — skipping retries')
      expect(mockEmitSseAuth).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('does not emit emitSseAuthFailure on successful response', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/sse-ok-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(mockEmitSseAuth).not.toHaveBeenCalled()
    })
  })
})
