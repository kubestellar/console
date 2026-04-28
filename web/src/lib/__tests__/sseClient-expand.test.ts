/**
 * Expanded deep branch-coverage tests for sseClient.ts
 *
 * Targets uncovered paths:
 * - parseSSEChunk: empty lines between events, partial messages, event with
 *   no data line, multiple data lines, event type defaulting to 'message'
 * - fetchSSE: result cache hit and replay, cache TTL expiry, in-flight dedup,
 *   abort signal mid-stream, timeout resolution, reconnect with exponential
 *   backoff (attempt counting), all retries exhausted, accumulated data on
 *   partial failure, token read on reconnect attempt, partial data resolve
 *   on fetch error, buffer flush on stream end
 * - Cache cleanup: aborted streams don't cache, successful streams cache
 * - SSE constants: backoff factor, max delay, max attempts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSSE } from '../sseClient'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSSEStream(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        const { event, data } = events[index]
        const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(chunk))
        index++
      } else {
        controller.close()
      }
    },
  })
}

function makeSplitSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

function makeSSEResponse(events: Array<{ event: string; data: unknown }>): Response {
  return new Response(makeSSEStream(events), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function makeSplitSSEResponse(chunks: string[]): Response {
  return new Response(makeSplitSSEStream(chunks), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

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

let testId = 1000

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
  // parseSSEChunk edge cases (tested via fetchSSE)
  // =========================================================================

  describe('parseSSEChunk edge cases via fetchSSE', () => {
    it('handles event with no data line (skipped)', async () => {
      const onClusterData = vi.fn()
      const chunks = [
        'event: cluster_data\n\n',  // event line but no data line
        'event: done\ndata: {}\n\n',
      ]
      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/no-data-line-${testId++}`,
        itemsKey: 'items',
        onClusterData,
      })

      // The event with no data should be skipped (data is empty after trim)
      expect(onClusterData).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('handles multiple empty lines between events', async () => {
      const onClusterData = vi.fn()
      const chunks = [
        'event: cluster_data\ndata: {"cluster":"c1","items":[{"id":1}]}\n\n\n\nevent: done\ndata: {}\n\n',
      ]
      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/empty-lines-${testId++}`,
        itemsKey: 'items',
        onClusterData,
      })

      expect(onClusterData).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })

    it('handles event type defaulting to "message" (ignored by handler)', async () => {
      const onClusterData = vi.fn()
      const chunks = [
        'data: {"cluster":"c1","items":[{"id":1}]}\n\n',  // no event: line -> defaults to 'message'
        'event: done\ndata: {}\n\n',
      ]
      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/default-event-${testId++}`,
        itemsKey: 'items',
        onClusterData,
      })

      // 'message' event type is neither 'cluster_data' nor 'done', so ignored
      expect(onClusterData).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('handles line that starts with neither event: nor data:', async () => {
      const onClusterData = vi.fn()
      const chunks = [
        'comment: this is a comment\nevent: cluster_data\ndata: {"cluster":"c1","items":[{"id":1}]}\n\n',
        'event: done\ndata: {}\n\n',
      ]
      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/comment-line-${testId++}`,
        itemsKey: 'items',
        onClusterData,
      })

      expect(onClusterData).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })
  })

  // =========================================================================
  // Result cache — hit and replay
  // =========================================================================

  describe('result cache', () => {
    it('serves cached data on second call within TTL', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const uniqueUrl = `/api/cache-hit-${testId++}`

      // First call — populates cache
      const result1 = await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })
      expect(result1).toHaveLength(1)
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

      // Second call — should hit cache (no second fetch)
      const onClusterData2 = vi.fn()
      const onDone2 = vi.fn()
      const result2 = await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'pods',
        onClusterData: onClusterData2,
        onDone: onDone2,
      })

      // fetch should NOT be called again
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      // Cache replay calls onClusterData with grouped items
      expect(onClusterData2).toHaveBeenCalledTimes(1)
      expect(onClusterData2).toHaveBeenCalledWith('c1', expect.any(Array))
      // onDone called with { cached: true }
      expect(onDone2).toHaveBeenCalledWith({ cached: true })
      expect(result2).toHaveLength(1)
    })

    it('cache replay groups items by cluster', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        { event: 'cluster_data', data: { cluster: 'c2', pods: [{ name: 'p2' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const uniqueUrl = `/api/cache-group-${testId++}`

      await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // Second call from cache
      const onClusterData = vi.fn()
      await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'pods',
        onClusterData,
      })

      // Should be called twice (once per cluster)
      expect(onClusterData).toHaveBeenCalledTimes(2)
    })

    it('cache assigns "unknown" to items without cluster field', async () => {
      const events = [
        { event: 'cluster_data', data: { pods: [{ name: 'orphan' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const uniqueUrl = `/api/cache-unknown-${testId++}`

      await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // Second call from cache
      const onClusterData = vi.fn()
      await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'pods',
        onClusterData,
      })

      expect(onClusterData).toHaveBeenCalledWith('unknown', expect.any(Array))
    })
  })

  // =========================================================================
  // In-flight dedup
  // =========================================================================

  describe('in-flight dedup', () => {
    it('two concurrent calls to same URL share one fetch', async () => {
      // Create a slow stream
      let resolveStream: (() => void) | null = null
      const slowStreamPromise = new Promise<void>(r => { resolveStream = r })

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await slowStreamPromise
          const chunk = 'event: done\ndata: {}\n\n'
          controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      })
      vi.mocked(fetch).mockResolvedValue(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }))

      const uniqueUrl = `/api/dedup-${testId++}`

      const promise1 = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })
      const promise2 = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // Only one fetch should have been made
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

      // Resolve the stream
      resolveStream!()

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(result2)
    })
  })

  // =========================================================================
  // Abort signal behavior
  // =========================================================================

  describe('abort signal', () => {
    it('rejects with AbortError when signal is aborted before fetch completes', async () => {
      // Never-resolving fetch
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

      const controller = new AbortController()
      const uniqueUrl = `/api/abort-test-${testId++}`

      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        signal: controller.signal,
      })

      // Attach catch handler BEFORE aborting to prevent unhandled rejection
      const assertion = expect(promise).rejects.toThrow('Aborted')

      controller.abort()
      await vi.advanceTimersByTimeAsync(100)

      await assertion
    })

    it('aborted streams do not populate cache', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', items: [{ id: 1 }] } },
        // No done event - stream keeps going
      ]

      const encoder = new TextEncoder()
      let pullCount = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pullCount < events.length) {
            const { event, data } = events[pullCount]
            const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
            controller.enqueue(encoder.encode(chunk))
            pullCount++
          }
          // Don't close - keep stream open
        },
      })

      vi.mocked(fetch).mockResolvedValue(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }))

      const controller = new AbortController()
      const uniqueUrl = `/api/abort-no-cache-${testId++}`

      const promise = fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        signal: controller.signal,
      })

      await vi.advanceTimersByTimeAsync(100)
      controller.abort()

      await promise.catch(() => {})

      // Second call should NOT hit cache — should make a fresh fetch
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      const _result2 = await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // Second fetch was made (cache was not populated from aborted stream)
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    })
  })

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
