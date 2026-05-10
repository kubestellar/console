/**
 * Tests for useCardLoadingState hook.
 *
 * Covers the five core behavioral scenarios from CLAUDE.md:
 * 1. Loading skeleton  — isLoading=true with no cached data
 * 2. Demo data badge   — isDemoData=true reported to CardWrapper
 * 3. Refresh animation — isRefreshing override triggers spinner
 * 4. Failure tracking  — isFailed + consecutiveFailures propagate; timeout exits skeleton
 * 5. Happy path        — live data, no special states
 *
 * Run: npx vitest run src/hooks/__tests__/useCardLoadingState.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { CardDataReportContext, useCardLoadingState, type CardDataState } from '../../components/cards/CardDataContext'

// ── Constants ────────────────────────────────────────────────────────────────

/** Matches the mocked CARD_LOADING_TIMEOUT_MS below — 100ms instead of 30s */
const TEST_TIMEOUT_MS = 100
/** Extra buffer past timeout to guarantee the timer has fired */
const TIMER_BUFFER_MS = 10
/** Consecutive failure count used in failure-tracking tests */
const CONSECUTIVE_FAILURES_COUNT = 3
/** Initial failure count used in timeout-exit tests */
const ONE_FAILURE = 1

// ── Module mocks (hoisted before imports by Vitest) ─────────────────────────

// Replace 30s timeout with 100ms so timeout tests don't have to wait.
// Other constants from this module are not used by useCardLoadingState directly.
vi.mock('../../lib/constants/network', () => ({
  CARD_LOADING_TIMEOUT_MS: 100,
}))

// ── Timer setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Render useCardLoadingState inside a CardDataReportContext.Provider that
 * accumulates every state report. Returns the hook result AND the reports array.
 */
function renderCardLoadingState(
  initialProps: Parameters<typeof useCardLoadingState>[0],
) {
  const reports: CardDataState[] = []
  const reportFn = (state: CardDataState) => { reports.push(state) }

  const wrapper = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      CardDataReportContext.Provider,
      { value: { report: reportFn } },
      children,
    )

  const hookResult = renderHook(
    (props) => useCardLoadingState(props),
    { initialProps, wrapper },
  )
  return { ...hookResult, reports }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useCardLoadingState', () => {
  // ── 1. Loading skeleton ──────────────────────────────────────────────────

  describe('loading skeleton — isLoading=true, no cached data', () => {
    it('shows skeleton while loading with no cached data', () => {
      const { result } = renderCardLoadingState({ isLoading: true, hasAnyData: false })

      expect(result.current.showSkeleton).toBe(true)
      expect(result.current.isRefreshing).toBe(false)
      expect(result.current.loadingTimedOut).toBe(false)
    })

    it('reports isLoading: true to CardWrapper so the demo badge is suppressed', () => {
      const { reports } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
        isDemoData: true,
      })

      // CardWrapper uses isLoading from the report to decide whether to show
      // the skeleton instead of the demo badge
      expect(reports.length).toBeGreaterThan(0)
      const lastReport = reports[reports.length - 1]
      expect(lastReport.isLoading).toBe(true)
    })
  })

  // ── 2. Demo data indicator ───────────────────────────────────────────────

  describe('demo data indicator — isDemoData=true, not loading', () => {
    it('reports isDemoData: true to CardWrapper (drives yellow badge and outline)', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isDemoData: true,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isDemoData).toBe(true)
      expect(lastReport.isLoading).toBe(false)
    })

    it('does not show skeleton when serving demo data', () => {
      const { result } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isDemoData: true,
      })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.hasData).toBe(true)
    })
  })

  // ── 3. Refresh animation ─────────────────────────────────────────────────

  describe('refresh animation — isRefreshing override', () => {
    it('reports isRefreshing: true when the data hook signals a background refresh', () => {
      const { reports } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: true,
        isRefreshing: true,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isRefreshing).toBe(true)
    })

    it('does not show skeleton during a background refresh (stale-while-revalidate)', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: true,
        isRefreshing: true,
      })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.hasData).toBe(true)
    })
  })

  // ── 4. Failure tracking ──────────────────────────────────────────────────

  describe('failure tracking — isFailed=true, consecutiveFailures propagation', () => {
    it('passes isFailed and consecutiveFailures through to CardWrapper', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isFailed: true,
        consecutiveFailures: CONSECUTIVE_FAILURES_COUNT,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isFailed).toBe(true)
      expect(lastReport.consecutiveFailures).toBe(CONSECUTIVE_FAILURES_COUNT)
    })

    it('exits loading skeleton after safety-net timeout (API never resolved)', () => {
      const { result } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
        isFailed: true,
        consecutiveFailures: ONE_FAILURE,
      })

      expect(result.current.showSkeleton).toBe(true)

      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + TIMER_BUFFER_MS) })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.loadingTimedOut).toBe(true)
    })

    it('reports isFailed: true to CardWrapper after the loading timeout fires', () => {
      const { reports } = renderCardLoadingState({
        isLoading: true,
        hasAnyData: false,
      })

      act(() => { vi.advanceTimersByTime(TEST_TIMEOUT_MS + TIMER_BUFFER_MS) })

      const afterTimeout = reports[reports.length - 1]
      expect(afterTimeout.isFailed).toBe(true)
      expect(afterTimeout.isLoading).toBe(false)
    })
  })

  // ── 5. Happy path ────────────────────────────────────────────────────────

  describe('happy path — live data, no special states', () => {
    it('shows data without skeleton, empty state, or timeout', () => {
      const { result } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isDemoData: false,
        isFailed: false,
        consecutiveFailures: 0,
      })

      expect(result.current.showSkeleton).toBe(false)
      expect(result.current.showEmptyState).toBe(false)
      expect(result.current.hasData).toBe(true)
      expect(result.current.loadingTimedOut).toBe(false)
    })

    it('reports a healthy state to CardWrapper with no failures or demo flags', () => {
      const { reports } = renderCardLoadingState({
        isLoading: false,
        hasAnyData: true,
        isDemoData: false,
        isFailed: false,
        consecutiveFailures: 0,
      })

      const lastReport = reports[reports.length - 1]
      expect(lastReport.isFailed).toBe(false)
      expect(lastReport.consecutiveFailures).toBe(0)
      expect(lastReport.isDemoData).toBe(false)
      expect(lastReport.hasData).toBe(true)
    })
  })
})
