/**
 * Tests for useHelmActions hook — Helm rollback, uninstall, and upgrade operations.
 *
 * Validates each action method, loading/error state management,
 * lastResult tracking, and network error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocks
import {
  useHelmActions,
  type HelmRollbackParams,
  type HelmUninstallParams,
  type HelmUpgradeParams,
  type HelmActionResult,
} from '../useHelmActions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetState() {
  vi.clearAllMocks()
}

/** Helper to create a successful fetch response */
function successResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
  }
}

/** Helper to create an error fetch response */
function errorResponse(status: number, data: Record<string, unknown>) {
  return {
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(data),
  }
}

const ROLLBACK_PARAMS: HelmRollbackParams = {
  release: 'my-app',
  namespace: 'production',
  cluster: 'cluster-a',
  revision: 3,
}

const UNINSTALL_PARAMS: HelmUninstallParams = {
  release: 'old-app',
  namespace: 'staging',
  cluster: 'cluster-b',
}

const UPGRADE_PARAMS: HelmUpgradeParams = {
  release: 'my-app',
  namespace: 'production',
  cluster: 'cluster-a',
  chart: 'my-chart',
  version: '2.0.0',
  reuseValues: true,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHelmActions', () => {
  beforeEach(resetState)

  // =========================================================================
  // Initial state
  // =========================================================================

  it('returns correct initial state', () => {
    const { result } = renderHook(() => useHelmActions())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastResult).toBeNull()
    expect(typeof result.current.rollback).toBe('function')
    expect(typeof result.current.uninstall).toBe('function')
    expect(typeof result.current.upgrade).toBe('function')
  })

  // =========================================================================
  // Rollback
  // =========================================================================

  it('rollback sends POST to kc-agent /helm/rollback with correct body', async () => {
    mockFetch.mockResolvedValue(successResponse({ message: 'Rolled back' }))

    const { result } = renderHook(() => useHelmActions())

    await act(async () => {
      await result.current.rollback(ROLLBACK_PARAMS)
    })

    // #7993 Phase 4: helm operations moved to kc-agent's /helm/* routes.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/helm/rollback'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(ROLLBACK_PARAMS),
        signal: expect.anything(),
      }),
    )
  })

  it('rollback returns success result on successful response', async () => {
    mockFetch.mockResolvedValue(successResponse({
      message: 'Rolled back to revision 3',
      output: 'Release "my-app" has been rolled back to revision 3.',
    }))

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.rollback(ROLLBACK_PARAMS)
    })

    expect(actionResult!.success).toBe(true)
    expect(actionResult!.message).toBe('Rolled back to revision 3')
    expect(actionResult!.output).toBe('Release "my-app" has been rolled back to revision 3.')
    expect(result.current.lastResult).toEqual(actionResult)
    expect(result.current.error).toBeNull()
  })

  it('rollback returns failure result when response has error field', async () => {
    mockFetch.mockResolvedValue(errorResponse(400, {
      error: 'revision 3 not found',
      detail: 'Release has only 2 revisions',
    }))

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.rollback(ROLLBACK_PARAMS)
    })

    expect(actionResult!.success).toBe(false)
    expect(actionResult!.message).toBe('revision 3 not found')
    expect(actionResult!.detail).toBe('Release has only 2 revisions')
    expect(result.current.error).toBe('revision 3 not found')
  })

  // =========================================================================
  // Uninstall
  // =========================================================================

  it('uninstall sends POST to kc-agent /helm/uninstall', async () => {
    mockFetch.mockResolvedValue(successResponse({ message: 'Uninstalled' }))

    const { result } = renderHook(() => useHelmActions())

    await act(async () => {
      await result.current.uninstall(UNINSTALL_PARAMS)
    })

    // #7993 Phase 4: helm operations moved to kc-agent's /helm/* routes.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/helm/uninstall'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(UNINSTALL_PARAMS),
      }),
    )
  })

  it('uninstall returns success result', async () => {
    mockFetch.mockResolvedValue(successResponse({
      message: 'Release "old-app" uninstalled',
      output: 'release "old-app" uninstalled',
    }))

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.uninstall(UNINSTALL_PARAMS)
    })

    expect(actionResult!.success).toBe(true)
    expect(actionResult!.message).toContain('old-app')
  })

  // =========================================================================
  // Upgrade
  // =========================================================================

  it('upgrade sends POST to kc-agent /helm/upgrade with full params', async () => {
    mockFetch.mockResolvedValue(successResponse({ message: 'Upgraded' }))

    const { result } = renderHook(() => useHelmActions())

    await act(async () => {
      await result.current.upgrade(UPGRADE_PARAMS)
    })

    // #7993 Phase 4: helm operations moved to kc-agent's /helm/* routes.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/helm/upgrade'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(UPGRADE_PARAMS),
      }),
    )
  })

  it('upgrade returns success with output', async () => {
    mockFetch.mockResolvedValue(successResponse({
      message: 'Upgraded to 2.0.0',
      output: 'Release "my-app" has been upgraded.',
    }))

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.upgrade(UPGRADE_PARAMS)
    })

    expect(actionResult!.success).toBe(true)
    expect(actionResult!.output).toContain('upgraded')
  })

  // =========================================================================
  // Loading state
  // =========================================================================

  it('sets isLoading to true during action and false after', async () => {
    let resolvePromise: (value: unknown) => void
    const pendingResponse = new Promise(resolve => { resolvePromise = resolve })
    mockFetch.mockReturnValue(pendingResponse)

    const { result } = renderHook(() => useHelmActions())

    // Start the action
    let actionPromise: Promise<HelmActionResult>
    act(() => {
      actionPromise = result.current.rollback(ROLLBACK_PARAMS)
    })

    // isLoading should be true while waiting
    expect(result.current.isLoading).toBe(true)

    // Resolve the fetch
    await act(async () => {
      resolvePromise!(successResponse({ message: 'done' }))
      await actionPromise!
    })

    expect(result.current.isLoading).toBe(false)
  })

  // =========================================================================
  // Network error handling
  // =========================================================================

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Failed to fetch'))

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.rollback(ROLLBACK_PARAMS)
    })

    expect(actionResult!.success).toBe(false)
    expect(actionResult!.message).toBe('Failed to fetch')
    expect(result.current.error).toBe('Failed to fetch')
    expect(result.current.isLoading).toBe(false)
  })

  it('handles non-Error thrown values', async () => {
    mockFetch.mockRejectedValue('string error')

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.uninstall(UNINSTALL_PARAMS)
    })

    expect(actionResult!.success).toBe(false)
    expect(actionResult!.message).toBe('Network error')
  })

  // =========================================================================
  // Error clearing
  // =========================================================================

  it('clears previous error when starting a new action', async () => {
    // First call fails
    mockFetch.mockRejectedValueOnce(new Error('first failure'))

    const { result } = renderHook(() => useHelmActions())

    await act(async () => {
      await result.current.rollback(ROLLBACK_PARAMS)
    })

    expect(result.current.error).toBe('first failure')

    // Second call succeeds
    mockFetch.mockResolvedValueOnce(successResponse({ message: 'ok' }))

    await act(async () => {
      await result.current.rollback(ROLLBACK_PARAMS)
    })

    expect(result.current.error).toBeNull()
  })

  // =========================================================================
  // lastResult tracking
  // =========================================================================

  it('lastResult tracks the most recent action result', async () => {
    mockFetch.mockResolvedValue(successResponse({ message: 'first' }))

    const { result } = renderHook(() => useHelmActions())

    await act(async () => {
      await result.current.rollback(ROLLBACK_PARAMS)
    })
    expect(result.current.lastResult?.message).toBe('first')

    mockFetch.mockResolvedValue(successResponse({ message: 'second' }))

    await act(async () => {
      await result.current.uninstall(UNINSTALL_PARAMS)
    })
    expect(result.current.lastResult?.message).toBe('second')
  })

  // =========================================================================
  // Response with error field on ok: true
  // =========================================================================

  it('treats response with ok:true but error field as failure', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ error: 'helm error', detail: 'chart not found' }),
    })

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.upgrade(UPGRADE_PARAMS)
    })

    expect(actionResult!.success).toBe(false)
    expect(actionResult!.message).toBe('helm error')
    expect(result.current.error).toBe('helm error')
  })

  // =========================================================================
  // Default message when not provided in response
  // =========================================================================

  it('uses default "Operation completed" message when none provided', async () => {
    mockFetch.mockResolvedValue(successResponse({}))

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.rollback(ROLLBACK_PARAMS)
    })

    expect(actionResult!.success).toBe(true)
    expect(actionResult!.message).toBe('Operation completed')
  })

  it('uses default "Operation failed" message when error response has no error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    })

    const { result } = renderHook(() => useHelmActions())
    let actionResult: HelmActionResult | undefined

    await act(async () => {
      actionResult = await result.current.uninstall(UNINSTALL_PARAMS)
    })

    expect(actionResult!.success).toBe(false)
    expect(actionResult!.message).toBe('Operation failed')
  })
})
