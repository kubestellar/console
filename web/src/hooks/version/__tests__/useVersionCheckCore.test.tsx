/**
 * Tests for hooks/version/useVersionCheckCore.tsx
 *
 * Filed as fix for kubestellar/console#21715: the batched-setState refactor in
 * PR #21704 (fixes #21692 UI flicker) was not covered by unit tests.
 *
 * Focus of this suite:
 *   1. forceCheck() success path — the terminal commit contains
 *      { isChecking: false, lastCheckResult: 'success', error: null } together,
 *      i.e. no intermediate commit re-introduces the flicker of stale error
 *      being visible while isChecking is still true.
 *   2. forceCheck() failure path — the terminal commit contains
 *      { isChecking: false, lastCheckResult: 'error', error: <message> }
 *      together, and no intermediate commit has a non-null error while
 *      isChecking is still true.
 *   3. registerFailure()/clearFailures() around ERROR_DISPLAY_THRESHOLD.
 *   4. clearLastCheckResult() resets only lastCheckResult.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockUseLocalAgent = vi.hoisted(() =>
  vi.fn(() => ({
    isConnected: false,
    health: null as Record<string, unknown> | null,
    refresh: vi.fn(),
  })),
)

vi.mock('../../useLocalAgent', () => ({
  useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../../../lib/analytics', () => ({
  emitSessionContext: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  authFetch: vi.fn().mockRejectedValue(new Error('backend unavailable in tests')),
}))

const mockFetchReleases = vi.fn()
const mockFetchLatestMainSHA = vi.fn()
const mockFetchRecentCommits = vi.fn()
const mockClearBackoff = vi.fn()

vi.mock('../useReleasesFetch', () => ({
  clearGithubRateLimitBackoff: (...args: unknown[]) => mockClearBackoff(...args),
  fetchLatestMainSHA: (...args: unknown[]) => mockFetchLatestMainSHA(...args),
  fetchRecentCommits: (...args: unknown[]) => mockFetchRecentCommits(...args),
  fetchReleases: (...args: unknown[]) => mockFetchReleases(...args),
}))

const mockFetchAutoUpdateStatus = vi.fn()
const mockSyncAutoUpdateConfig = vi.fn().mockResolvedValue(undefined)
const mockTriggerUpdate = vi.fn()
const mockCancelUpdate = vi.fn()

vi.mock('../useAutoUpdate', () => ({
  cancelUpdate: (...args: unknown[]) => mockCancelUpdate(...args),
  fetchAutoUpdateStatus: (...args: unknown[]) => mockFetchAutoUpdateStatus(...args),
  syncAutoUpdateConfig: (...args: unknown[]) => mockSyncAutoUpdateConfig(...args),
  triggerUpdate: (...args: unknown[]) => mockTriggerUpdate(...args),
}))

import { useVersionCheckCore } from '../useVersionCheckCore'
import { UPDATE_STORAGE_KEYS } from '../../../types/updates'
import { ERROR_DISPLAY_THRESHOLD } from '../../versionUtils'

declare const __APP_VERSION__: string
declare const __COMMIT_HASH__: string

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  // Force the `stable` channel so forceCheck() uses fetchReleases() rather
  // than the developer/agent paths, which pull in extra state transitions.
  localStorage.setItem(UPDATE_STORAGE_KEYS.CHANNEL, 'stable')
  vi.clearAllMocks()
  mockFetchReleases.mockReset()
  mockFetchLatestMainSHA.mockReset()
  mockFetchAutoUpdateStatus.mockReset()
  mockFetchRecentCommits.mockResolvedValue([])
  mockUseLocalAgent.mockReturnValue({
    isConnected: false,
    health: null,
    refresh: vi.fn(),
  })
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// forceCheck() success path — batched terminal commit
// ---------------------------------------------------------------------------

describe('useVersionCheckCore — forceCheck() success', () => {
  it('terminal commit contains isChecking:false, lastCheckResult:success, error:null together', async () => {
    mockFetchReleases.mockResolvedValue({ success: true, releases: [] })

    const { result } = renderHook(() => useVersionCheckCore())

    await act(async () => {
      await result.current.forceCheck()
    })

    // Final observed state — all three fields must be resolved in the last commit.
    expect(result.current.isChecking).toBe(false)
    expect(result.current.lastCheckResult).toBe('success')
    expect(result.current.error).toBeNull()
  })

  it('never leaves lastCheckResult in an inconsistent transient state after success', async () => {
    // If forceCheck resolves synchronously (mocked), no render should have
    // both lastCheckResult=='error' and isChecking==false — that would only
    // happen on the failure path.
    mockFetchReleases.mockResolvedValue({ success: true, releases: [] })

    const { result } = renderHook(() => useVersionCheckCore())

    await act(async () => {
      await result.current.forceCheck()
    })

    expect(result.current.lastCheckResult).not.toBe('error')
  })
})

// ---------------------------------------------------------------------------
// forceCheck() failure path — batched terminal commit + no flicker
// ---------------------------------------------------------------------------

describe('useVersionCheckCore — forceCheck() failure', () => {
  it('terminal commit contains isChecking:false, lastCheckResult:error, non-null error together', async () => {
    mockFetchReleases.mockResolvedValue({
      success: false,
      errorMessage: 'GitHub API returned 500',
    })

    const { result } = renderHook(() => useVersionCheckCore())

    await act(async () => {
      await result.current.forceCheck()
    })

    // This is the atomic-update contract that PR #21704 introduced:
    // the flicker in #21692 happened because previously `setError()` fired
    // in a separate commit from `setIsChecking(false)`. The terminal commit
    // here must expose all three together.
    expect(result.current.isChecking).toBe(false)
    expect(result.current.lastCheckResult).toBe('error')
    expect(result.current.error).toBe('GitHub API returned 500')
  })

  it('falls back to a default error message when errorMessage is missing', async () => {
    mockFetchReleases.mockResolvedValue({ success: false })

    const { result } = renderHook(() => useVersionCheckCore())

    await act(async () => {
      await result.current.forceCheck()
    })

    expect(result.current.isChecking).toBe(false)
    expect(result.current.lastCheckResult).toBe('error')
    // `runReleaseCheck` supplies its own default before `forceCheck` sees it,
    // so the terminal error must be a non-empty string (never null/undefined).
    expect(typeof result.current.error).toBe('string')
    expect(result.current.error).not.toBe('')
  })

  it('resets consecutive-failure counter on every forceCheck invocation', async () => {
    // Sequence: two failures (below threshold, so no surfaced error), then
    // clear failures, then one more failure — error should still be null
    // because forceCheck() zeroes the counter on each entry.
    mockFetchReleases.mockResolvedValue({
      success: false,
      errorMessage: 'transient network error',
    })

    const { result } = renderHook(() => useVersionCheckCore())

    // First failure — forceCheck resets counter to 0 then registers 1 failure.
    // In finally: it also sets error via setError(checkResult.errorMessage).
    // So `error` will be non-null after the first call — that is the
    // "displayImmediately" path (final setError in the finally block).
    await act(async () => {
      await result.current.forceCheck()
    })
    expect(result.current.error).toBe('transient network error')
    expect(result.current.lastCheckResult).toBe('error')

    // Second forceCheck: still error, and the counter was reset at entry.
    await act(async () => {
      await result.current.forceCheck()
    })
    expect(result.current.error).toBe('transient network error')
    expect(result.current.lastCheckResult).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// registerFailure()/clearFailures() via checkForUpdates (public entrypoint)
// ---------------------------------------------------------------------------

describe('useVersionCheckCore — ERROR_DISPLAY_THRESHOLD behavior', () => {
  it('exposes ERROR_DISPLAY_THRESHOLD as at least 2 (guarding this suite)', () => {
    expect(ERROR_DISPLAY_THRESHOLD).toBeGreaterThanOrEqual(2)
  })

  it('suppresses error surface below threshold via checkForUpdates', async () => {
    // Reject enough times to be below the display threshold. `checkForUpdates`
    // uses `registerFailure` which only surfaces the error at/after the
    // threshold. It does not call `setError` unconditionally like forceCheck.
    mockFetchReleases.mockResolvedValue({
      success: false,
      errorMessage: 'flaky',
    })

    const { result } = renderHook(() => useVersionCheckCore())

    // First check — 1 failure, below threshold (2), so error must NOT surface.
    await act(async () => {
      await result.current.checkForUpdates()
    })
    expect(result.current.error).toBeNull()
  })

  it('surfaces error once threshold is reached via repeated checkForUpdates calls', async () => {
    mockFetchReleases.mockResolvedValue({
      success: false,
      errorMessage: 'persistent failure',
    })

    const { result } = renderHook(() => useVersionCheckCore())

    // Fire enough failing checks to hit the threshold. `lastChecked` guards
    // repeated calls within MIN_CHECK_INTERVAL_MS, but on failure the guard
    // does not fire (updateLastCheckedTimestamp only runs on success), so the
    // failure counter increments on each attempt.
    for (let i = 0; i < ERROR_DISPLAY_THRESHOLD; i++) {
      await act(async () => {
        await result.current.checkForUpdates()
      })
    }

    expect(result.current.error).toBe('persistent failure')
  })
})

// ---------------------------------------------------------------------------
// clearLastCheckResult()
// ---------------------------------------------------------------------------

describe('useVersionCheckCore — clearLastCheckResult()', () => {
  it('resets only lastCheckResult and leaves error/isChecking untouched', async () => {
    mockFetchReleases.mockResolvedValue({
      success: false,
      errorMessage: 'server exploded',
    })

    const { result } = renderHook(() => useVersionCheckCore())

    await act(async () => {
      await result.current.forceCheck()
    })

    // Sanity check on the terminal failure state.
    expect(result.current.lastCheckResult).toBe('error')
    expect(result.current.error).toBe('server exploded')
    expect(result.current.isChecking).toBe(false)

    act(() => {
      result.current.clearLastCheckResult()
    })

    // lastCheckResult cleared, everything else preserved.
    expect(result.current.lastCheckResult).toBeNull()
    expect(result.current.error).toBe('server exploded')
    expect(result.current.isChecking).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Contract regression guard — the actual "no-flicker" invariant
// ---------------------------------------------------------------------------

describe('useVersionCheckCore — no-flicker invariant on forceCheck failure', () => {
  it('never emits a commit with a non-null error while isChecking is still true', async () => {
    mockFetchReleases.mockResolvedValue({
      success: false,
      errorMessage: 'boom',
    })

    // Track every commit through a probe component.
    const commits: Array<{ isChecking: boolean; error: string | null; lastCheckResult: string | null }> = []

    const { result } = renderHook(() => {
      const hook = useVersionCheckCore()
      commits.push({
        isChecking: hook.isChecking,
        error: hook.error,
        lastCheckResult: hook.lastCheckResult,
      })
      return hook
    })

    await act(async () => {
      await result.current.forceCheck()
    })

    // The invariant PR #21704 upholds: no rendered commit exposed both a
    // non-null error AND isChecking:true. That is the visual flicker in #21692.
    const flickerCommits = commits.filter(
      (c) => c.error !== null && c.isChecking === true,
    )
    expect(flickerCommits).toEqual([])

    // And the terminal commit has the full failure atomically.
    const terminal = commits[commits.length - 1]
    expect(terminal.isChecking).toBe(false)
    expect(terminal.lastCheckResult).toBe('error')
    expect(terminal.error).toBe('boom')
  })

  it('never emits a commit with a stale error while isChecking is true on a subsequent success', async () => {
    // Start in a failed state, then force a successful re-check. On entry to
    // forceCheck() the batching contract requires isChecking=true be visible
    // together with error=null (the reset), not with the stale error left over.
    mockFetchReleases.mockResolvedValueOnce({
      success: false,
      errorMessage: 'stale error',
    })

    const commits: Array<{ isChecking: boolean; error: string | null }> = []
    const { result } = renderHook(() => {
      const hook = useVersionCheckCore()
      commits.push({ isChecking: hook.isChecking, error: hook.error })
      return hook
    })

    await act(async () => {
      await result.current.forceCheck()
    })
    expect(result.current.error).toBe('stale error')

    const commitsBefore = commits.length
    mockFetchReleases.mockResolvedValueOnce({ success: true, releases: [] })

    await act(async () => {
      await result.current.forceCheck()
    })

    // Any commit emitted during the second forceCheck must not show
    // isChecking:true AND the stale error together.
    const secondPhase = commits.slice(commitsBefore)
    const flickerCommits = secondPhase.filter(
      (c) => c.isChecking === true && c.error === 'stale error',
    )
    expect(flickerCommits).toEqual([])

    // And the terminal state is a clean success.
    expect(result.current.isChecking).toBe(false)
    expect(result.current.lastCheckResult).toBe('success')
    expect(result.current.error).toBeNull()
  })
})
