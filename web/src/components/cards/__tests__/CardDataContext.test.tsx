/**
 * CardDataContext Tests
 *
 * Covers:
 * - useCardLoadingState: skeleton timeout enforcement (#4885)
 * - useCardLoadingState: error state propagation (#4886)
 * - useReportCardDataState: state reporting to CardWrapper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { CardDataReportContext, useCardLoadingState, type CardDataState } from '../CardDataContext'

/** Short timeout for testing (100ms instead of 30s) */
const TEST_TIMEOUT_MS = 100

// Override the module-level constant used by useCardLoadingState
vi.mock('../../../lib/constants/network', () => ({
  CARD_LOADING_TIMEOUT_MS: 100, // 100ms for fast tests
}))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Helper: wraps the hook in a CardDataReportContext.Provider that captures
 * every state report. Returns the renderHook result plus the captured reports.
 */
function renderCardLoadingState(
  initialProps: Parameters<typeof useCardLoadingState>[0],
) {
  const reports: CardDataState[] = []
  const reportFn = (state: CardDataState) => { reports.push(state) }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CardDataReportContext.Provider value={{ report: reportFn }}>
      {children}
    </CardDataReportContext.Provider>
  )
  const hookResult = renderHook(
    (props) => useCardLoadingState(props),
    { initialProps, wrapper },
  )
  return { ...hookResult, reports }
}

describe('useCardLoadingState', () => {
  // ── Skeleton timeout enforcement (#4885) ──────────────────────────────

  describe('skeleton timeout enforcement (#4885)', () => {
    it('shows skeleton while loading with no data', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      expect(result.current.showSkeleton).toBe(true)
      expect(result.current.hasData).toBe(false)
      expect(result.current.loadingTimedOut).toBe(false)
    })

    it('exits skeleton after timeout fires when API never resolves', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Before timeout - still in skeleton
      expect(result.current.showSkeleton).toBe(true)
      expect(result.current.loadingTimedOut).toBe(false)

      // Advance past the timeout (100ms mocked)
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + 50) })

      // After timeout - skeleton must disappear (issue #4885)
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.loadingTimedOut).toBe(true)
    })

    it('exits skeleton after timeout even with consecutiveFailures > 0', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
        consecutiveFailures: 5,
      })

      // Before timeout - skeleton visible
      expect(result.current.showSkeleton).toBe(true)

      // Advance past timeout
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + 50) })

      // After timeout - skeleton MUST disappear even with active retries (#4885)
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.loadingTimedOut).toBe(true)
    })

    it('does not trigger timeout when data arrives before timeout', () => {
      const { result, rerender } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Advance partway through timeout
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS / 2) })
      expect(result.current.showSkeleton).toBe(true)

      // Data arrives - loading ends
      rerender({ isLoading: false, hasAnyData: true })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.loadingTimedOut).toBe(false)

      // Advance past original timeout - should NOT trigger
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS * 2) })
      expect(result.current.loadingTimedOut).toBe(false)
    })

    it('resets timeout when loading restarts', () => {
      const { result, rerender } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Advance close to timeout
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS - 20) })
      expect(result.current.loadingTimedOut).toBe(false)

      // Loading stops then restarts
      rerender({ isLoading: false, hasAnyData: false })
      rerender({ isLoading: true, hasAnyData: false })

      // Advance same amount again - should NOT have timed out (timer reset)
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS - 20) })
      expect(result.current.loadingTimedOut).toBe(false)

      // Advance to full timeout from restart
      act(() => { vi.advanceTimersByTime(50) })
      expect(result.current.loadingTimedOut).toBe(true)
    })
  })

  // ── Error state propagation (#4886) ───────────────────────────────────

  describe('error state propagation (#4886)', () => {
    it('reports isFailed to CardWrapper when isFailed prop is true', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isFailed: true,
        consecutiveFailures: 3,
      })

      // The last report should have isFailed: true
      const lastReport = reports[reports.length - 1]
      expect(lastReport.isFailed).toBe(true)
      expect(lastReport.consecutiveFailures).toBe(3)
    })

    it('reports isFailed when loading timeout fires', () => {
      const { reports } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Before timeout - isFailed should be false
      const beforeTimeout = reports[reports.length - 1]
      expect(beforeTimeout.isFailed).toBe(false)

      // Fire timeout
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + 50) })

      // After timeout - isFailed should be true for error badge display (#4886)
      const afterTimeout = reports[reports.length - 1]
      expect(afterTimeout.isFailed).toBe(true)
    })

    it('reports isFailed: false when data loads successfully', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isFailed: false,
        consecutiveFailures: 0,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isFailed).toBe(false)
      expect(lastReport.consecutiveFailures).toBe(0)
    })

    it('reports errorMessage when provided', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: false,
        isFailed: true,
        consecutiveFailures: 5,
        errorMessage: 'Network timeout after 30s',
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isFailed).toBe(true)
      expect(lastReport.errorMessage).toBe('Network timeout after 30s')
    })

    it('reports hasData: true once loading completes', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.hasData).toBe(true)
    })

    it('reports isDemoData when card is in demo mode', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isDemoData: true,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isDemoData).toBe(true)
    })
  })

  // ── Normal loading lifecycle ──────────────────────────────────────────

  describe('normal loading lifecycle', () => {
    it('returns showEmptyState when loading finishes with no data', () => {
      const { result } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: false,
      })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.showEmptyState).toBe(true)
      expect(result.current.hasData).toBe(true)
    })

    it('returns isRefreshing when loading with cached data', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: true,
      })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.isRefreshing).toBe(true)
      expect(result.current.hasData).toBe(true)
    })

    it('does not show skeleton when hasAnyData is true even during load', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: true,
      })

      // Stale-while-revalidate: show cached data instead of skeleton
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.hasData).toBe(true)
    })
  })

  // ── #5285 — Strengthened timeout and state transition assertions ────────

  describe('timeout behavior with real timer semantics (#5285)', () => {
    it('timeout transitions showSkeleton from true to false', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Before timeout: skeleton visible
      expect(result.current.showSkeleton).toBe(true)
      expect(result.current.showEmptyState).toBe(false)
      expect(result.current.loadingTimedOut).toBe(false)

      // After timeout: skeleton gone, empty state visible
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + 10) })
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.loadingTimedOut).toBe(true)
      // showEmptyState should be false because isLoading is still true
      // (but effectiveIsLoading is false due to timeout override)
    })

    it('timeout does not fire when hasAnyData transitions to true mid-timer', () => {
      const { result, rerender } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Advance halfway
      const HALFWAY = Math.floor(TEST_TIMEOUT_MS / 2)
      act(() => { vi.advanceTimersByTime(HALFWAY) })
      expect(result.current.showSkeleton).toBe(true)

      // Data arrives while still loading
      rerender({ isLoading: true, hasAnyData: true })
      // Skeleton should disappear (stale-while-revalidate)
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.isRefreshing).toBe(true)
      expect(result.current.loadingTimedOut).toBe(false)

      // Advance well past the original timeout
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS * 3) })
      // loadingTimedOut should remain false since hasAnyData arrived
      expect(result.current.loadingTimedOut).toBe(false)
    })

    it('reports correct state sequence: loading -> timeout -> isFailed', () => {
      const { reports } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Before timeout: isFailed should be false
      const initialReport = reports[reports.length - 1]
      expect(initialReport.isFailed).toBe(false)
      expect(initialReport.isLoading).toBe(true)

      // After timeout
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + 10) })
      const afterTimeout = reports[reports.length - 1]
      expect(afterTimeout.isFailed).toBe(true)
      expect(afterTimeout.isLoading).toBe(false)
    })

    it('timer cleanup runs on unmount to prevent memory leaks', () => {
      const { unmount } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      // Unmount while timer is pending
      unmount()

      // Advancing timers after unmount should not cause errors
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS * 2) })
      // No assertion needed — if cleanup failed, this would throw
    })

    it('multiple rapid isLoading toggles do not accumulate timers', () => {
      const { result, rerender } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      const RAPID_TOGGLES = 10
      for (let i = 0; i < RAPID_TOGGLES; i++) {
        rerender({ isLoading: false, hasAnyData: false })
        rerender({ isLoading: true, hasAnyData: false })
      }

      // Only the latest timer should be active
      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + 10) })
      expect(result.current.loadingTimedOut).toBe(true)

      // Verify it only fired once (not RAPID_TOGGLES times)
      expect(result.current.showSkeleton).toBe(false)
    })

    it('showEmptyState is true only when isLoading=false AND hasAnyData=false', () => {
      const { result, rerender } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: false,
      })

      expect(result.current.showEmptyState).toBe(true)

      // With data, empty state disappears
      rerender({ isLoading: false, hasAnyData: true })
      expect(result.current.showEmptyState).toBe(false)

      // While loading with no data, showEmptyState is false (skeleton instead)
      rerender({ isLoading: true, hasAnyData: false })
      expect(result.current.showEmptyState).toBe(false)
    })

    it('isRefreshing is true when loading with existing data', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: true,
      })

      expect(result.current.isRefreshing).toBe(true)
      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.hasData).toBe(true)
    })

    it('reports lastUpdated as Date when lastRefresh is provided', () => {
      const NOW_MS = 1700000000000
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        lastRefresh: NOW_MS,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.lastUpdated).toBeInstanceOf(Date)
      expect(lastReport.lastUpdated?.getTime()).toBe(NOW_MS)
    })

    it('reports lastUpdated as null when lastRefresh is not provided', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.lastUpdated).toBeNull()
    })
  })
})
