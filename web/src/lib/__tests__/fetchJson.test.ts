/**
 * Tests for lib/fetchJson.ts — shared fetch utility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchJson, NOT_INSTALLED_STATUSES } from '../fetchJson'

const mockAuthFetch = vi.fn()

vi.mock('../api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}))

vi.mock('../constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

function makeResponse(status: number, body?: unknown, contentType = 'application/json') {
  const ok = status >= 200 && status < 300
  return {
    ok,
    status,
    json: body !== undefined
      ? () => Promise.resolve(body)
      : () => Promise.reject(new SyntaxError('Unexpected token')),
    headers: new Headers({ 'content-type': contentType }),
  }
}

describe('NOT_INSTALLED_STATUSES', () => {
  it('contains 401, 403, 404, 501, 503', () => {
    expect(NOT_INSTALLED_STATUSES.has(401)).toBe(true)
    expect(NOT_INSTALLED_STATUSES.has(403)).toBe(true)
    expect(NOT_INSTALLED_STATUSES.has(404)).toBe(true)
    expect(NOT_INSTALLED_STATUSES.has(501)).toBe(true)
    expect(NOT_INSTALLED_STATUSES.has(503)).toBe(true)
  })

  it('does not contain 200, 500, 502', () => {
    expect(NOT_INSTALLED_STATUSES.has(200)).toBe(false)
    expect(NOT_INSTALLED_STATUSES.has(500)).toBe(false)
    expect(NOT_INSTALLED_STATUSES.has(502)).toBe(false)
  })
})

describe('fetchJson', () => {
  beforeEach(() => {
    mockAuthFetch.mockReset()
  })

  it('returns parsed data on 200 OK', async () => {
    const payload = { clusters: ['a', 'b'] }
    mockAuthFetch.mockResolvedValueOnce(makeResponse(200, payload))

    const result = await fetchJson<typeof payload>('/api/clusters')
    expect(result).toEqual({ data: payload, failed: false })
  })

  it('returns {data:null, failed:false} for NOT_INSTALLED status 404', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(404))
    const result = await fetchJson('/api/dapr/status')
    expect(result).toEqual({ data: null, failed: false })
  })

  it('returns {data:null, failed:false} for NOT_INSTALLED status 401', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(401))
    const result = await fetchJson('/api/protected')
    expect(result).toEqual({ data: null, failed: false })
  })

  it('returns {data:null, failed:false} for NOT_INSTALLED status 403', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(403))
    const result = await fetchJson('/api/forbidden')
    expect(result).toEqual({ data: null, failed: false })
  })

  it('returns {data:null, failed:false} for NOT_INSTALLED status 501', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(501))
    const result = await fetchJson('/api/not-impl')
    expect(result).toEqual({ data: null, failed: false })
  })

  it('returns {data:null, failed:false} for NOT_INSTALLED status 503', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(503))
    const result = await fetchJson('/api/unavail')
    expect(result).toEqual({ data: null, failed: false })
  })

  it('returns {data:null, failed:true} for non-installed error status (500)', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(500))
    const result = await fetchJson('/api/broken')
    expect(result).toEqual({ data: null, failed: true })
  })

  it('returns {data:null, failed:true} for 502', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(502))
    const result = await fetchJson('/api/gateway')
    expect(result).toEqual({ data: null, failed: true })
  })

  it('returns {data:null, failed:false} when JSON parse fails (Netlify SPA fallback)', async () => {
    const badResp = makeResponse(200, undefined)
    mockAuthFetch.mockResolvedValueOnce(badResp)
    const result = await fetchJson('/api/html-page')
    expect(result).toEqual({ data: null, failed: false })
  })

  it('returns {data:null, failed:true} when authFetch throws (network error)', async () => {
    mockAuthFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const result = await fetchJson('/api/unreachable')
    expect(result).toEqual({ data: null, failed: true })
  })

  it('returns {data:null, failed:true} on AbortError (timeout)', async () => {
    mockAuthFetch.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))
    const result = await fetchJson('/api/slow', 1)
    expect(result).toEqual({ data: null, failed: true })
  })

  it('passes custom timeoutMs to AbortSignal.timeout', async () => {
    const payload = { ok: true }
    mockAuthFetch.mockResolvedValueOnce(makeResponse(200, payload))
    // just verify the call succeeds with a custom timeout
    const result = await fetchJson('/api/fast', 100)
    expect(result.failed).toBe(false)
    expect(result.data).toEqual(payload)
  })

  it('passes Accept: application/json header', async () => {
    mockAuthFetch.mockResolvedValueOnce(makeResponse(200, {}))
    await fetchJson('/api/test')
    const callArgs = mockAuthFetch.mock.calls[0]
    expect(callArgs[1]?.headers?.Accept).toBe('application/json')
  })
})
