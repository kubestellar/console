import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchWithRetry } from '../mcp/fetchWithRetry'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a 200 response immediately on first attempt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }))
    const result = await fetchWithRetry('/api/test', { timeoutMs: 1000 })
    expect(result.status).toBe(200)
  })

  it('returns 4xx response without retrying', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }))
    const result = await fetchWithRetry('/api/test', { timeoutMs: 1000 })
    expect(result.status).toBe(404)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns 403 response without retrying', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }))
    const result = await fetchWithRetry('/api/test', { maxRetries: 2, timeoutMs: 1000 })
    expect(result.status).toBe(403)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retries once on 5xx and returns the success response', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const result = await fetchWithRetry('/api/test', { maxRetries: 1, initialBackoffMs: 0, timeoutMs: 1000 })
    expect(result.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('exhausts all retries on 5xx and returns the last error response', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    const result = await fetchWithRetry('/api/test', { maxRetries: 2, initialBackoffMs: 0, timeoutMs: 1000 })
    expect(result.status).toBe(503)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('retries on TypeError (network failure) and succeeds on next attempt', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const result = await fetchWithRetry('/api/test', { maxRetries: 1, initialBackoffMs: 0, timeoutMs: 1000 })
    expect(result.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws TypeError after exhausting all retries on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network error'))
    await expect(
      fetchWithRetry('/api/test', { maxRetries: 2, initialBackoffMs: 0, timeoutMs: 1000 })
    ).rejects.toThrow('network error')
  })

  it('does not retry on non-transient errors', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected error'))
    await expect(
      fetchWithRetry('/api/test', { maxRetries: 2, initialBackoffMs: 0, timeoutMs: 1000 })
    ).rejects.toThrow('unexpected error')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('respects maxRetries: 0 (no retries, returns 5xx immediately)', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))
    const result = await fetchWithRetry('/api/test', { maxRetries: 0, timeoutMs: 1000 })
    expect(result.status).toBe(500)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('uses default options when none provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }))
    const result = await fetchWithRetry('/api/test')
    expect(result.status).toBe(200)
  })

  it('passes caller abort signal through and removes listener on completion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }))
    const controller = new AbortController()
    const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener')
    await fetchWithRetry('/api/test', { signal: controller.signal, timeoutMs: 1000 })
    expect(removeListenerSpy).toHaveBeenCalled()
  })
})
