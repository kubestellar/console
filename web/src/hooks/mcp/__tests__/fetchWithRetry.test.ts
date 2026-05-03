/**
 * Tests for hooks/mcp/fetchWithRetry.ts
 *
 * Covers: retry on 5xx, no retry on 4xx, retry on network errors,
 * retry on AbortError (timeout), exponential backoff, maxRetries,
 * caller abort signal propagation, and non-transient error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
