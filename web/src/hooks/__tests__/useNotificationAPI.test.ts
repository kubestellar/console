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
      } catch (e) {
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
      } catch (e) {
        caughtError = e
      }
    })
    expect(caughtError).toBeDefined()
    expect(result.current.error).toBe('Network failure')
  })

  // ── sendAlertNotification error paths ──────────────────────────────────

  it('sendAlertNotification sets error on non-ok response with data.message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Channel not found' }), { status: 404 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.sendAlertNotification({ id: 'a1' } as never, [] as never)
      } catch (e) {
        caughtError = e
      }
    })
    expect(caughtError).toBeDefined()
    expect(result.current.error).toBe('Channel not found')
    expect(result.current.isLoading).toBe(false)
  })

  it('sendAlertNotification falls back to data.error when data.message is absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.sendAlertNotification({ id: 'a2' } as never, [] as never)
      } catch (e) {
        caughtError = e
      }
    })
    expect(result.current.error).toBe('Rate limited')
  })

  it('sendAlertNotification uses default message when neither data.message nor data.error exist', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 500 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.sendAlertNotification({ id: 'a3' } as never, [] as never)
      } catch (e) {
        caughtError = e
      }
    })
    expect(result.current.error).toBe('Failed to send notification')
  })

  it('sendAlertNotification handles network error (Error object)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'))
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.sendAlertNotification({ id: 'a4' } as never, [] as never)
      } catch (e) {
        caughtError = e
      }
    })
    expect(result.current.error).toBe('Connection refused')
    expect(result.current.isLoading).toBe(false)
  })

  it('sendAlertNotification handles non-Error thrown value', async () => {
    vi.mocked(fetch).mockRejectedValue('string error')
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.sendAlertNotification({ id: 'a5' } as never, [] as never)
      } catch (e) {
        caughtError = e
      }
    })
    // Non-Error thrown -> fallback message
    expect(result.current.error).toBe('Failed to send notification')
    expect(caughtError).toBe('string error')
  })

  // ── testNotification additional error branches ─────────────────────────

  it('testNotification falls back to data.error when data.message is absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Bad token' }), { status: 401 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.testNotification('pagerduty', {})
      } catch (e) {
        caughtError = e
      }
    })
    expect(result.current.error).toBe('Bad token')
  })

  it('testNotification uses default message when response body has no message or error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: 'fail' }), { status: 503 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.testNotification('opsgenie', {})
      } catch (e) {
        caughtError = e
      }
    })
    expect(result.current.error).toBe('Failed to test notification')
  })

  it('testNotification handles non-Error thrown value', async () => {
    vi.mocked(fetch).mockRejectedValue(42)
    const { result } = renderHook(() => useNotificationAPI())
    let caughtError: unknown
    await act(async () => {
      try {
        await result.current.testNotification('webhook', {})
      } catch (e) {
        caughtError = e
      }
    })
    // Non-Error thrown -> fallback message
    expect(result.current.error).toBe('Failed to test notification')
    expect(caughtError).toBe(42)
  })

  it('testNotification does not include Authorization header when no token', async () => {
    localStorage.removeItem('kc-auth-token')
    const { result } = renderHook(() => useNotificationAPI())
    await act(async () => {
      await result.current.testNotification('slack', { url: 'https://hooks.slack.com/test' })
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const headers = fetchCall[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('sendAlertNotification includes auth header when token exists', async () => {
    localStorage.setItem('kc-auth-token', 'my-jwt')
    const { result } = renderHook(() => useNotificationAPI())
    await act(async () => {
      await result.current.sendAlertNotification({ id: 'a6' } as never, [] as never)
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const headers = fetchCall[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-jwt')
  })

  it('error state is cleared on subsequent successful call', async () => {
    // First call fails
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'oops' }), { status: 500 })
    )
    const { result } = renderHook(() => useNotificationAPI())
    await act(async () => {
      try { await result.current.testNotification('slack', {}) } catch { /* expected */ }
    })
    expect(result.current.error).toBe('oops')

    // Second call succeeds - error should be cleared
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )
    await act(async () => {
      await result.current.testNotification('slack', {})
    })
    expect(result.current.error).toBeNull()
  })
})
