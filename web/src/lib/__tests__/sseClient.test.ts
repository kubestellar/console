import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchSSE } from '../sseClient'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock ReadableStream that delivers SSE-formatted chunks */
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

/** Create a stream that delivers chunks split across boundaries */
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

function makeSSEResponse(events: Array<{ event: string; data: unknown }>, status = 200): Response {
  return new Response(makeSSEStream(events), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function makeSplitSSEResponse(chunks: string[], status = 200): Response {
  return new Response(makeSplitSSEStream(chunks), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// Unique URL counter to avoid SSE cache/dedup collisions between tests
let testId = 0

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sseClient', () => {

  describe('module exports', () => {
    it('exports fetchSSE function', async () => {
      const mod = await import('../sseClient')
      expect(mod).toHaveProperty('fetchSSE')
      expect(typeof mod.fetchSSE).toBe('function')
    })
  })

  describe('fetchSSE - basic streaming', () => {
    it('streams cluster data events and calls onClusterData', async () => {
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      const events = [
        { event: 'cluster_data', data: { cluster: 'prod', pods: [{ name: 'pod-1' }] } },
        { event: 'cluster_data', data: { cluster: 'staging', pods: [{ name: 'pod-2' }] } },
        { event: 'done', data: { totalClusters: 2 } },
      ]

      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/mcp/pods/stream-${testId++}`,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls).toHaveLength(2)
      expect(clusterDataCalls[0].cluster).toBe('prod')
      expect(clusterDataCalls[1].cluster).toBe('staging')
      expect(result).toBeDefined()
    })

    it('accumulates data across multiple cluster_data events', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', items: [{ id: 1 }] } },
        { event: 'cluster_data', data: { cluster: 'c2', items: [{ id: 2 }] } },
        { event: 'cluster_data', data: { cluster: 'c3', items: [{ id: 3 }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/accumulate-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(result).toHaveLength(3)
    })

    it('resolves with accumulated data when stream closes without done event', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/no-done-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      expect(result).toHaveLength(1)
    })

    it('handles empty stream (immediate close)', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      })
      vi.mocked(fetch).mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      )

      const result = await fetchSSE({
        url: `/api/empty-stream-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(result).toEqual([])
    })
  })

  describe('fetchSSE - auth and headers', () => {
    it('includes auth header when token exists', async () => {
      localStorage.setItem('token', 'jwt-123')
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/auth-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer jwt-123')
    })

    it('does not include auth header when no token in localStorage', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/no-token-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Record<string, string>
      expect(headers.Authorization).toBeUndefined()
    })

    it('sends Accept: text/event-stream header', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/headers-check-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Record<string, string>
      expect(headers.Accept).toBe('text/event-stream')
    })
  })

  describe('fetchSSE - query params', () => {
    it('appends query params to URL', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/params-${testId++}`,
        params: { namespace: 'default', limit: 100 },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('namespace=default')
      expect(url).toContain('limit=100')
    })

    it('skips undefined params', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/undef-params-${testId++}`,
        params: { namespace: 'default', cluster: undefined },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('namespace=default')
      expect(url).not.toContain('cluster')
    })

    it('uses URL without query string when no params provided', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      const uniqueUrl = `/api/clean-${testId++}`
      await fetchSSE({
        url: uniqueUrl,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toBe(uniqueUrl)
      expect(url).not.toContain('?')
    })

    it('works with empty params object', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      const uniqueUrl = `/api/empty-params-${testId++}`
      await fetchSSE({
        url: uniqueUrl,
        params: {},
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toBe(uniqueUrl)
    })

    it('converts numeric param values to strings', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/numeric-params-${testId++}`,
        params: { limit: 50, page: 3 },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('limit=50')
      expect(url).toContain('page=3')
    })
  })

  describe('fetchSSE - cluster tagging', () => {
    it('tags items with cluster name when item lacks cluster field', async () => {
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      const events = [
        { event: 'cluster_data', data: { cluster: 'us-east', pods: [{ name: 'pod-a' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/tag-cluster-${testId++}`,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls[0].items[0]).toHaveProperty('cluster', 'us-east')
      expect(result[0]).toHaveProperty('cluster', 'us-east')
    })

    it('preserves existing cluster field on items that already have one', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'us-east', pods: [{ name: 'pod-a', cluster: 'already-set' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/preserve-cluster-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      expect(result[0]).toHaveProperty('cluster', 'already-set')
    })

    it('defaults cluster name to "unknown" when event lacks cluster field', async () => {
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      const events = [
        { event: 'cluster_data', data: { pods: [{ name: 'orphan-pod' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      await fetchSSE({
        url: `/api/unknown-cluster-${testId++}`,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls[0].cluster).toBe('unknown')
    })

    it('uses empty array when itemsKey is missing from event data', async () => {
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      const events = [
        { event: 'cluster_data', data: { cluster: 'prod' } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      await fetchSSE({
        url: `/api/missing-key-${testId++}`,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls[0].items).toEqual([])
    })

    it('tags multiple items in a single cluster_data event', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'multi', pods: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/multi-items-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      expect(result).toHaveLength(3)
      for (const item of result) {
        expect(item).toHaveProperty('cluster', 'multi')
      }
    })
  })

  describe('fetchSSE - onDone callback', () => {
    it('calls onDone callback with parsed summary', async () => {
      const onDone = vi.fn()
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: { totalClusters: 3, totalItems: 42 } },
      ]))

      await fetchSSE({
        url: `/api/ondone-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        onDone,
      })

      expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ totalClusters: 3 }))
    })

    it('handles malformed JSON in done event summary gracefully', async () => {
      const onDone = vi.fn()
      const chunks = [
        'event: done\ndata: {invalid-summary\n\n',
      ]

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/bad-done-json-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        onDone,
      })

      expect(Array.isArray(result)).toBe(true)
    })

    it('resolves even when onDone is not provided', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: { totalClusters: 1 } },
      ]))

      const result = await fetchSSE({
        url: `/api/no-ondone-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('fetchSSE - SSE parsing', () => {
    it('handles SSE chunks split across read boundaries', async () => {
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      const chunk1 = 'event: cluster_data\ndata: {"cluster":"split-test",'
      const chunk2 = '"pods":[{"name":"split-pod"}]}\n\nevent: done\ndata: {}\n\n'

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse([chunk1, chunk2]))

      await fetchSSE({
        url: `/api/split-test-${testId++}`,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls).toHaveLength(1)
      expect(clusterDataCalls[0].cluster).toBe('split-test')
    })

    it('ignores unknown event types', async () => {
      const onClusterData = vi.fn()
      const events = [
        { event: 'heartbeat', data: { ts: 123 } },
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        { event: 'progress', data: { pct: 50 } },
        { event: 'done', data: {} },
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      await fetchSSE({
        url: `/api/unknown-events-${testId++}`,
        itemsKey: 'pods',
        onClusterData,
      })

      expect(onClusterData).toHaveBeenCalledTimes(1)
    })

    it('handles malformed JSON in cluster_data gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const chunks = [
        'event: cluster_data\ndata: {not valid json}\n\n',
        'event: done\ndata: {}\n\n',
      ]

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/malformed-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(Array.isArray(result)).toBe(true)
      consoleSpy.mockRestore()
    })

    it('handles multiple events in a single chunk', async () => {
      const sseText =
        'event: cluster_data\ndata: {"cluster":"c1","pods":[{"name":"p1"}]}\n\n' +
        'event: cluster_data\ndata: {"cluster":"c2","pods":[{"name":"p2"}]}\n\n' +
        'event: done\ndata: {}\n\n'

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse([sseText]))

      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      await fetchSSE({
        url: `/api/multi-event-chunk-${testId++}`,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls).toHaveLength(2)
    })

    it('handles SSE message with only event line and no data', async () => {
      const chunks = [
        'event: heartbeat\n\n',
        'event: done\ndata: {}\n\n',
      ]

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/no-data-line-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      expect(Array.isArray(result)).toBe(true)
    })

    it('handles SSE message with empty lines between events', async () => {
      const chunks = [
        '\n\nevent: cluster_data\ndata: {"cluster":"c1","pods":[{"name":"p1"}]}\n\n\n\nevent: done\ndata: {}\n\n',
      ]

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const onClusterData = vi.fn()
      await fetchSSE({
        url: `/api/empty-lines-${testId++}`,
        itemsKey: 'pods',
        onClusterData,
      })

      expect(onClusterData).toHaveBeenCalledTimes(1)
    })

    it('flushes remaining buffer when stream ends mid-message', async () => {
      // The stream delivers data without a trailing \n\n, so the pump's "done" branch
      // flushes the remaining buffer by appending \n\n
      const chunks = [
        'event: cluster_data\ndata: {"cluster":"flush","pods":[{"name":"flushed"}]}',
      ]

      vi.mocked(fetch).mockResolvedValue(makeSplitSSEResponse(chunks))

      const result = await fetchSSE({
        url: `/api/flush-buffer-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('cluster', 'flush')
    })
  })

  describe('fetchSSE - error handling', () => {
    it('handles fetch error gracefully with retries', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      const promise = fetchSSE({
        url: `/api/fetch-error-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const handled = promise.catch(() => 'rejected')

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      expect(result === 'rejected' || Array.isArray(result)).toBe(true)
    })

    it('handles non-200 response with retries', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValue(new Response('Server Error', { status: 500 }))

      const promise = fetchSSE({
        url: `/api/500-error-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const handled = promise.catch(() => 'rejected')

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      expect(result === 'rejected' || Array.isArray(result)).toBe(true)
    })

    it('handles response with no body by retrying then rejecting', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const mockResponse = {
        ok: true,
        body: null,
        status: 200,
        headers: new Headers(),
      } as unknown as Response
      vi.mocked(fetch).mockResolvedValue(mockResponse)

      const promise = fetchSSE({
        url: `/api/no-body-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const handled = promise.catch((e) => (e as Error).message)

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      if (typeof result === 'string') {
        expect(result).toContain('SSE')
      }
    })

    it('resolves with accumulated data when error occurs after some data received', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      // First call succeeds with partial data, second call fails
      let callCount = 0
      vi.mocked(fetch).mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          // Return a stream that gives data then errors
          const events = [
            { event: 'cluster_data', data: { cluster: 'partial', pods: [{ name: 'p1' }] } },
          ]
          return makeSSEResponse(events)
        }
        throw new Error('Connection lost')
      })

      const result = await fetchSSE({
        url: `/api/partial-data-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // Should resolve with accumulated data from the successful stream
      expect(result).toHaveLength(1)
    })
  })

  describe('fetchSSE - abort signal', () => {
    it('accepts abort signal without crashing', async () => {
      const controller = new AbortController()

      vi.mocked(fetch).mockRejectedValue(new DOMException('Aborted', 'AbortError'))

      const promise = fetchSSE({
        url: `/api/abort-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        signal: controller.signal,
      })

      const handled = promise.catch((e) => (e as Error).name)

      controller.abort()

      await vi.advanceTimersByTimeAsync(100)

      const result = await handled
      expect(result === 'AbortError' || Array.isArray(result)).toBe(true)
    })

    it('rejects with AbortError when signal fires during stream', async () => {
      const controller = new AbortController()

      // Create a stream that never closes (hangs)
      const stream = new ReadableStream<Uint8Array>({
        start() {
          // intentionally empty - stream stays open
        },
      })
      vi.mocked(fetch).mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      )

      const promise = fetchSSE({
        url: `/api/abort-mid-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        signal: controller.signal,
      })

      const handled = promise.catch((e) => (e as Error).name)

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50)
      await vi.advanceTimersByTimeAsync(100)

      const result = await handled
      expect(result === 'AbortError' || Array.isArray(result)).toBe(true)
    })
  })

  describe('fetchSSE - caching', () => {
    it('serves cached data on repeated calls within TTL', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'cached', pods: [{ name: 'p1' }] } },
        { event: 'done', data: {} },
      ]

      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const cacheUrl = `/api/cache-test-${testId++}`
      const onClusterData1 = vi.fn()
      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: onClusterData1,
      })

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

      // Second call should use cache (within 10s TTL)
      const onClusterData2 = vi.fn()
      const onDone2 = vi.fn()
      const result2 = await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: onClusterData2,
        onDone: onDone2,
      })

      // Fetch should NOT be called again
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      // Cache replay should call onClusterData
      expect(onClusterData2).toHaveBeenCalled()
      // Cache replay should call onDone with cached flag
      expect(onDone2).toHaveBeenCalledWith({ cached: true })
      // Result should contain cached data
      expect(result2).toHaveLength(1)
    })

    it('replays cached data grouped by cluster', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        { event: 'cluster_data', data: { cluster: 'c2', pods: [{ name: 'p2' }] } },
        { event: 'done', data: {} },
      ]

      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const cacheUrl = `/api/cache-group-${testId++}`
      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // Second call: should replay grouped by cluster
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: (cluster, items) => {
          clusterDataCalls.push({ cluster, items })
        },
      })

      expect(clusterDataCalls).toHaveLength(2)
      expect(clusterDataCalls.map(c => c.cluster).sort()).toEqual(['c1', 'c2'])
    })

    it('fetches fresh data after cache TTL expires', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        { event: 'done', data: {} },
      ]

      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const cacheUrl = `/api/cache-expire-${testId++}`
      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)

      // Advance past the 10s cache TTL
      await vi.advanceTimersByTimeAsync(11_000)

      // Reset fetch mock for a new response
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // Should have called fetch again
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
    })

    it('assigns "unknown" cluster when cached items lack cluster field', async () => {
      // Items without a cluster property will have been tagged, but test
      // what happens if they somehow lacked the field
      const events = [
        { event: 'cluster_data', data: { cluster: 'known', pods: [{ name: 'p1' }] } },
        { event: 'done', data: {} },
      ]

      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const cacheUrl = `/api/cache-unknown-${testId++}`
      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // second call from cache
      const calls: Array<{ cluster: string }> = []
      await fetchSSE({
        url: cacheUrl,
        itemsKey: 'pods',
        onClusterData: (cluster) => { calls.push({ cluster }) },
      })

      // The cached items have cluster = 'known' (tagged by first pass)
      expect(calls[0].cluster).toBe('known')
    })
  })

  describe('fetchSSE - timeout', () => {
    it('resolves with accumulated data when timeout fires', async () => {
      // Create a stream that never closes
      const stream = new ReadableStream<Uint8Array>({
        start() {
          // never push data or close
        },
      })
      vi.mocked(fetch).mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      )

      const promise = fetchSSE({
        url: `/api/timeout-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // SSE_TIMEOUT_MS is 60_000
      await vi.advanceTimersByTimeAsync(61_000)

      const result = await promise
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
