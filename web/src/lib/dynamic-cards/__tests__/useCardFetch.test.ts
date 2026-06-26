import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createCardFetchScope } from '../useCardFetch'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const MOCK_TOKEN = 'test-jwt-token'
const MOCK_JSON_RESPONSE = { message: 'hello' }

/** Mock localStorage for STORAGE_KEY_TOKEN lookup */
beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

describe('createCardFetchScope', () => {
  it('returns useCardFetch and resetCount', () => {
    const scope = createCardFetchScope()
    expect(typeof scope.useCardFetch).toBe('function')
    expect(typeof scope.resetCount).toBe('function')
  })

  it('resetCount does not throw', () => {
    const scope = createCardFetchScope()
    expect(() => scope.resetCount()).not.toThrow()
  })
})

describe('useCardFetch', () => {
  let scope: ReturnType<typeof createCardFetchScope>

  beforeEach(() => {
    scope = createCardFetchScope()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(MOCK_JSON_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial loading state when url is provided', () => {
    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/data'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns idle state when url is null', () => {
    const { result } = renderHook(() => scope.useCardFetch(null))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns idle state when url is undefined', () => {
    const { result } = renderHook(() => scope.useCardFetch(undefined))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('fetches data through the proxy endpoint', async () => {
    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/data'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/card-proxy?url=https%3A%2F%2Fapi.test.com%2Fdata',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(result.current.data).toEqual(MOCK_JSON_RESPONSE)
    expect(result.current.error).toBeNull()
  })

  it('includes Authorization header when token is in localStorage', async () => {
    localStorage.setItem('token', MOCK_TOKEN)

    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/data'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1].headers).toEqual({ Authorization: `Bearer ${MOCK_TOKEN}` })
  })

  it('does not include Authorization header when no token', async () => {
    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/data'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fetchCall[1].headers).toEqual({})
  })

  it('handles HTTP error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/missing'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Not Found')
    expect(result.current.data).toBeNull()
  })

  it('provides a refetch function', async () => {
    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/data'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(typeof result.current.refetch).toBe('function')

    // Clear the previous mock calls
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockClear()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'refreshed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    act(() => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('does not fetch when skip option is true', () => {
    const { result } = renderHook(() =>
      scope.useCardFetch('https://api.test.com/data', { skip: true })
    )

    expect(result.current.loading).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('handles non-JSON responses with a descriptive error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Not JSON</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    )

    const { result } = renderHook(() => scope.useCardFetch('https://api.test.com/data'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toContain('not valid JSON')
  })

  it('enforces concurrency limit per scope', async () => {
    /** Maximum concurrent useCardFetch hooks per card scope */
    const MAX_CONCURRENT_FETCHES = 5
    // Create a scope and exhaust its concurrency with never-resolving fetches
    const limitScope = createCardFetchScope()
    const resolvers: Array<(v: Response) => void> = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return new Promise<Response>((resolve) => {
        resolvers.push(resolve)
      })
    })

    // Render hooks up to the concurrency limit + 1
    const hooks = []
    for (let i = 0; i <= MAX_CONCURRENT_FETCHES; i++) {
      hooks.push(
        renderHook(() => limitScope.useCardFetch(`https://api.test.com/data/${i}`))
      )
    }

    // The last hook should hit the concurrency limit
    await waitFor(() => {
      const lastHook = hooks[MAX_CONCURRENT_FETCHES]
      expect(lastHook.result.current.error).toContain('Too many concurrent fetches')
    })
  })
})
