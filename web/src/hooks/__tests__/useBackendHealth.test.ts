import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

import { useBackendHealth, isBackendConnected, isInClusterMode } from '../useBackendHealth'
import { reportBackendUnavailable, reportBackendAvailable } from '../../lib/backendHealthEvents'

describe('useBackendHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns initial state with connecting status', () => {
    const { result } = renderHook(() => useBackendHealth())
    // Initial status is 'connecting' before first check completes
    expect(['connecting', 'connected']).toContain(result.current.status)
  })

  it('returns connected status after successful health check', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.isConnected).toBe(true)
  })

  it('returns lastCheck as a Date after check', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.lastCheck).toBeInstanceOf(Date))
  })

  it('versionChanged is false initially', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.versionChanged).toBe(false)
  })

  it('inCluster reflects backend data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0', in_cluster: true }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.inCluster).toBe(true))
    expect(result.current.isInClusterMode).toBe(true)
  })

  it('keeps inCluster true while disconnected so backend-backed actions can stay disabled', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0', in_cluster: true }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.inCluster).toBe(true))

    reportBackendUnavailable('http', 502)

    await waitFor(() => expect(result.current.status).toBe('disconnected'))
    expect(result.current.inCluster).toBe(true)
    expect(result.current.isInClusterMode).toBe(true)
    expect(isInClusterMode()).toBe(true)

    reportBackendAvailable('http', 200)
    await waitFor(() => expect(result.current.status).toBe('connected'))
  })

  // --- Disconnected after consecutive failures ---
  it('transitions to disconnected after FAILURE_THRESHOLD consecutive failures', async () => {
    // Both /health and agent /health fail
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useBackendHealth())

    // The manager needs 4 consecutive failures before marking disconnected.
    // Advance timers to trigger multiple poll intervals (15s each).
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000)
    }

    await waitFor(() => {
      expect(result.current.status).toBe('disconnected')
    })
    expect(result.current.isConnected).toBe(false)
  })

  // --- Non-ok response falls back to agent check ---
  it('stays connected when main health fails but agent is alive', async () => {
    let callCount = 0
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url
      // First call succeeds to establish connected state
      if (callCount === 0) {
        callCount++
        return new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 })
      }
      // Subsequent /health calls fail
      if (urlStr === '/health') {
        throw new Error('Connection pool exhausted')
      }
      // Agent health check succeeds
      if (urlStr.includes('/health')) {
        return new Response('ok', { status: 200 })
      }
      throw new Error('unexpected')
    })

    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))

    // Trigger subsequent poll
    await vi.advanceTimersByTimeAsync(15_000)
    await waitFor(() => expect(result.current.status).toBe('connected'))
  })

  // --- Non-ok HTTP status triggers failure path ---
  it('handles non-ok HTTP status from /health', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url
      if (urlStr === '/health') {
        return new Response('error', { status: 500 })
      }
      // Agent also fails
      return new Response('error', { status: 500 })
    })

    const { result } = renderHook(() => useBackendHealth())

    // Need 4 failures to disconnect
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000)
    }

    await waitFor(() => {
      expect(result.current.status).toBe('disconnected')
    })
  })

  // --- Invalid JSON still marks connected ---
  it('marks connected even when response JSON is invalid', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('not valid json', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
  })

  // --- inCluster false when not provided ---
  it('inCluster defaults to false when not in response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.inCluster).toBe(false)
    expect(result.current.isInClusterMode).toBe(false)
  })

  // --- Cleanup on unmount ---
  it('cleans up on unmount without throwing', () => {
    const { unmount } = renderHook(() => useBackendHealth())
    expect(() => unmount()).not.toThrow()
  })

  // --- Return shape completeness ---
  it('returns all expected properties', () => {
    const { result } = renderHook(() => useBackendHealth())
    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('isConnected')
    expect(result.current).toHaveProperty('lastCheck')
    expect(result.current).toHaveProperty('versionChanged')
    expect(result.current).toHaveProperty('inCluster')
    expect(result.current).toHaveProperty('isInClusterMode')
  })
})

describe('isBackendConnected', () => {
  it('is a function that returns boolean', () => {
    const result = isBackendConnected()
    expect(typeof result).toBe('boolean')
  })
})

describe('isInClusterMode', () => {
  it('is a function that returns boolean', () => {
    const result = isInClusterMode()
    expect(typeof result).toBe('boolean')
  })
})
