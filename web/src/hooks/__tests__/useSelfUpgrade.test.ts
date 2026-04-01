import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

import { useSelfUpgrade } from '../useSelfUpgrade'

describe('useSelfUpgrade', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        available: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
      }), { status: 200 })
    )
  })

  it('starts with null status and not loading', () => {
    const { result } = renderHook(() => useSelfUpgrade())
    // Status will be null until checkStatus completes
    expect(result.current.isTriggering).toBe(false)
    expect(result.current.triggerError).toBeNull()
  })

  it('checkStatus fetches from API', async () => {
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current.status).not.toBeNull()
  })

  it('checkStatus sets null on error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current.status).toBeNull()
  })

  it('checkStatus sets null on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }))
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current.status).toBeNull()
  })

  it('includes auth header when token exists', async () => {
    localStorage.setItem('kc-auth-token', 'jwt-token')
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    const call = vi.mocked(fetch).mock.calls[0]
    const headers = call[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-token')
  })

  it('provides isRestarting and restartComplete state', () => {
    const { result } = renderHook(() => useSelfUpgrade())
    expect(result.current.isRestarting).toBe(false)
    expect(result.current.restartComplete).toBe(false)
    expect(result.current.restartError).toBeNull()
  })
})
