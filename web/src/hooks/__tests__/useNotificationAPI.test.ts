import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, BACKEND_DEFAULT_URL: '', STORAGE_KEY_AUTH_TOKEN: 'kc-auth-token' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

import { useNotificationAPI } from '../useNotificationAPI'

describe('useNotificationAPI', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with isLoading false and no error', () => {
    const { result } = renderHook(() => useNotificationAPI())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('testNotification calls the API', async () => {
    const { result } = renderHook(() => useNotificationAPI())
    await act(async () => {
      await result.current.testNotification('slack', { url: 'https://hooks.slack.com/test' })
    })
    expect(fetch).toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('testNotification includes auth header when token exists', async () => {
    localStorage.setItem('kc-auth-token', 'jwt-token')
    const { result } = renderHook(() => useNotificationAPI())
    await act(async () => {
      await result.current.testNotification('webhook', { url: 'https://example.com' })
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const headers = fetchCall[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer jwt-token')
  })

  it('testNotification sets error on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid webhook' }), { status: 400 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.testNotification('slack', {})
      } catch (e: unknown) {
        caughtError = e
      }
    })
    expect(caughtError).toBeDefined()
    expect(result.current.error).toBe('Invalid webhook')
  })

  it('sendAlertNotification calls the send endpoint', async () => {
    const { result } = renderHook(() => useNotificationAPI())
    const alert = { id: 'a1', severity: 'warning', message: 'test' }
    const channels = [{ type: 'slack', config: {} }]
    await act(async () => {
      await result.current.sendAlertNotification(alert as never, channels as never)
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/send'),
      expect.any(Object)
    )
  })

  it('handles network error in testNotification', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.testNotification('email', {})
      } catch (e: unknown) {
        caughtError = e
      }
    })
    expect(caughtError).toBeDefined()
    expect(result.current.error).toBe('Network failure')
  })
})
