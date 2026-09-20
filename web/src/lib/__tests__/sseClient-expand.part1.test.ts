/**
 * Expanded deep branch-coverage tests for sseClient.ts (part 1 of 3)
 *
 * Split from sseClient-expand.test.ts to keep files under the LOC limit.
 * Covers:
 * - parseSSEChunk: empty lines between events, partial messages, event with
 *   no data line, multiple data lines, event type defaulting to 'message'
 * - Result cache: hit and replay, grouping by cluster, "unknown" cluster
 * - In-flight dedup
 * - Abort signal behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSSE } from '../sseClient'
import { makeSSEResponse, makeSplitSSEResponse } from './sseClient-expand.setup'

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
})
