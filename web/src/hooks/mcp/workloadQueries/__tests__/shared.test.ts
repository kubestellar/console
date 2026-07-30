import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MCP_HOOK_TIMEOUT_MS } from '../../../../lib/constants/network'
import { fetchInClusterCollection } from '../shared'

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('fetchInClusterCollection', () => {
  it('returns null when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }))

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    const result = await fetchInClusterCollection<{ name: string }>('pods', params, 'pods')

    expect(result).toBeNull()
  })

  it('returns top-level array response as-is', async () => {
    const body = [{ name: 'pod-a' }, { name: 'pod-b' }]
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    const result = await fetchInClusterCollection<{ name: string }>('pods', params, 'pods')

    expect(result).toEqual(body)
  })

  it('extracts keyed array from object response', async () => {
    const body = { pods: [{ name: 'pod-a' }] }
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    const result = await fetchInClusterCollection<{ name: string }>('pods', params, 'pods')

    expect(result).toEqual([{ name: 'pod-a' }])
  })

  it('returns empty array when collection key is missing', async () => {
    const body = { items: [{ name: 'pod-a' }] }
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    const result = await fetchInClusterCollection<{ name: string }>('pods', params, 'pods')

    expect(result).toEqual([])
  })

  it('returns empty array when collection key is not an array', async () => {
    const body = { pods: { name: 'not-array' } }
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    const result = await fetchInClusterCollection<{ name: string }>('pods', params, 'pods')

    expect(result).toEqual([])
  })

  it('calls the expected endpoint with query params', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pods: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const params = new URLSearchParams({ cluster: 'cluster-a', namespace: 'default' })
    await fetchInClusterCollection('pods', params, 'pods')

    expect(globalThis.fetch as Mock).toHaveBeenCalledTimes(1)
    const [url] = (globalThis.fetch as Mock).mock.calls[0]
    expect(url).toBe('/api/mcp/pods?cluster=cluster-a&namespace=default')
  })

  it('passes AbortSignal.timeout(MCP_HOOK_TIMEOUT_MS) as signal', async () => {
    const signal = new AbortController().signal
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pods: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    await fetchInClusterCollection('pods', params, 'pods')

    expect(timeoutSpy).toHaveBeenCalledWith(MCP_HOOK_TIMEOUT_MS)
    const [, options] = (globalThis.fetch as Mock).mock.calls[0]
    expect(options.signal).toBe(signal)
  })

  it('returns null and logs when fetch throws', async () => {
    const err = new Error('network fail')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockRejectedValue(err)

    const params = new URLSearchParams({ cluster: 'cluster-a' })
    const result = await fetchInClusterCollection<{ name: string }>('pods', params, 'pods')

    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
  })
})
