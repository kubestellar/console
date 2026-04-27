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

function _makeSplitSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
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

// Unique URL counter
let testId = 1000

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

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('fetchSSE — expanded edge cases', () => {
  // 1. Non-ok response with no accumulated data retries
  it('retries on non-ok response status', async () => {
    const url = `/api/test-stream-${++testId}`
    let attempts = 0
    vi.mocked(fetch).mockImplementation(() => {
      attempts++
      if (attempts < 3) {
        return Promise.resolve(new Response('error', { status: 500 }))
      }
      return Promise.resolve(makeSSEResponse([
        { event: 'cluster_data', data: { cluster: 'c1', pods: [{ name: 'pod-1', cluster: 'c1' }] } },
        { event: 'done', data: {} },
      ]))
    })

    const onClusterData = vi.fn()
    const promise = fetchSSE({
      url,
      onClusterData,
      itemsKey: 'pods',
    })

    // Advance past retries
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise
    expect(result.length).toBe(1)
    expect(attempts).toBe(3)
  })

  // 2. Response with no body throws
  it('retries when response has no body', async () => {
    const url = `/api/test-stream-${++testId}`
    let attempts = 0
    vi.mocked(fetch).mockImplementation(() => {
      attempts++
      if (attempts === 1) {
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      return Promise.resolve(makeSSEResponse([
        { event: 'done', data: {} },
      ]))
    })

    const onClusterData = vi.fn()
    const promise = fetchSSE({
      url,
      onClusterData,
      itemsKey: 'pods',
    })

    await vi.advanceTimersByTimeAsync(3000)
    const result = await promise
    expect(result).toEqual([])
  })

  // 3. Abort signal cancels the stream
  it('rejects with AbortError when signal is triggered', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockImplementation(() => {
      return new Promise(() => {}) // Never resolves
    })

    const controller = new AbortController()
    const onClusterData = vi.fn()
    const promise = fetchSSE({
      url,
      onClusterData,
      itemsKey: 'pods',
      signal: controller.signal,
    })

    controller.abort()
    await expect(promise).rejects.toThrow('Aborted')
  })

  // 4. SSE timeout resolves with accumulated data
  it('resolves with accumulated data on timeout', async () => {
    const url = `/api/test-stream-${++testId}`
    // Create a stream that never closes
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({ pull() { /* never enqueue or close */ } }),
        { status: 200 },
      )
    )

    const onClusterData = vi.fn()
    const promise = fetchSSE({
      url,
      onClusterData,
      itemsKey: 'pods',
    })

    // Advance past SSE_TIMEOUT_MS (60s)
    await vi.advanceTimersByTimeAsync(61_000)
    const result = await promise
    expect(result).toEqual([])
  })

  // 5. Params are appended to URL
  it('appends query params to URL', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'done', data: {} },
    ]))

    await fetchSSE({
      url,
      params: { cluster: 'prod', limit: 10, empty: undefined },
      onClusterData: vi.fn(),
      itemsKey: 'pods',
    })

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain('cluster=prod')
    expect(calledUrl).toContain('limit=10')
    expect(calledUrl).not.toContain('empty')
  })

  // 6. Token is sent in Authorization header
  it('sends JWT token in Authorization header', async () => {
    const url = `/api/test-stream-${++testId}`
    // STORAGE_KEY_TOKEN is 'token' (from constants/storage.ts)
    localStorage.setItem('token', 'my-jwt')
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'done', data: {} },
    ]))

    await fetchSSE({
      url,
      onClusterData: vi.fn(),
      itemsKey: 'pods',
    })

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-jwt')
  })

  // 7. No token skips Authorization header
  it('omits Authorization header when no token', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'done', data: {} },
    ]))

    await fetchSSE({
      url,
      onClusterData: vi.fn(),
      itemsKey: 'pods',
    })

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  // 8. Result cache serves cached data on re-navigation
  it('serves cached data on second call within TTL', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'cluster_data', data: { cluster: 'c1', items: [{ id: 1, cluster: 'c1' }] } },
      { event: 'done', data: {} },
    ]))

    const onClusterData1 = vi.fn()
    const result1 = await fetchSSE({
      url,
      onClusterData: onClusterData1,
      itemsKey: 'items',
    })
    expect(result1).toHaveLength(1)

    // Second call within TTL should use cache
    const onClusterData2 = vi.fn()
    const onDone2 = vi.fn()
    const result2 = await fetchSSE({
      url,
      onClusterData: onClusterData2,
      onDone: onDone2,
      itemsKey: 'items',
    })
    expect(result2).toHaveLength(1)
    expect(onDone2).toHaveBeenCalledWith({ cached: true })
    // fetch should only have been called once
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  // 9. onDone callback receives summary
  it('onDone receives parsed summary from done event', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'done', data: { total: 42, errors: 0 } },
    ]))

    const onDone = vi.fn()
    await fetchSSE({
      url,
      onClusterData: vi.fn(),
      onDone,
      itemsKey: 'items',
    })

    expect(onDone).toHaveBeenCalledWith({ total: 42, errors: 0 })
  })

  // 10. cluster_data with bad JSON logs error but doesn't crash
  it('handles malformed cluster_data JSON without crashing', async () => {
    const url = `/api/test-stream-${++testId}`
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: cluster_data\ndata: {invalid json}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
        controller.close()
      },
    })
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }))

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await fetchSSE({
      url,
      onClusterData: vi.fn(),
      itemsKey: 'items',
    })

    expect(result).toEqual([])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  // 11. Items without cluster field get tagged
  it('tags items with cluster name when cluster field is missing', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'cluster_data', data: { cluster: 'prod-east', pods: [{ name: 'pod-1' }] } },
      { event: 'done', data: {} },
    ]))

    const onClusterData = vi.fn()
    const result = await fetchSSE({
      url,
      onClusterData,
      itemsKey: 'pods',
    })

    expect(result[0]).toHaveProperty('cluster', 'prod-east')
  })

  // 12. Items with existing cluster field are not overwritten
  it('preserves existing cluster field on items', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'cluster_data', data: { cluster: 'hub', pods: [{ name: 'pod-1', cluster: 'original' }] } },
      { event: 'done', data: {} },
    ]))

    const result = await fetchSSE({
      url,
      onClusterData: vi.fn(),
      itemsKey: 'pods',
    })

    expect(result[0]).toHaveProperty('cluster', 'original')
  })

  // 13. All retries exhausted rejects
  it('rejects after exhausting all retry attempts', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const promise = fetchSSE({
      url,
      onClusterData: vi.fn(),
      itemsKey: 'pods',
    })

    // Advance past all retries (5 attempts with exponential backoff)
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(35_000)
    }

    await expect(promise).rejects.toThrow('SSE stream error')
  })

  // 14. Stream ending without done event resolves with accumulated data
  it('resolves with accumulated data when stream ends without done event', async () => {
    const url = `/api/test-stream-${++testId}`
    vi.mocked(fetch).mockResolvedValue(makeSSEResponse([
      { event: 'cluster_data', data: { cluster: 'c1', items: [{ id: 1, cluster: 'c1' }] } },
      // No done event — stream just closes
    ]))

    const result = await fetchSSE({
      url,
      onClusterData: vi.fn(),
      itemsKey: 'items',
    })

    expect(result).toHaveLength(1)
  })
})
