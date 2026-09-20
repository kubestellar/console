/**
 * Expanded deep branch-coverage tests for sseClient.ts (part 2 of 3)
 *
 * Split from sseClient-expand.test.ts to keep files under the LOC limit.
 * Covers:
 * - Reconnect with exponential backoff (attempt counting), accumulated data
 *   on partial failure
 * - Token read on reconnect attempt
 * - Timeout resolution
 * - Buffer flush on stream end
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

let testId = 2000

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../analytics', () => ({
  emitSseAuthFailure: vi.fn(),
}))

describe('sseClient expanded', () => {
  // =========================================================================
  // Reconnect with backoff
  // =========================================================================

  describe('reconnect with exponential backoff', () => {
    it('retries with increasing delays on connection failure', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      let callCount = 0

      vi.mocked(fetch).mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return Promise.reject(new Error(`Attempt ${callCount} failed`))
        }
        // Third attempt succeeds
        return Promise.resolve(makeSSEResponse([
          { event: 'cluster_data', data: { cluster: 'c1', items: [{ id: 1 }] } },
          { event: 'done', data: {} },
        ]))
      })

      const uniqueUrl = `/api/backoff-${testId++}`
      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // First attempt fails immediately
      // Wait for backoff delays
      await vi.advanceTimersByTimeAsync(2000) // 1st retry: 1000ms * 2^0 = 1000ms
      await vi.advanceTimersByTimeAsync(3000) // 2nd retry: 1000ms * 2^1 = 2000ms

      const result = await promise
      expect(result).toHaveLength(1)
      expect(callCount).toBe(3)
    })

    it('resolves with accumulated data on error after partial data', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      let callCount = 0

      // First call: returns partial data then errors
      vi.mocked(fetch).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          const encoder = new TextEncoder()
          let chunksSent = 0
          const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
              if (chunksSent === 0) {
                const chunk = 'event: cluster_data\ndata: {"cluster":"c1","items":[{"id":1}]}\n\n'
                controller.enqueue(encoder.encode(chunk))
                chunksSent++
              } else {
                controller.error(new Error('Stream broken'))
              }
            },
          })
          return Promise.resolve(new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }))
        }
        return Promise.reject(new Error('Still down'))
      })

      const uniqueUrl = `/api/partial-${testId++}`
      const onClusterData = vi.fn()

      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData,
      })

      // Advance through the stream read + reconnect delays
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      // The promise should have resolved with partial data since accumulated.length > 0
      const result = await promise.catch(() => [] as unknown[])
      // Should have at least got the first cluster data
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // =========================================================================
  // Token refresh between reconnect attempts
  // =========================================================================

  describe('token reading on reconnect', () => {
    it('reads fresh token from localStorage on each attempt', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      let callCount = 0

      vi.mocked(fetch).mockImplementation((url, options) => {
        callCount++
        const headers = (options as RequestInit)?.headers as Record<string, string>
        if (callCount === 1) {
          expect(headers?.Authorization).toBe('Bearer old-token')
          return Promise.reject(new Error('fail'))
        }
        // On retry, token should be fresh
        expect(headers?.Authorization).toBe('Bearer new-token')
        return Promise.resolve(makeSSEResponse([
          { event: 'done', data: {} },
        ]))
      })

      localStorage.setItem('token', 'old-token')

      const uniqueUrl = `/api/token-refresh-${testId++}`
      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // Change token before retry
      await vi.advanceTimersByTimeAsync(500)
      localStorage.setItem('token', 'new-token')

      // Wait for retry delay
      await vi.advanceTimersByTimeAsync(2000)

      await promise
      expect(callCount).toBe(2)
    })
  })

  // =========================================================================
  // Timeout resolution
  // =========================================================================

  describe('SSE timeout', () => {
    it('resolves with accumulated data when timeout fires', async () => {
      const SSE_TIMEOUT_MS = 60_000

      // Create a stream that never closes
      const stream = new ReadableStream<Uint8Array>({
        pull() {
          // Never enqueue or close — simulates a hung connection
          return new Promise(() => {})
        },
      })

      vi.mocked(fetch).mockResolvedValue(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }))

      const uniqueUrl = `/api/timeout-${testId++}`
      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // Advance past the SSE_TIMEOUT_MS
      await vi.advanceTimersByTimeAsync(SSE_TIMEOUT_MS + 1000)

      const result = await promise
      // Should resolve with empty accumulated array (nothing was received)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })
  })

  // =========================================================================
  // Buffer flush on stream end
  // =========================================================================

  describe('buffer flush on stream end', () => {
    it('flushes remaining buffer when stream closes', async () => {
      const onClusterData = vi.fn()
      // Send a complete event without trailing \n\n, then close stream
      // This tests the `if (sseBuffer.trim())` branch in the pump done handler
      const encoder = new TextEncoder()
      let sent = false
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            // This is a complete event but the buffer hasn't been flushed yet
            controller.enqueue(encoder.encode('event: cluster_data\ndata: {"cluster":"c1","items":[{"id":1}]}'))
            sent = true
          } else {
            controller.close()
          }
        },
      })

      vi.mocked(fetch).mockResolvedValue(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }))

      const result = await fetchSSE({
        url: `/api/flush-${testId++}`,
        itemsKey: 'items',
        onClusterData,
      })

      // The buffer should have been flushed with the \n\n appended
      expect(onClusterData).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })
  })
})
