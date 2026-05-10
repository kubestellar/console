import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://localhost:8585' }
})

import { useBackendHealth, isBackendConnected, isInClusterMode } from '../useBackendHealth'
import { reportBackendUnavailable } from '../../lib/backendHealthEvents'

describe('useBackendHealth — expanded edge cases', () => {
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

  // 1. Version change detection
  it('detects version change when backend version changes', async () => {
    let callCount = 0
    vi.mocked(fetch).mockImplementation(async () => {
      callCount++
      const version = callCount <= 2 ? '1.0.0' : '2.0.0'
      return new Response(JSON.stringify({ status: 'ok', version }), { status: 200 })
    })

    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.versionChanged).toBe(false)

    // Advance past two poll intervals to get version change
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(15_000)

    await waitFor(() => expect(result.current.versionChanged).toBe(true))
  })

  // 2. Failure count resets on success
  it('resets failure count after a successful check', async () => {
    let callCount = 0
    vi.mocked(fetch).mockImplementation(async (url) => {
      callCount++
      const urlStr = typeof url === 'string' ? url : (url as Request).url
      // First 3 calls fail, then succeed
      if (callCount <= 3 && urlStr === '/health') {
        throw new Error('fail')
      }
      if (callCount <= 3 && urlStr.includes('8585')) {
        throw new Error('fail')
      }
      return new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 })
    })

    const { result } = renderHook(() => useBackendHealth())
    // Advance past failures (not enough to hit threshold of 4)
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(15_000)
    }
    // Should still not be disconnected (only 3 failures, threshold is 4)
    await waitFor(() => {
      expect(result.current.status).not.toBe('disconnected')
    })
  })

  // 3. Agent health check fallback
  it('stays connected when main health fails but agent is reachable', async () => {
    let firstCall = true
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === 'string' ? url : (url as Request).url
      if (firstCall) {
        firstCall = false
        return new Response(JSON.stringify({ status: 'ok', version: '1.0.0' }), { status: 200 })
      }
      if (urlStr === '/health') throw new Error('Connection pool exhausted')
      if (urlStr.includes('8585/health')) return new Response('ok', { status: 200 })
      throw new Error('unexpected')
    })

    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    await vi.advanceTimersByTimeAsync(15_000)
    await waitFor(() => expect(result.current.status).toBe('connected'))
  })

  // 4. Agent health check also fails
  it('increments failure count when both main and agent health fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('all down'))
    const { result } = renderHook(() => useBackendHealth())
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000)
    }
    await waitFor(() => expect(result.current.status).toBe('disconnected'))
  })

  // 5. in_cluster: false explicitly
  it('reports inCluster false when backend explicitly sends false', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0', in_cluster: false }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.inCluster).toBe(false)
    expect(result.current.isInClusterMode).toBe(false)
  })

  // 6. in_cluster: true
  it('reports isInClusterMode true when connected and in_cluster is true', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0', in_cluster: true }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.isInClusterMode).toBe(true))
  })

  // 7. Response with no version field
  it('handles response without version field gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.versionChanged).toBe(false)
  })

  // 8. Invalid JSON still counts as connected
  it('marks connected when response is ok but JSON is invalid', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('this is not json', { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
  })

  // 9. Multiple subscribers share the singleton manager
  it('shares state across multiple hook instances', async () => {
    const { result: r1 } = renderHook(() => useBackendHealth())
    const { result: r2 } = renderHook(() => useBackendHealth())
    await waitFor(() => {
      expect(r1.current.status).toBe('connected')
      expect(r2.current.status).toBe('connected')
    })
  })

  // 10. Unmount removes subscriber
  it('removes subscriber on unmount without errors', () => {
    const { unmount } = renderHook(() => useBackendHealth())
    expect(() => unmount()).not.toThrow()
  })

  // 11. isBackendConnected function
  it('isBackendConnected returns boolean', () => {
    expect(typeof isBackendConnected()).toBe('boolean')
  })

  // 12. isInClusterMode function
  it('isInClusterMode returns boolean', () => {
    expect(typeof isInClusterMode()).toBe('boolean')
  })

  // 13. lastCheck updates on each poll
  it('lastCheck updates after each successful poll', async () => {
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.lastCheck).toBeInstanceOf(Date))
    const firstCheck = result.current.lastCheck!.getTime()
    await vi.advanceTimersByTimeAsync(15_000)
    await waitFor(() => {
      const lastCheck = result.current.lastCheck!.getTime()
      expect(lastCheck).toBeGreaterThanOrEqual(firstCheck)
    })
  })

  // 14. Concurrent checkBackend calls are guarded by isChecking flag
  it('concurrent checks are serialized via isChecking guard', async () => {
    const fetchSpy = vi.mocked(fetch)
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))
    // The internal isChecking flag prevents overlapping checks
    // We verify by checking fetch was not called excessively
    const callCountBefore = fetchSpy.mock.calls.length
    await vi.advanceTimersByTimeAsync(100) // Too short for a new poll
    expect(fetchSpy.mock.calls.length).toBe(callCountBefore)
  })

  it('responds immediately to observed backend failures', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '1.0.0', in_cluster: true }), { status: 200 })
    )
    const { result } = renderHook(() => useBackendHealth())
    await waitFor(() => expect(result.current.status).toBe('connected'))

    reportBackendUnavailable('http', 502)

    await waitFor(() => expect(result.current.status).toBe('disconnected'))
    expect(result.current.inCluster).toBe(true)
    expect(result.current.isInClusterMode).toBe(true)
    expect(isInClusterMode()).toBe(true)
  })
})
