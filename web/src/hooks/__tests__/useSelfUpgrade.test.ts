import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

import { useSelfUpgrade } from '../useSelfUpgrade'

describe('useSelfUpgrade', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        available: true,
        canPatch: true,
        namespace: 'kubestellar',
        deploymentName: 'console',
        currentImage: 'ghcr.io/kubestellar/console:1.0.0',
        releaseName: 'console',
      }), { status: 200 })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

  // --- Return shape completeness ---
  it('returns all expected properties', async () => {
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current).toHaveProperty('status')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isAvailable')
    expect(result.current).toHaveProperty('isTriggering')
    expect(result.current).toHaveProperty('triggerError')
    expect(result.current).toHaveProperty('isRestarting')
    expect(result.current).toHaveProperty('restartComplete')
    expect(result.current).toHaveProperty('restartError')
    expect(result.current).toHaveProperty('restartElapsed')
    expect(result.current).toHaveProperty('checkStatus')
    expect(result.current).toHaveProperty('triggerUpgrade')
    expect(result.current).toHaveProperty('cancelRestartPoll')
  })

  // --- isAvailable derived from status ---
  it('isAvailable is true when status.available is true', async () => {
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current.isAvailable).toBe(true)
  })

  it('isAvailable is false when status is null', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current.isAvailable).toBe(false)
  })

  it('isAvailable is false when status.available is false', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        available: false,
        canPatch: false,
        namespace: 'kubestellar',
        deploymentName: 'console',
        currentImage: 'ghcr.io/kubestellar/console:1.0.0',
        releaseName: 'console',
      }), { status: 200 })
    )
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    expect(result.current.isAvailable).toBe(false)
  })

  // --- No auth header when no token ---
  it('does not include auth header when no token', async () => {
    localStorage.removeItem('kc-auth-token')
    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })
    // First call is the auto check on mount, second is our manual call
    const lastCall = vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1]
    const headers = lastCall[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  // --- triggerUpgrade success starts restart polling ---
  it('triggerUpgrade returns success on ok response', async () => {
    // First call (mount checkStatus) returns status
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      // Second call (triggerUpgrade) returns success
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const { result } = renderHook(() => useSelfUpgrade())
    // Wait for mount checkStatus to complete
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(true)
    expect(result.current.isTriggering).toBe(false)
  })

  // --- triggerUpgrade server error ---
  it('triggerUpgrade returns error on server error', async () => {
    // First call (mount checkStatus) succeeds
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      // Second call (triggerUpgrade) returns error
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'RBAC denied' }), { status: 403 }))

    const { result } = renderHook(() => useSelfUpgrade())
    // Wait for mount checkStatus
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(false)
    expect(upgradeResult?.error).toBe('RBAC denied')
    expect(result.current.triggerError).toBe('RBAC denied')
  })

  // --- triggerUpgrade network error treated as success (pod restarting) ---
  it('triggerUpgrade treats fetch failure as success when connection lost', async () => {
    // First call (mount checkStatus) succeeds
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      // Trigger call fails with network error (pod restarting)
      .mockRejectedValueOnce(new Error('Failed to fetch'))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    // Connection lost during trigger = patch likely succeeded
    expect(upgradeResult?.success).toBe(true)
    expect(result.current.isRestarting).toBe(true)
  })

  // --- triggerUpgrade non-network error ---
  it('triggerUpgrade returns error on non-network errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockRejectedValueOnce(new Error('Unexpected error'))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(false)
    expect(upgradeResult?.error).toBe('Unexpected error')
    expect(result.current.triggerError).toBe('Unexpected error')
  })

  // --- cancelRestartPoll ---
  it('cancelRestartPoll stops polling and clears isRestarting', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    // Trigger upgrade to start polling
    await act(async () => { await result.current.triggerUpgrade('1.1.0') })

    // Cancel the restart poll
    act(() => { result.current.cancelRestartPoll() })
    expect(result.current.isRestarting).toBe(false)
  })

  // --- restartElapsed starts at 0 ---
  it('restartElapsed starts at 0', () => {
    const { result } = renderHook(() => useSelfUpgrade())
    expect(result.current.restartElapsed).toBe(0)
  })

  // --- Cleanup on unmount aborts polling ---
  it('cleans up polling on unmount', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const { result, unmount } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    // Start upgrade + polling
    await act(async () => { await result.current.triggerUpgrade('1.1.0') })

    // Unmount should not throw even with active polling
    expect(() => unmount()).not.toThrow()
  })

  // --- isLoading tracks checkStatus fetch ---
  it('isLoading reflects checkStatus fetch state', async () => {
    let resolvePromise: (value: Response) => void
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve }))

    const { result } = renderHook(() => useSelfUpgrade())

    // checkStatus was called on mount, fetch is pending
    // isLoading might be true if mount check started
    await act(async () => {
      resolvePromise!(new Response(JSON.stringify({ available: true }), { status: 200 }))
    })

    // After resolving, isLoading should be false
    expect(result.current.isLoading).toBe(false)
  })

  // --- Status data is correctly parsed ---
  it('correctly parses full SelfUpgradeStatus from API', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({
        available: true,
        canPatch: true,
        namespace: 'kubestellar',
        deploymentName: 'ks-console',
        currentImage: 'ghcr.io/kubestellar/console:v1.2.3',
        releaseName: 'console',
        reason: 'Update available',
      }), { status: 200 })
    )

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await result.current.checkStatus() })

    expect(result.current.status).toEqual({
      available: true,
      canPatch: true,
      namespace: 'kubestellar',
      deploymentName: 'ks-console',
      currentImage: 'ghcr.io/kubestellar/console:v1.2.3',
      releaseName: 'console',
      reason: 'Update available',
    })
  })

  // --- triggerUpgrade NetworkError treated as success ---
  it('triggerUpgrade treats NetworkError as success (pod restarting)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockRejectedValueOnce(new Error('NetworkError when attempting to fetch resource'))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(true)
    expect(result.current.isRestarting).toBe(true)
  })

  // --- triggerUpgrade AbortError treated as success ---
  it('triggerUpgrade treats AbortError as success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockRejectedValueOnce(new Error('AbortError: The operation was aborted'))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(true)
  })

  // --- triggerUpgrade timeout treated as success ---
  it('triggerUpgrade treats timeout error as success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(true)
  })

  // --- triggerUpgrade server success=false without error field ---
  it('triggerUpgrade handles missing error field in failure response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 500 }))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(false)
    expect(upgradeResult?.error).toBe('Server returned 500')
  })

  // --- triggerUpgrade non-Error thrown object ---
  it('triggerUpgrade handles non-Error throw', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockRejectedValueOnce('string error')

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    let upgradeResult: { success: boolean; error?: string } | undefined
    await act(async () => {
      upgradeResult = await result.current.triggerUpgrade('1.1.0')
    })
    expect(upgradeResult?.success).toBe(false)
    expect(upgradeResult?.error).toBe('Failed to reach backend')
  })

  // --- triggerUpgrade includes auth and content-type headers ---
  it('triggerUpgrade sends correct headers', async () => {
    localStorage.setItem('kc-auth-token', 'my-jwt')
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    await act(async () => { await result.current.triggerUpgrade('2.0.0') })

    const triggerCall = vi.mocked(fetch).mock.calls.find(
      c => (c[0] as string).includes('/api/self-upgrade/trigger')
    )
    expect(triggerCall).toBeDefined()
    const headers = triggerCall![1]?.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest')
    expect(headers.Authorization).toBe('Bearer my-jwt')
  })

  // --- triggerUpgrade sends imageTag in body ---
  it('triggerUpgrade sends imageTag in request body', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ available: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const { result } = renderHook(() => useSelfUpgrade())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    await act(async () => { await result.current.triggerUpgrade('v3.0.0') })

    const triggerCall = vi.mocked(fetch).mock.calls.find(
      c => (c[0] as string).includes('/api/self-upgrade/trigger')
    )
    const body = JSON.parse(triggerCall![1]?.body as string)
    expect(body.imageTag).toBe('v3.0.0')
  })

  // --- __testables constants ---
  it('exports expected constants via __testables', async () => {
    const mod = await import('../useSelfUpgrade')
    expect(mod.__testables.SELF_UPGRADE_TIMEOUT_MS).toBeGreaterThan(0)
    expect(mod.__testables.RESTART_POLL_INTERVAL_MS).toBeGreaterThan(0)
    expect(mod.__testables.RESTART_POLL_MAX_MS).toBeGreaterThan(0)
    expect(mod.__testables.RESTART_HEALTH_TIMEOUT_MS).toBeGreaterThan(0)
    expect(mod.__testables.RELOAD_DELAY_MS).toBeGreaterThan(0)
  })

  // --- __testables getToken ---
  it('getToken reads from localStorage', async () => {
    const mod = await import('../useSelfUpgrade')
    expect(mod.__testables.getToken()).toBeNull()
    localStorage.setItem('kc-auth-token', 'the-token')
    expect(mod.__testables.getToken()).toBe('the-token')
  })
})
