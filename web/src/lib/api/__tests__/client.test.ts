/**
 * Unit coverage for lib/api/client.ts — ApiClient methods (get/post/patch/put/delete),
 * the `authFetch` helper, and the X-Token-Refresh silent refresh trigger.
 *
 * All collaborator modules (backend, session, helpers, authToken, analytics,
 * errors/handleError, constants) are mocked so tests exercise the ApiClient
 * logic against a controllable global fetch and never touch the real network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockGetStoredAuthToken,
  mockEmitHttpError,
  mockReportAppError,
  mockHandle401,
  mockHandle429,
  mockCheckBackendAvailability,
  mockMarkBackendFailure,
  mockMarkBackendSuccess,
  mockShouldTreatAsBackendOutage,
  mockExtractRequestPath,
} = vi.hoisted(() => ({
  mockGetStoredAuthToken: vi.fn<[], Promise<string | null>>(async () => 'test-token'),
  mockEmitHttpError: vi.fn(),
  mockReportAppError: vi.fn(),
  mockHandle401: vi.fn(),
  mockHandle429: vi.fn(),
  mockCheckBackendAvailability: vi.fn<[], Promise<boolean>>(async () => true),
  mockMarkBackendFailure: vi.fn(),
  mockMarkBackendSuccess: vi.fn(),
  mockShouldTreatAsBackendOutage: vi.fn<[unknown, number], boolean>(() => false),
  mockExtractRequestPath: vi.fn<[unknown], string>((input: unknown) => String(input)),
}))

vi.mock('../../authToken', () => ({
  getStoredAuthToken: () => mockGetStoredAuthToken(),
}))
vi.mock('../../analytics', () => ({
  emitHttpError: (...args: unknown[]) => mockEmitHttpError(...args),
}))
vi.mock('../../errors/handleError', () => ({
  reportAppError: (...args: unknown[]) => mockReportAppError(...args),
}))
vi.mock('../session', () => ({
  handle401: () => mockHandle401(),
  handle429: (r: Response) => mockHandle429(r),
}))
vi.mock('../backend', () => ({
  checkBackendAvailability: () => mockCheckBackendAvailability(),
  markBackendFailure: (status?: number) => mockMarkBackendFailure(status),
  markBackendSuccess: (status?: number) => mockMarkBackendSuccess(status),
  shouldTreatAsBackendOutage: (input: unknown, status: number) => mockShouldTreatAsBackendOutage(input, status),
  extractRequestPath: (input: unknown) => mockExtractRequestPath(input),
}))
vi.mock('../../constants', () => ({
  MCP_HOOK_TIMEOUT_MS: 30_000,
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  DEMO_TOKEN_VALUE: 'demo-token',
  STORAGE_KEY_HAS_SESSION: 'kc-has-session',
}))

// ---------------------------------------------------------------------------
// Imports under test — after mocks.
// ---------------------------------------------------------------------------
import { api, authFetch } from '../client'
import {
  UnauthenticatedError,
  UnauthorizedError,
  BackendUnavailableError,
} from '../types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function errorResponse(status: number, text = '', extraHeaders: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain', ...extraHeaders },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  mockGetStoredAuthToken.mockReset().mockResolvedValue('test-token')
  mockEmitHttpError.mockReset()
  mockReportAppError.mockReset()
  mockHandle401.mockReset()
  mockHandle429.mockReset()
  mockCheckBackendAvailability.mockReset().mockResolvedValue(true)
  mockMarkBackendFailure.mockReset()
  mockMarkBackendSuccess.mockReset()
  mockShouldTreatAsBackendOutage.mockReset().mockReturnValue(false)
  mockExtractRequestPath.mockReset().mockImplementation((input: unknown) => String(input))

  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ===========================================================================
// api.get
// ===========================================================================
describe('api.get', () => {
  it('throws UnauthenticatedError for protected paths when no token is present', async () => {
    mockGetStoredAuthToken.mockResolvedValue(null)
    await expect(api.get('/api/private')).rejects.toBeInstanceOf(UnauthenticatedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips auth check for known public prefixes', async () => {
    mockGetStoredAuthToken.mockResolvedValue(null)
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }))
    const { data } = await api.get<{ items: string[] }>('/api/missions/browse')
    expect(data).toEqual({ items: [] })
  })

  it('skips auth check when requiresAuth is explicitly false', async () => {
    mockGetStoredAuthToken.mockResolvedValue(null)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    const { data } = await api.get<{ ok: boolean }>('/anything', { requiresAuth: false })
    expect(data).toEqual({ ok: true })
  })

  it('treats a cookie-only session (kc-has-session) as authenticated', async () => {
    mockGetStoredAuthToken.mockResolvedValue(null)
    localStorage.setItem('kc-has-session', 'true')
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))
    await expect(api.get('/api/private')).resolves.toEqual({ data: { ok: true } })
  })

  it('does not treat demo-token as a real session', async () => {
    mockGetStoredAuthToken.mockResolvedValue('demo-token')
    await expect(api.get('/api/private')).rejects.toBeInstanceOf(UnauthenticatedError)
  })

  it('throws BackendUnavailableError when backend health check fails', async () => {
    mockCheckBackendAvailability.mockResolvedValueOnce(false)
    await expect(api.get('/api/x')).rejects.toBeInstanceOf(BackendUnavailableError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends Authorization + X-Requested-With headers on the underlying fetch', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }))
    await api.get('/api/x')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-token')
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(init.method).toBe('GET')
  })

  it('merges caller-provided headers on top of the defaults', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await api.get('/api/x', { headers: { 'X-Custom': 'value' } })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Custom']).toBe('value')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('returns {} when the response body is empty JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, {
      status: 204,
      headers: { 'content-type': 'application/json' },
    }))
    const { data } = await api.get('/api/empty')
    expect(data).toEqual({})
  })

  it('calls handle401 and throws UnauthorizedError on 401 for a non-github path', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, 'no'))
    await expect(api.get('/api/x')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockHandle401).toHaveBeenCalledTimes(1)
  })

  it('does NOT call handle401 on 401 for /api/github/ paths', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401))
    await expect(api.get('/api/github/repo')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockHandle401).not.toHaveBeenCalled()
  })

  it('calls handle429 on 429', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(429, 'slow down'))
    await expect(api.get('/api/x')).rejects.toThrow()
    expect(mockHandle429).toHaveBeenCalledTimes(1)
  })

  it('emits an http error metric for non-401 failures', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'boom'))
    await expect(api.get('/api/x')).rejects.toThrow('boom')
    expect(mockEmitHttpError).toHaveBeenCalledWith('500', 'boom')
  })

  it('marks backend success and triggers silent refresh when server sends X-Token-Refresh', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json', 'X-Token-Refresh': 'true' },
    }))
    // /auth/refresh call fired by silentRefresh
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await api.get('/api/x')
    expect(mockMarkBackendSuccess).toHaveBeenCalled()
    // Wait a microtask so the silent refresh promise runs.
    await Promise.resolve()
    await Promise.resolve()
    const refreshCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/auth/refresh'))
    expect(refreshCall).toBeDefined()
  })

  it('translates AbortError into a timeout error and emits timeout metric', async () => {
    const abort = new Error('abort') as Error & { name: string }
    abort.name = 'AbortError'
    fetchMock.mockRejectedValueOnce(abort)
    await expect(api.get('/api/x', { timeout: 5_000 })).rejects.toThrow(/Request timeout/)
    expect(mockEmitHttpError).toHaveBeenCalledWith('timeout', expect.stringContaining('5s'))
  })

  it('marks backend failure and emits network metric on fetch TypeError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('failed to fetch xyz'))
    await expect(api.get('/api/x')).rejects.toThrow('failed to fetch xyz')
    expect(mockMarkBackendFailure).toHaveBeenCalled()
    expect(mockEmitHttpError).toHaveBeenCalledWith('network', 'failed to fetch xyz')
  })
})

// ===========================================================================
// api.post / api.patch / api.put — shared write-path behaviour
// ===========================================================================
describe.each([
  ['post' as const, 'POST'],
  ['patch' as const, 'PATCH'],
  ['put' as const, 'PUT'],
])('api.%s', (methodName, verb) => {
  // Bind to `api` so the ApiClient's private methods (createAbortController,
  // getHeaders, checkTokenRefresh) resolve correctly when the method is
  // dispatched through describe.each.
  const call = (p: string, b?: unknown, o?: unknown) =>
    (api[methodName] as (p: string, b?: unknown, o?: unknown) => Promise<{ data: unknown }>).call(api, p, b, o)

  it(`sends ${verb} with JSON-stringified body`, async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }))
    const { data } = await call('/api/x', { name: 'alice' })
    expect(data).toEqual({ id: 1 })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe(verb)
    expect(init.body).toBe(JSON.stringify({ name: 'alice' }))
  })

  it(`omits body when caller passes undefined`, async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))
    await call('/api/x')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBeUndefined()
  })

  it(`throws BackendUnavailableError when backend is down`, async () => {
    mockCheckBackendAvailability.mockResolvedValueOnce(false)
    await expect(call('/api/x', {})).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it(`calls handle401 on 401 for non-github path`, async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401))
    await expect(call('/api/x', {})).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockHandle401).toHaveBeenCalledTimes(1)
  })

  it(`does not call handle401 on 401 for /api/github/ path`, async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401))
    await expect(call('/api/github/x', {})).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockHandle401).not.toHaveBeenCalled()
  })

  it(`translates AbortError into a timeout`, async () => {
    const abort = new Error('abort') as Error & { name: string }
    abort.name = 'AbortError'
    fetchMock.mockRejectedValueOnce(abort)
    await expect(call('/api/x', {}, { timeout: 2_000 })).rejects.toThrow(/Request timeout/)
  })
})

// ===========================================================================
// api.delete
// ===========================================================================
describe('api.delete', () => {
  it('sends DELETE and resolves without a body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(api.delete('/api/x')).resolves.toBeUndefined()
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('DELETE')
  })

  it('throws BackendUnavailableError when backend is down', async () => {
    mockCheckBackendAvailability.mockResolvedValueOnce(false)
    await expect(api.delete('/api/x')).rejects.toBeInstanceOf(BackendUnavailableError)
  })

  it('calls handle401 on 401 for non-github path', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401))
    await expect(api.delete('/api/x')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockHandle401).toHaveBeenCalledTimes(1)
  })

  it('does not call handle401 on 401 for /api/github/ path', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401))
    await expect(api.delete('/api/github/x')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(mockHandle401).not.toHaveBeenCalled()
  })

  it('emits http error metric on non-401 failure', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'boom'))
    await expect(api.delete('/api/x')).rejects.toThrow('boom')
    expect(mockEmitHttpError).toHaveBeenCalledWith('500', 'boom')
  })
})

// ===========================================================================
// authFetch
// ===========================================================================
describe('authFetch', () => {
  it('injects Authorization + X-Requested-With when a real token exists', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await authFetch('/api/x')
    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  it('does NOT inject Authorization when token is demo-token', async () => {
    mockGetStoredAuthToken.mockResolvedValue('demo-token')
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await authFetch('/api/x')
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBeNull()
    // X-Requested-With is still injected.
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  it('preserves a caller-supplied Authorization header', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await authFetch('/api/x', { headers: { Authorization: 'Bearer custom' } })
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer custom')
  })

  it('marks backend success on a successful non-outage response', async () => {
    mockShouldTreatAsBackendOutage.mockReturnValueOnce(false)
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await authFetch('/api/x')
    expect(mockMarkBackendSuccess).toHaveBeenCalledWith(200)
    expect(mockMarkBackendFailure).not.toHaveBeenCalled()
  })

  it('marks backend failure when the response is treated as an outage', async () => {
    mockShouldTreatAsBackendOutage.mockReturnValueOnce(true)
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 502 }))
    await authFetch('/api/x')
    expect(mockMarkBackendFailure).toHaveBeenCalledWith(502)
  })

  it('calls handle401 on a 401 response for a non-github path', async () => {
    mockExtractRequestPath.mockReturnValueOnce('/api/other')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await authFetch('/api/other')
    expect(mockHandle401).toHaveBeenCalledTimes(1)
  })

  it('does NOT call handle401 on a 401 for /api/github/', async () => {
    mockExtractRequestPath.mockReturnValueOnce('/api/github/token')
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await authFetch('/api/github/token')
    expect(mockHandle401).not.toHaveBeenCalled()
  })

  it('marks backend failure and rethrows when fetch itself throws', async () => {
    const err = new TypeError('network')
    fetchMock.mockRejectedValueOnce(err)
    await expect(authFetch('/api/x')).rejects.toBe(err)
    expect(mockMarkBackendFailure).toHaveBeenCalled()
  })

  it('honors a caller-supplied AbortSignal (no auto-timeout wrapping)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const ctrl = new AbortController()
    await authFetch('/api/x', { signal: ctrl.signal })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBe(ctrl.signal)
  })
})
