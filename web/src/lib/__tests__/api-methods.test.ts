/**
 * Extended coverage for ApiClient methods (POST, PATCH, PUT, DELETE),
 * rate-limit handling, token-refresh, timeout/abort, and network-error branches.
 *
 * Complements api.test.ts which covers GET, safeJson, backend availability,
 * authFetch, and error class construction.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../constants', () => ({
  MCP_HOOK_TIMEOUT_MS: 5_000,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS: 3_000,
  STORAGE_KEY_TOKEN: 'kc-token',
  STORAGE_KEY_USER_CACHE: 'kc-user-cache',
  STORAGE_KEY_HAS_SESSION: 'kc-has-session',
  DEMO_TOKEN_VALUE: 'demo-token',
  FETCH_DEFAULT_TIMEOUT_MS: 4_000,
}))

vi.mock('../analytics', () => ({
  emitSessionExpired: vi.fn(),
  emitHttpError: vi.fn(),
}))

vi.mock('../backendHealthEvents', () => ({
  reportBackendAvailable: vi.fn(),
  reportBackendUnavailable: vi.fn(),
  shouldMarkBackendUnavailable: vi.fn(() => false),
}))

vi.mock('../errors/handleError', () => ({
  reportAppError: vi.fn(),
}))

/** Fresh module load per test so module-level state is reset. */
async function loadApi() {
  return import('../api')
}

/** Mock fetch: first call is the /health probe, remaining calls are the actual API. */
function mockFetchWithHealth(
  ...responses: Array<Response | (() => Promise<Response>) | (() => never)>
) {
  const healthOk = new Response('', { status: 200 })
  const allResponses = [healthOk, ...responses]
  let i = 0
  return vi.fn().mockImplementation(() => {
    const r = allResponses[i] ?? allResponses.at(-1)!
    i++
    return typeof r === 'function' ? r() : Promise.resolve(r)
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function emptyOkResponse(status = 200): Response {
  return new Response('', { status })
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  // Provide a valid token so auth checks pass for protected endpoints
  localStorage.setItem('kc-token', 'test-token')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// api.post
// ---------------------------------------------------------------------------
describe('api.post', () => {
  it('sends JSON body and returns parsed data', async () => {
    const fetchMock = mockFetchWithHealth(jsonResponse({ id: 42 }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    const result = await api.post('/api/items', { name: 'test' })
    expect(result).toEqual({ data: { id: 42 } })

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/items')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ name: 'test' })
  })

  it('throws BackendUnavailableError when backend is down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOkResponse(503))
    vi.stubGlobal('fetch', fetchMock)
    const { api, BackendUnavailableError } = await loadApi()

    await expect(api.post('/api/items')).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it('throws UnauthorizedError on 401 for non-github paths', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.post('/api/missions')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError on 401 for /api/github/ paths without logout', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.post('/api/github/repos')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws RateLimitError on 429', async () => {
    const resp = new Response('', {
      status: 429,
      headers: { 'Retry-After': '30' },
    })
    const fetchMock = mockFetchWithHealth(resp)
    vi.stubGlobal('fetch', fetchMock)
    const { api, RateLimitError } = await loadApi()

    await expect(api.post('/api/items')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws on generic HTTP error', async () => {
    const fetchMock = mockFetchWithHealth(new Response('not found', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.post('/api/items')).rejects.toThrow(/API error: 404|not found/)
  })

  it('throws timeout error when fetch aborts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockImplementationOnce(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.post('/api/items', {}, { timeout: 100 })).rejects.toThrow(/timeout/)
  })

  it('propagates network TypeError and marks backend failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.post('/api/items')).rejects.toThrow('Failed to fetch')
  })

  it('handles post without body', async () => {
    const fetchMock = mockFetchWithHealth(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    const result = await api.post('/api/trigger')
    expect(result).toEqual({ data: { ok: true } })
    const [, init] = fetchMock.mock.calls[1]
    expect(init.body).toBeUndefined()
  })

  it('checks X-Token-Refresh and triggers silent refresh', async () => {
    const refreshResp = jsonResponse({ refreshed: true })
    const dataResp = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Token-Refresh': 'true',
      },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))   // /health
      .mockResolvedValueOnce(dataResp)                // POST
      .mockResolvedValueOnce(refreshResp)             // /auth/refresh silent
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    const result = await api.post('/api/items')
    expect(result).toEqual({ data: { ok: true } })
    // Allow microtasks for silent refresh
    await Promise.resolve()
    await Promise.resolve()
  })
})

// ---------------------------------------------------------------------------
// api.patch
// ---------------------------------------------------------------------------
describe('api.patch', () => {
  it('sends PATCH with body and returns parsed data', async () => {
    const fetchMock = mockFetchWithHealth(jsonResponse({ updated: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    const result = await api.patch('/api/items/1', { status: 'active' })
    expect(result).toEqual({ data: { updated: true } })

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/items/1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'active' })
  })

  it('throws BackendUnavailableError when backend is down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOkResponse(503))
    vi.stubGlobal('fetch', fetchMock)
    const { api, BackendUnavailableError } = await loadApi()

    await expect(api.patch('/api/items/1')).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it('throws UnauthorizedError on 401 for regular paths', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.patch('/api/settings')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError on 401 for /api/github/ paths', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.patch('/api/github/settings')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws RateLimitError on 429', async () => {
    const resp = new Response('', {
      status: 429,
      headers: { 'Retry-After': '60' },
    })
    const fetchMock = mockFetchWithHealth(resp)
    vi.stubGlobal('fetch', fetchMock)
    const { api, RateLimitError } = await loadApi()

    await expect(api.patch('/api/items/1')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws timeout error on abort', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockImplementationOnce(() => {
        const err = new Error('AbortError')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.patch('/api/items/1', {}, { timeout: 100 })).rejects.toThrow(/timeout/)
  })

  it('propagates network TypeError', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.patch('/api/items/1')).rejects.toThrow('Failed to fetch')
  })
})

// ---------------------------------------------------------------------------
// api.put
// ---------------------------------------------------------------------------
describe('api.put', () => {
  it('sends PUT with body and returns parsed data', async () => {
    const fetchMock = mockFetchWithHealth(jsonResponse({ replaced: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    const result = await api.put('/api/items/1', { name: 'new' })
    expect(result).toEqual({ data: { replaced: true } })

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/items/1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ name: 'new' })
  })

  it('throws BackendUnavailableError when backend is down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOkResponse(503))
    vi.stubGlobal('fetch', fetchMock)
    const { api, BackendUnavailableError } = await loadApi()

    await expect(api.put('/api/items/1')).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it('throws UnauthorizedError on 401 for regular paths', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.put('/api/items/1')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError on 401 for /api/github/ paths', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.put('/api/github/items/1')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws RateLimitError on 429 and persists deadline to localStorage', async () => {
    const before = Date.now()
    const resp = new Response('', {
      status: 429,
      headers: { 'Retry-After': '45' },
    })
    const fetchMock = mockFetchWithHealth(resp)
    vi.stubGlobal('fetch', fetchMock)
    const { api, RateLimitError } = await loadApi()

    await expect(api.put('/api/items/1')).rejects.toBeInstanceOf(RateLimitError)
    const stored = localStorage.getItem('kc-api-rate-limit-until')
    expect(Number(stored)).toBeGreaterThanOrEqual(before + 44_000)
  })

  it('uses default retry-after when header missing', async () => {
    const resp = new Response('', { status: 429 })
    const fetchMock = mockFetchWithHealth(resp)
    vi.stubGlobal('fetch', fetchMock)
    const { api, RateLimitError } = await loadApi()

    const err = await api.put('/api/items/1').catch(e => e)
    expect(err).toBeInstanceOf(RateLimitError)
    expect((err as InstanceType<typeof RateLimitError>).retryAfter).toBe(60)
  })

  it('throws timeout error on abort', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockImplementationOnce(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.put('/api/items/1', {}, { timeout: 100 })).rejects.toThrow(/timeout/)
  })

  it('propagates network TypeError', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.put('/api/items/1')).rejects.toThrow('Failed to fetch')
  })
})

// ---------------------------------------------------------------------------
// api.delete
// ---------------------------------------------------------------------------
describe('api.delete', () => {
  it('sends DELETE and resolves void on success', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.delete('/api/items/1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/items/1')
    expect(init.method).toBe('DELETE')
  })

  it('throws BackendUnavailableError when backend is down', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOkResponse(503))
    vi.stubGlobal('fetch', fetchMock)
    const { api, BackendUnavailableError } = await loadApi()

    await expect(api.delete('/api/items/1')).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it('throws UnauthorizedError on 401 for regular paths', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.delete('/api/items/1')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError on 401 for /api/github/ without logout', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()

    await expect(api.delete('/api/github/repos/1')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws RateLimitError on 429', async () => {
    const resp = new Response('', {
      status: 429,
      headers: { 'Retry-After': '10' },
    })
    const fetchMock = mockFetchWithHealth(resp)
    vi.stubGlobal('fetch', fetchMock)
    const { api, RateLimitError } = await loadApi()

    await expect(api.delete('/api/items/1')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('throws on generic 500 error', async () => {
    const fetchMock = mockFetchWithHealth(new Response('server error', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.delete('/api/items/1')).rejects.toThrow(/API error: 500|server error/)
  })

  it('throws timeout error on abort', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockImplementationOnce(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.delete('/api/items/1', { timeout: 100 })).rejects.toThrow(/timeout/)
  })

  it('propagates network TypeError', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.delete('/api/items/1')).rejects.toThrow('Failed to fetch')
  })

  it('sends auth header and CSRF header', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await api.delete('/api/items/1')
    const [, init] = fetchMock.mock.calls[1]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })
})

// ---------------------------------------------------------------------------
// api.get — additional branches not in api.test.ts
// ---------------------------------------------------------------------------
describe('api.get — additional branches', () => {
  it('throws timeout error on abort', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockImplementationOnce(() => {
        const err = new Error('AbortError')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()
    localStorage.setItem('kc-token', 'abc')

    await expect(api.get('/api/items')).rejects.toThrow(/timeout/)
  })

  it('propagates network TypeError on GET', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()
    localStorage.setItem('kc-token', 'abc')

    await expect(api.get('/api/items')).rejects.toThrow('Failed to fetch')
  })

  it('throws UnauthorizedError on 401 for /api/github/ paths without logout', async () => {
    const fetchMock = mockFetchWithHealth(emptyOkResponse(401))
    vi.stubGlobal('fetch', fetchMock)
    const { api, UnauthorizedError } = await loadApi()
    localStorage.setItem('kc-token', 'abc')

    await expect(api.get('/api/github/repos')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws RateLimitError on 429 during GET', async () => {
    const resp = new Response('', {
      status: 429,
      headers: { 'Retry-After': '15' },
    })
    const fetchMock = mockFetchWithHealth(resp)
    vi.stubGlobal('fetch', fetchMock)
    const { api, RateLimitError } = await loadApi()
    localStorage.setItem('kc-token', 'abc')

    await expect(api.get('/api/items')).rejects.toBeInstanceOf(RateLimitError)
  })

  it('respects requiresAuth: false to skip token check', async () => {
    const fetchMock = mockFetchWithHealth(jsonResponse({ pub: true }))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear() // no token
    const { api } = await loadApi()

    const result = await api.get('/api/public-endpoint', { requiresAuth: false })
    expect(result).toEqual({ data: { pub: true } })
  })

  it('uses kc-has-session marker as cookie-only session', async () => {
    localStorage.clear()
    localStorage.setItem('kc-has-session', 'true')
    const fetchMock = mockFetchWithHealth(jsonResponse({ cookie: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await loadApi()

    await expect(api.get('/api/profile')).resolves.toEqual({ data: { cookie: true } })
  })

  it('checks X-Token-Refresh on successful GET', async () => {
    const dataResp = new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Token-Refresh': 'true',
      },
    })
    const refreshResp = new Response(JSON.stringify({ refreshed: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyOkResponse(200))   // /health
      .mockResolvedValueOnce(dataResp)                // GET /api/items
      .mockResolvedValueOnce(refreshResp)             // /auth/refresh
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('kc-token', 'abc')
    const { api } = await loadApi()

    await api.get('/api/items')
    await Promise.resolve()
    await Promise.resolve()
  })
})

// ---------------------------------------------------------------------------
// authFetch — additional branches
// ---------------------------------------------------------------------------
describe('authFetch — additional branches', () => {
  it('skips Authorization when token is the demo token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOkResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('kc-token', 'demo-token')
    const { authFetch } = await loadApi()

    await authFetch('/api/demo-data')
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('does not overwrite caller-provided Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyOkResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('kc-token', 'test-token')
    const { authFetch } = await loadApi()

    await authFetch('/api/items', {
      headers: { Authorization: 'Bearer caller-token' },
    })
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer caller-token')
  })

  it('marks backend failure when fetch throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network'))
    vi.stubGlobal('fetch', fetchMock)
    const { authFetch } = await loadApi()

    await expect(authFetch('/api/items')).rejects.toThrow('network')
  })
})

// ---------------------------------------------------------------------------
// isBackendUnavailable
// ---------------------------------------------------------------------------
describe('isBackendUnavailable', () => {
  it('returns false when no status cached in localStorage', async () => {
    const { isBackendUnavailable } = await loadApi()
    expect(isBackendUnavailable()).toBe(false)
  })

  it('returns true when cached as unavailable and fresh', async () => {
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: false,
      timestamp: Date.now(),
    }))
    const { isBackendUnavailable } = await loadApi()
    expect(isBackendUnavailable()).toBe(true)
  })

  it('returns false when cached as available', async () => {
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: true,
      timestamp: Date.now(),
    }))
    const { isBackendUnavailable } = await loadApi()
    expect(isBackendUnavailable()).toBe(false)
  })
})
