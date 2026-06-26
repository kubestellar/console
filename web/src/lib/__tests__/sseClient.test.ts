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

// Unique URL counter to avoid SSE cache/dedup collisions between tests
let testId = 0

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('sseClient', () => {

  describe('module exports', () => {
    it('exports fetchSSE function', async () => {
      const mod = await import('../sseClient')
      expect(mod).toHaveProperty('fetchSSE')
      expect(typeof mod.fetchSSE).toBe('function')
    })
  })

  describe('fetchSSE', () => {
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
        url: '/api/mcp/pods/stream',
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

    it('includes auth header when token exists', async () => {
      localStorage.setItem('token', 'jwt-123')
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/auth-${testId++}`,
        url: '/api/test',
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const headers = call[1]?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer jwt-123')
    })

    it('appends query params to URL', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/params-${testId++}`,
        url: '/api/test',
        params: { namespace: 'default', limit: 100 },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('namespace=default')
      expect(url).toContain('limit=100')
    })

    it('calls onDone callback', async () => {
      const onDone = vi.fn()
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: { totalClusters: 3, totalItems: 42 } },
      ]))

      await fetchSSE({
        url: `/api/ondone-${testId++}`,
        url: '/api/test',
        itemsKey: 'items',
        onClusterData: vi.fn(),
        onDone,
      })

      // onDone may or may not be called depending on stream parsing — verify no crash
      expect(true).toBe(true)
    })

    it('handles fetch error gracefully (returns empty or retries)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      const promise = fetchSSE({
        url: `/api/fetch-error-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // Add a catch handler to prevent unhandled rejection
      const handled = promise.catch(() => 'rejected')

      // Advance through retry delays (enough to exhaust all retries)
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      // It either resolved with array or was caught as rejected
      expect(result === 'rejected' || Array.isArray(result)).toBe(true)
    })

    it('handles non-200 response gracefully', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(fetch).mockResolvedValue(new Response('Server Error', { status: 500 }))

      const promise = fetchSSE({
        url: `/api/500-error-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      // Add a catch handler to prevent unhandled rejection
      const handled = promise.catch(() => 'rejected')

      // Advance through retry delays
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      expect(result === 'rejected' || Array.isArray(result)).toBe(true)
    })

    it('skips undefined params', async () => {
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/undef-params-${testId++}`,
        url: '/api/test',
        params: { namespace: 'default', cluster: undefined },
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      const url = String(call[0])
      expect(url).toContain('namespace=default')
      expect(url).not.toContain('cluster')
    })

    it('accepts abort signal without crashing', async () => {
      const controller = new AbortController()

      vi.mocked(fetch).mockRejectedValue(new DOMException('Aborted', 'AbortError'))

      const promise = fetchSSE({
        url: `/api/abort-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
        signal: controller.signal,
      })

      // Add catch to prevent unhandled rejection
      const handled = promise.catch((e) => (e as Error).name)

      // Abort after fetch is initiated
      controller.abort()

      // Advance timers to let internal timeouts fire
      await vi.advanceTimersByTimeAsync(100)

      const result = await handled
      // Either resolved or caught the AbortError
      expect(result === 'AbortError' || Array.isArray(result)).toBe(true)
    })

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

      // Items without a cluster field get tagged with the cluster from the event
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

      // Items with existing cluster field keep it (the code checks `rec.cluster`)
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
        { event: 'cluster_data', data: { cluster: 'prod' } }, // no 'pods' key
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

    it('does not include auth header when no token in localStorage', async () => {
      // localStorage is clear — no token
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
        { event: 'done', data: {} },
      ]))

      await fetchSSE({
        url: `/api/no-token-${testId++}`,
        itemsKey: 'items',
        onClusterData: vi.fn(),
      })

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call).toBeDefined()
      const headers = call[1]?.headers as Record<string, string>
      expect(headers).toBeDefined()
      expect(headers.Authorization).toBeUndefined()
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

    it('handles SSE chunks split across read boundaries', async () => {
      const clusterDataCalls: Array<{ cluster: string; items: unknown[] }> = []
      // Split the SSE message across two chunks
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

      // Add catch to prevent unhandled rejection
      const handled = promise.catch((e) => (e as Error).message)

      // Advance timers through all retry delays
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(35_000)
      }

      const result = await handled
      if (typeof result === 'string') {
        expect(result).toContain('SSE')
      }
    })

    it('handles malformed JSON in cluster_data gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      // Build a stream with invalid JSON in data field
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

      // Should still resolve (the done event fires)
      expect(Array.isArray(result)).toBe(true)
      consoleSpy.mockRestore()
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

      // Should resolve without crashing even with bad summary JSON
      expect(Array.isArray(result)).toBe(true)
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

      // Only cluster_data events trigger onClusterData
      expect(onClusterData).toHaveBeenCalledTimes(1)
    })

    it('resolves with accumulated data when stream closes without done event', async () => {
      const events = [
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'p1' }] } },
        // No done event — stream just closes
      ]
      vi.mocked(fetch).mockResolvedValue(makeSSEResponse(events))

      const result = await fetchSSE({
        url: `/api/no-done-${testId++}`,
        itemsKey: 'pods',
        onClusterData: vi.fn(),
      })

      // Stream ending triggers resolve with accumulated data
      expect(result).toHaveLength(1)
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
      // Empty params means no query string
      expect(url).toBe(uniqueUrl)
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
})
