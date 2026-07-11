import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  api,
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
  UnauthenticatedError,
  UnauthorizedError,
  RateLimitError,
  BackendUnavailableError,
} from './api'
import {
  getStoredAuthToken,
} from './authToken'

// Mock dependencies
vi.mock('./authToken', () => ({
  getStoredAuthToken: vi.fn(),
  getStoredAuthTokenSync: vi.fn(),
  clearStoredAuthToken: vi.fn(),
}))

vi.mock('./analytics', () => ({
  emitSessionExpired: vi.fn(),
  emitHttpError: vi.fn(),
}))

vi.mock('./backendHealthEvents', () => ({
  reportBackendAvailable: vi.fn(),
  reportBackendUnavailable: vi.fn(),
  shouldMarkBackendUnavailable: vi.fn(() => true),
}))

vi.mock('./errors/handleError', () => ({
  reportAppError: vi.fn(),
}))

describe('api.ts - HTTP client layer', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.clearAllMocks()
    localStorage.clear()
    
    // Mock getStoredAuthToken to return a valid token by default
    vi.mocked(getStoredAuthToken).mockResolvedValue('test-token-123')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Error classes', () => {
    it('creates UnauthenticatedError with correct properties', () => {
      const error = new UnauthenticatedError()
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('UnauthenticatedError')
      expect(error.message).toBe('No authentication token available')
    })

    it('creates UnauthorizedError with correct properties', () => {
      const error = new UnauthorizedError()
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('UnauthorizedError')
      expect(error.message).toBe('Token is invalid or expired')
    })

    it('creates RateLimitError with retry-after seconds', () => {
      const error = new RateLimitError(60)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('RateLimitError')
      expect(error.retryAfter).toBe(60)
      expect(error.message).toContain('60 seconds')
    })

    it('creates BackendUnavailableError with correct properties', () => {
      const error = new BackendUnavailableError()
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Backend API is currently unavailable')
    })
  })

  describe('checkBackendAvailability', () => {
    it('returns true when /health responds with status < 500', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      
      const result = await checkBackendAvailability()
      
      expect(result).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith(
        '/health',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('returns false when /health responds with 5xx', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
      
      const result = await checkBackendAvailability()
      
      expect(result).toBe(false)
    })

    it('returns false when fetch throws network error', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      
      const result = await checkBackendAvailability()
      
      expect(result).toBe(false)
    })

    it('caches result in localStorage on success', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      
      await checkBackendAvailability()
      
      const cached = localStorage.getItem('kc-backend-status')
      expect(cached).toBeTruthy()
      const parsed = JSON.parse(cached!)
      expect(parsed.available).toBe(true)
      expect(parsed.timestamp).toBeGreaterThan(0)
    })

    it('does not cache false to localStorage (failure case)', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      
      await checkBackendAvailability()
      
      const cached = localStorage.getItem('kc-backend-status')
      expect(cached).toBeNull()
    })

    it('deduplicates concurrent checks (only one fetch)', async () => {
      fetchMock.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(new Response('{}', { status: 200 })), 100))
      )
      
      const [result1, result2, result3] = await Promise.all([
        checkBackendAvailability(),
        checkBackendAvailability(),
        checkBackendAvailability(),
      ])
      
      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(result3).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('bypasses cache when forceCheck=true', async () => {
      fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
      
      await checkBackendAvailability()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      
      await checkBackendAvailability(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('checkOAuthConfigured', () => {
    it('returns backendUp=true and oauthConfigured=true when configured', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ oauth_configured: true }), { status: 200 })
      )
      
      const result = await checkOAuthConfigured()
      
      expect(result).toEqual({ backendUp: true, oauthConfigured: true, inCluster: false })
    })

    it('returns backendUp=true and oauthConfigured=false when not configured', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ oauth_configured: false }), { status: 200 })
      )
      
      const result = await checkOAuthConfigured()
      
      expect(result).toEqual({ backendUp: true, oauthConfigured: false, inCluster: false })
    })

    it('returns backendUp=false when /health returns non-200', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
      
      const result = await checkOAuthConfigured()
      
      expect(result).toEqual({ backendUp: false, oauthConfigured: false, inCluster: false })
    })

    it('returns backendUp=false on network error', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      
      const result = await checkOAuthConfigured()
      
      expect(result).toEqual({ backendUp: false, oauthConfigured: false, inCluster: false })
    })

    it('handles empty response body gracefully', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('', { status: 200, headers: { 'content-length': '0' } })
      )
      
      const result = await checkOAuthConfigured()
      
      expect(result.backendUp).toBe(true)
    })
  })

  describe('checkOAuthConfiguredWithRetry', () => {
    it('returns immediately on first success', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ oauth_configured: true }), { status: 200 })
      )
      
      const start = Date.now()
      const result = await checkOAuthConfiguredWithRetry()
      const elapsed = Date.now() - start
      
      expect(result).toEqual({ backendUp: true, oauthConfigured: true, inCluster: false })
      expect(elapsed).toBeLessThan(500) // Should not wait if first attempt succeeds
    })

    it('retries on failure and returns last result', async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ oauth_configured: true }), { status: 200 })
        )
      
      const result = await checkOAuthConfiguredWithRetry()
      
      expect(result).toEqual({ backendUp: true, oauthConfigured: true, inCluster: false })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  describe('isBackendUnavailable', () => {
    it('returns false when backend status is unknown', () => {
      expect(isBackendUnavailable()).toBe(false)
    })

    it('returns false when backend is available', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      
      expect(isBackendUnavailable()).toBe(false)
    })

    it('returns true immediately after backend failure', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await checkBackendAvailability()
      
      expect(isBackendUnavailable()).toBe(true)
    })
  })

  describe('ApiClient - GET requests', () => {
    beforeEach(async () => {
      // Ensure backend is marked available
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('sends GET request with Authorization header', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
      )
      
      const result = await api.get('/api/test')
      
      expect(result.data).toEqual({ result: 'ok' })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          }),
        })
      )
    })

    it('throws UnauthenticatedError when no token for protected endpoint', async () => {
      vi.mocked(getStoredAuthToken).mockResolvedValue(null)
      
      await expect(api.get('/api/protected')).rejects.toThrow(UnauthenticatedError)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('allows public API paths without token', async () => {
      vi.mocked(getStoredAuthToken).mockResolvedValue(null)
      
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ missions: [] }), { status: 200 })
      )
      
      const result = await api.get('/api/missions/browse')
      
      expect(result.data).toEqual({ missions: [] })
      expect(fetchMock).toHaveBeenCalled()
    })

    it('throws UnauthorizedError on 401 response', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      
      // Mock the session verify probe to also return 401
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      
      await expect(api.get('/api/test')).rejects.toThrow(UnauthorizedError)
    })

    it('throws RateLimitError on 429 with Retry-After header', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Too Many Requests', { 
          status: 429,
          headers: { 'Retry-After': '120' }
        })
      )
      
      await expect(api.get('/api/test')).rejects.toThrow(RateLimitError)
      
      const rateLimitUntil = localStorage.getItem('kc-api-rate-limit-until')
      expect(rateLimitUntil).toBeTruthy()
    })

    it('handles 4xx errors with error message in body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Resource not found', { status: 404 })
      )
      
      await expect(api.get('/api/test')).rejects.toThrow('Resource not found')
    })

    it('handles 5xx errors', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      )
      
      await expect(api.get('/api/test')).rejects.toThrow()
    })

    it('handles network errors (fetch failure)', async () => {
      // Backend check succeeds first
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
      
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      
      await expect(api.get('/api/test')).rejects.toThrow()
    })

    it('handles timeout with AbortError', async () => {
      fetchMock.mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 100)
        )
      )
      
      await expect(api.get('/api/test', { timeout: 50 })).rejects.toThrow(/timeout/)
    })

    it('parses JSON response body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 })
      )
      
      const result = await api.get<{ items: number[] }>('/api/test')
      
      expect(result.data.items).toEqual([1, 2, 3])
    })

    it('handles empty response body (204 No Content)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(null, { status: 204 })
      )
      
      const result = await api.get('/api/test')
      
      expect(result.data).toEqual({})
    })

    it('handles malformed JSON gracefully', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{ invalid json', { status: 200 })
      )
      
      const result = await api.get('/api/test')
      
      expect(result.data).toEqual({})
    })

    it('merges custom headers with default headers', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{}', { status: 200 })
      )
      
      await api.get('/api/test', { headers: { 'X-Custom': 'value' } })
      
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
            'Authorization': 'Bearer test-token-123',
          }),
        })
      )
    })

    it('respects custom timeout option', async () => {
      let abortSignal: AbortSignal | undefined
      fetchMock.mockImplementationOnce((_url, options) => {
        abortSignal = options?.signal
        return Promise.resolve(new Response('{}', { status: 200 }))
      })
      
      await api.get('/api/test', { timeout: 5000 })
      
      expect(abortSignal).toBeDefined()
    })

    it('throws BackendUnavailableError when backend is down', async () => {
      // Mark backend as unavailable
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await checkBackendAvailability()
      
      await expect(api.get('/api/test')).rejects.toThrow(BackendUnavailableError)
    })
  })

  describe('ApiClient - POST requests', () => {
    beforeEach(async () => {
      // Ensure backend is available
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('sends POST request with JSON body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ created: true }), { status: 201 })
      )
      
      const result = await api.post('/api/items', { name: 'test' })
      
      expect(result.data).toEqual({ created: true })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('sends POST request without body when body is undefined', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{}', { status: 200 })
      )
      
      await api.post('/api/action')
      
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/action',
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      )
    })

    it('throws on 401 response', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      
      await expect(api.post('/api/test', {})).rejects.toThrow(UnauthorizedError)
    })

    it('handles custom headers', async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      
      await api.post('/api/test', {}, { headers: { 'X-Trace-Id': '123' } })
      
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Trace-Id': '123',
          }),
        })
      )
    })
  })

  describe('ApiClient - PATCH requests', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('sends PATCH request with JSON body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ updated: true }), { status: 200 })
      )
      
      const result = await api.patch('/api/items/1', { name: 'updated' })
      
      expect(result.data).toEqual({ updated: true })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'updated' }),
        })
      )
    })
  })

  describe('ApiClient - PUT requests', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('sends PUT request with JSON body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ replaced: true }), { status: 200 })
      )
      
      const result = await api.put('/api/items/1', { name: 'replacement' })
      
      expect(result.data).toEqual({ replaced: true })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'replacement' }),
        })
      )
    })
  })

  describe('ApiClient - DELETE requests', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('sends DELETE request and returns void', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
      
      const result = await api.delete('/api/items/1')
      
      expect(result).toBeUndefined()
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })

    it('throws on error response', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      
      await expect(api.delete('/api/items/999')).rejects.toThrow('Not Found')
    })
  })

  describe('Response parsing edge cases', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('handles response with Content-Length: 0', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('', { status: 200, headers: { 'Content-Length': '0' } })
      )
      
      const result = await api.get('/api/test')
      
      expect(result.data).toEqual({})
    })

    it('handles whitespace-only response body', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('   \n  ', { status: 200 })
      )
      
      const result = await api.get('/api/test')
      
      expect(result.data).toEqual({})
    })

    it('handles valid JSON with leading/trailing whitespace', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('  \n {"value": 42}  \n', { status: 200 })
      )
      
      const result = await api.get<{ value: number }>('/api/test')
      
      expect(result.data.value).toBe(42)
    })
  })

  describe('Token refresh handling', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
    })

    it('triggers silent refresh when X-Token-Refresh header is present', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{}', { 
          status: 200,
          headers: { 'X-Token-Refresh': 'true' }
        })
      )
      
      // Mock the refresh endpoint
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ refreshed: true }), { status: 200 })
      )
      
      await api.get('/api/test')
      
      // Wait for async refresh to trigger
      await new Promise(resolve => setTimeout(resolve, 100))
      
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/refresh',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('does not trigger refresh when header is absent', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('{}', { status: 200 })
      )
      
      await api.get('/api/test')
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Only the original GET, no refresh
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('Rate limiting', () => {
    beforeEach(async () => {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await checkBackendAvailability()
      fetchMock.mockClear()
      localStorage.clear()
    })

    it('stores rate limit deadline in localStorage', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Rate limited', {
          status: 429,
          headers: { 'Retry-After': '90' }
        })
      )
      
      try {
        await api.get('/api/test')
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError)
      }
      
      const deadline = localStorage.getItem('kc-api-rate-limit-until')
      expect(deadline).toBeTruthy()
      
      const deadlineTime = parseInt(deadline!, 10)
      const now = Date.now()
      expect(deadlineTime).toBeGreaterThan(now)
      expect(deadlineTime).toBeLessThanOrEqual(now + 90 * 1000 + 100)
    })

    it('uses default retry-after when header is missing', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Rate limited', { status: 429 })
      )
      
      try {
        await api.get('/api/test')
      } catch (err) {
        const rateLimitErr = err as RateLimitError
        expect(rateLimitErr.retryAfter).toBe(60)
      }
    })

    it('uses default retry-after when header is invalid', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('Rate limited', {
          status: 429,
          headers: { 'Retry-After': 'invalid' }
        })
      )
      
      try {
        await api.get('/api/test')
      } catch (err) {
        const rateLimitErr = err as RateLimitError
        expect(rateLimitErr.retryAfter).toBe(60)
      }
    })
  })
})