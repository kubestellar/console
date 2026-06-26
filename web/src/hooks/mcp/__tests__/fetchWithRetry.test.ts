/**
 * Tests for hooks/mcp/fetchWithRetry.ts
 *
 * Covers: retry on 5xx, no retry on 4xx, retry on network errors,
 * retry on AbortError (timeout), exponential backoff, maxRetries,
 * caller abort signal propagation, and non-transient error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MCP_HOOK_TIMEOUT_MS } from '../../../lib/constants'

// Mock agentFetch
vi.mock('../agentFetch', () => ({
  agentFetch: vi.fn(),
}))

import { fetchWithRetry } from '../fetchWithRetry'
import { agentFetch } from '../agentFetch'

const mockAgentFetch = agentFetch as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// =============================================================================
// Success cases
// =============================================================================

describe('fetchWithRetry — success', () => {
  it('returns response on 200 without retrying', async () => {
    const mockResponse = { status: 200, ok: true }
    mockAgentFetch.mockResolvedValue(mockResponse)

    const result = await fetchWithRetry('https://api.test/data')
    expect(result).toBe(mockResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })

  it('returns response on 3xx without retrying', async () => {
    const mockResponse = { status: 301, ok: false }
    mockAgentFetch.mockResolvedValue(mockResponse)

    const result = await fetchWithRetry('https://api.test/data')
    expect(result).toBe(mockResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// 4xx — no retry
// =============================================================================

describe('fetchWithRetry — 4xx (no retry)', () => {
  it('returns 400 response without retrying', async () => {
    const mockResponse = { status: 400, ok: false }
    mockAgentFetch.mockResolvedValue(mockResponse)

    const result = await fetchWithRetry('https://api.test/data')
    expect(result).toBe(mockResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })

  it('returns 404 response without retrying', async () => {
    const mockResponse = { status: 404, ok: false }
    mockAgentFetch.mockResolvedValue(mockResponse)

    const result = await fetchWithRetry('https://api.test/data')
    expect(result).toBe(mockResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })

  it('returns 429 response without retrying', async () => {
    const mockResponse = { status: 429, ok: false }
    mockAgentFetch.mockResolvedValue(mockResponse)

    const result = await fetchWithRetry('https://api.test/data')
    expect(result).toBe(mockResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// 5xx — retry
// =============================================================================

describe('fetchWithRetry — 5xx (retry)', () => {
  it('retries on 500 and returns success on second attempt', async () => {
    const failResponse = { status: 500, ok: false }
    const successResponse = { status: 200, ok: true }
    mockAgentFetch
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse)

    const result = await fetchWithRetry('https://api.test/data', {
      initialBackoffMs: 1,
    })
    expect(result).toBe(successResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(2)
  })

  it('returns 5xx response after exhausting retries', async () => {
    const failResponse = { status: 503, ok: false }
    mockAgentFetch.mockResolvedValue(failResponse)

    const result = await fetchWithRetry('https://api.test/data', {
      maxRetries: 2,
      initialBackoffMs: 1,
    })
    expect(result).toBe(failResponse)
    // 3 total attempts (1 initial + 2 retries)
    expect(mockAgentFetch).toHaveBeenCalledTimes(3)
  })
})

// =============================================================================
// Network errors — retry on transient
// =============================================================================

describe('fetchWithRetry — network errors', () => {
  it('retries on TypeError (network failure) and succeeds', async () => {
    const successResponse = { status: 200, ok: true }
    mockAgentFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(successResponse)

    const result = await fetchWithRetry('https://api.test/data', {
      initialBackoffMs: 1,
    })
    expect(result).toBe(successResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(2)
  })

  it('retries on AbortError (timeout) and succeeds', async () => {
    const successResponse = { status: 200, ok: true }
    mockAgentFetch
      .mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'))
      .mockResolvedValueOnce(successResponse)

    const result = await fetchWithRetry('https://api.test/data', {
      initialBackoffMs: 1,
    })
    expect(result).toBe(successResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(2)
  })

  it('throws non-transient errors immediately without retry', async () => {
    const error = new Error('Unexpected error')
    mockAgentFetch.mockRejectedValue(error)

    await expect(
      fetchWithRetry('https://api.test/data', { initialBackoffMs: 1 })
    ).rejects.toThrow('Unexpected error')
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting retries on transient errors', async () => {
    mockAgentFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      fetchWithRetry('https://api.test/data', {
        maxRetries: 1,
        initialBackoffMs: 1,
      })
    ).rejects.toThrow('Failed to fetch')
    // 2 total attempts (1 initial + 1 retry)
    expect(mockAgentFetch).toHaveBeenCalledTimes(2)
  })
})

// =============================================================================
// maxRetries configuration
// =============================================================================

describe('fetchWithRetry — maxRetries', () => {
  it('respects maxRetries=0 (no retries)', async () => {
    const failResponse = { status: 500, ok: false }
    mockAgentFetch.mockResolvedValue(failResponse)

    const result = await fetchWithRetry('https://api.test/data', {
      maxRetries: 0,
      initialBackoffMs: 1,
    })
    expect(result).toBe(failResponse)
    expect(mockAgentFetch).toHaveBeenCalledTimes(1)
  })

  it('uses default maxRetries=2 when not specified', async () => {
    mockAgentFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(
      fetchWithRetry('https://api.test/data', { initialBackoffMs: 1 })
    ).rejects.toThrow()
    // Default: 3 total attempts (1 + 2 retries)
    expect(mockAgentFetch).toHaveBeenCalledTimes(3)
  })
})

// =============================================================================
// Timing and abort behavior
// =============================================================================

describe('fetchWithRetry — timers and abort wiring', () => {
  it('applies exponential backoff between 5xx retries', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    mockAgentFetch
      .mockResolvedValueOnce({ status: 500, ok: false })
      .mockResolvedValueOnce({ status: 502, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true })

    const promise = fetchWithRetry('https://api.test/data', {
      maxRetries: 2,
      initialBackoffMs: 10,
      timeoutMs: 100,
    })

    await vi.runAllTimersAsync()
    const result = await promise
    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => Number(delay))

    expect(result.status).toBe(200)
    expect(mockAgentFetch).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([100, 10, 100, 20, 100])
  })

  it('removes the caller abort listener after a successful request', async () => {
    const controller = new AbortController()
    const addEventListenerSpy = vi.spyOn(controller.signal, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener')
    const mockResponse = { status: 200, ok: true }
    mockAgentFetch.mockResolvedValue(mockResponse)

    const result = await fetchWithRetry('https://api.test/data', {
      signal: controller.signal,
    })

    expect(result).toBe(mockResponse)
    expect(addEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('aborts timed out requests and retries until the retry budget is exhausted', async () => {
    mockAgentFetch.mockImplementation((_, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'))
      }, { once: true })
    }))

    const promise = fetchWithRetry('https://api.test/data', {
      timeoutMs: 25,
      initialBackoffMs: 5,
      maxRetries: 1,
    })
    const rejection = expect(promise).rejects.toThrow('The operation was aborted')

    await vi.runAllTimersAsync()

    await rejection
    expect(mockAgentFetch).toHaveBeenCalledTimes(2)
  })

  it('passes request options through to agentFetch while using its own abort signal', async () => {
    const callerController = new AbortController()
    const mockResponse = { status: 200, ok: true }
    mockAgentFetch.mockResolvedValue(mockResponse)

    await fetchWithRetry('https://api.test/data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
      signal: callerController.signal,
    })

    expect(mockAgentFetch).toHaveBeenCalledWith('https://api.test/data', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true }),
      signal: expect.any(AbortSignal),
    }))
    expect(mockAgentFetch.mock.calls[0]?.[1]?.signal).not.toBe(callerController.signal)
  })

  it('uses the default MCP timeout when timeoutMs is not provided', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    mockAgentFetch.mockResolvedValue({ status: 200, ok: true })

    await fetchWithRetry('https://api.test/data')

    expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(MCP_HOOK_TIMEOUT_MS)
  })
})
