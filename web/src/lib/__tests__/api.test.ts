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

async function loadApi() {
  return import('../api')
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('api errors', () => {
  it('constructs exported error classes', async () => {
    const { UnauthenticatedError, UnauthorizedError, RateLimitError, BackendUnavailableError } = await loadApi()

    expect(new UnauthenticatedError()).toMatchObject({
      name: 'UnauthenticatedError',
      message: 'No authentication token available',
    })
    expect(new UnauthorizedError()).toMatchObject({
      name: 'UnauthorizedError',
      message: 'Token is invalid or expired',
    })
    expect(new RateLimitError(30)).toMatchObject({
      name: 'RateLimitError',
      message: 'Rate limited. Try again in 30 seconds.',
      retryAfter: 30,
    })
    expect(new BackendUnavailableError()).toMatchObject({
      name: 'BackendUnavailableError',
      message: 'Backend API is currently unavailable',
    })
  })
})

describe('safeJson', () => {
  it('parses JSON responses', async () => {
    const { safeJson } = await loadApi()
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    await expect(safeJson(response)).resolves.toEqual({ ok: true })
  })

  it('rejects non-JSON responses', async () => {
    const { safeJson } = await loadApi()
    const response = new Response('plain text', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })

    await expect(safeJson(response)).rejects.toThrow(/Expected JSON response/)
  })
})

describe('backend availability', () => {
  it('uses cached unavailable state until recheck window expires', async () => {
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: false,
      timestamp: Date.now(),
    }))

    const { isBackendUnavailable } = await loadApi()
    expect(isBackendUnavailable()).toBe(true)
  })

  it('allows recheck after cached unavailable state gets stale', async () => {
    localStorage.setItem('kc-backend-status', JSON.stringify({
      available: false,
      timestamp: Date.now() - 20_000,
    }))

    const { isBackendUnavailable } = await loadApi()
    expect(isBackendUnavailable()).toBe(false)
  })

  it('dedupes concurrent health checks and caches success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { checkBackendAvailability } = await loadApi()

    await expect(checkBackendAvailability()).resolves.toBe(true)
    await expect(checkBackendAvailability()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('kc-backend-status') as string)).toMatchObject({
      available: true,
    })
  })

  it('shares in-flight failure result without persisting false state', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)
    const { checkBackendAvailability } = await loadApi()

    const first = checkBackendAvailability()
    const second = checkBackendAvailability()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(localStorage.getItem('kc-backend-status')).toBeNull()
  })
})

describe('oauth config', () => {
  it('returns backendUp true when /health reports oauth_configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ oauth_configured: true }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )))
    const { checkOAuthConfigured } = await loadApi()

    await expect(checkOAuthConfigured()).resolves.toEqual({
      backendUp: true,
      oauthConfigured: true,
    })
  })

  it('returns false when /health is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })))
    const { checkOAuthConfigured } = await loadApi()

    await expect(checkOAuthConfigured()).resolves.toEqual({
      backendUp: false,
      oauthConfigured: false,
    })
  })

  it('retries until backend comes up', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ oauth_configured: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { checkOAuthConfiguredWithRetry } = await loadApi()

    const pending = checkOAuthConfiguredWithRetry()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toEqual({
      backendUp: true,
      oauthConfigured: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('authFetch', () => {
  it('adds auth and CSRF headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('kc-token', 'abc123')
    const { authFetch } = await loadApi()

    await expect(authFetch('/api/demo')).resolves.toBeInstanceOf(Response)

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer abc123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })
})

describe('api client', () => {
  it('gets public data after backend health check', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mission: 'demo' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem('kc-token', 'abc123')
    const { api } = await loadApi()

    await expect(api.get('/api/missions/browse')).resolves.toEqual({
      data: { mission: 'demo' },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/health', expect.objectContaining({
      method: 'GET',
    }))
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer abc123')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  it('rejects protected routes without credentials', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { api, UnauthenticatedError } = await loadApi()

    await expect(api.get('/api/private')).rejects.toBeInstanceOf(UnauthenticatedError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
