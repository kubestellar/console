import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  UnauthenticatedError,
  UnauthorizedError,
  RateLimitError,
  BackendUnavailableError,
  safeJson,
  isBackendUnavailable,
  checkBackendAvailability,
  checkOAuthConfigured,
} from './api'

describe('api.ts error classes', () => {
  describe('UnauthenticatedError', () => {
    it('has correct name and message', () => {
      const err = new UnauthenticatedError()
      expect(err.name).toBe('UnauthenticatedError')
      expect(err.message).toBe('No authentication token available')
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('UnauthorizedError', () => {
    it('has correct name and message', () => {
      const err = new UnauthorizedError()
      expect(err.name).toBe('UnauthorizedError')
      expect(err.message).toBe('Token is invalid or expired')
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('RateLimitError', () => {
    it('has correct name, message, and retryAfter', () => {
      const err = new RateLimitError(120)
      expect(err.name).toBe('RateLimitError')
      expect(err.message).toBe('Rate limited. Try again in 120 seconds.')
      expect(err.retryAfter).toBe(120)
      expect(err).toBeInstanceOf(Error)
    })

    it('stores retryAfter value', () => {
      const err = new RateLimitError(30)
      expect(err.retryAfter).toBe(30)
    })
  })

  describe('BackendUnavailableError', () => {
    it('has correct name and message', () => {
      const err = new BackendUnavailableError()
      expect(err.name).toBe('BackendUnavailableError')
      expect(err.message).toBe('Backend API is currently unavailable')
      expect(err).toBeInstanceOf(Error)
    })
  })
})

describe('safeJson', () => {
  it('parses JSON response with correct content-type', async () => {
    const data = { foo: 'bar', count: 42 }
    const response = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json' },
    })
    const result = await safeJson<typeof data>(response)
    expect(result).toEqual(data)
  })

  it('throws when content-type is text/html', async () => {
    const response = new Response('<html></html>', {
      headers: { 'content-type': 'text/html' },
    })
    await expect(safeJson(response)).rejects.toThrow(
      'Expected JSON response but received text/html'
    )
  })

  it('throws when content-type is missing', async () => {
    const response = new Response('not json', {
      headers: {},
    })
    await expect(safeJson(response)).rejects.toThrow(
      'Expected JSON response but received unknown content-type'
    )
  })

  it('accepts application/json with charset', async () => {
    const data = { msg: 'hello' }
    const response = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
    const result = await safeJson<typeof data>(response)
    expect(result).toEqual(data)
  })
})

describe('isBackendUnavailable', () => {
  it('returns false on initial load (unknown state)', () => {
    // On fresh module load, backendAvailable is null (unknown)
    // The function should return false to allow first request
    expect(isBackendUnavailable()).toBe(false)
  })
})

describe('checkBackendAvailability', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when /health responds successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"status":"ok"}', { status: 200 })
    )
    vi.stubGlobal('fetch', mockFetch)

    const result = await checkBackendAvailability(true)
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      '/health',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('returns false when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const result = await checkBackendAvailability(true)
    expect(result).toBe(false)
  })

  it('returns false when /health responds with 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('error', { status: 500 })
    ))

    const result = await checkBackendAvailability(true)
    expect(result).toBe(false)
  })

  it('returns true when /health responds with 4xx (backend is up)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('not found', { status: 404 })
    ))

    const result = await checkBackendAvailability(true)
    expect(result).toBe(true)
  })
})

describe('checkOAuthConfigured', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns backendUp=true, oauthConfigured=true when health says configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ oauth_configured: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ))

    const result = await checkOAuthConfigured()
    expect(result.backendUp).toBe(true)
    expect(result.oauthConfigured).toBe(true)
  })

  it('returns backendUp=true, oauthConfigured=false when not configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ oauth_configured: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ))

    const result = await checkOAuthConfigured()
    expect(result.backendUp).toBe(true)
    expect(result.oauthConfigured).toBe(false)
  })

  it('returns backendUp=false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    const result = await checkOAuthConfigured()
    expect(result.backendUp).toBe(false)
    expect(result.oauthConfigured).toBe(false)
  })

  it('returns backendUp=false when /health returns non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('', { status: 503 })
    ))

    const result = await checkOAuthConfigured()
    expect(result.backendUp).toBe(false)
    expect(result.oauthConfigured).toBe(false)
  })
})
