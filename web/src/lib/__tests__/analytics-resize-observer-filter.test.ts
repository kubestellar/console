/**
 * Integration test verifying ResizeObserver loop errors are filtered
 * and NOT reported to GA4 analytics.
 *
 * This test initializes the analytics pipeline end-to-end (init + first
 * interaction + gtag timeout) and asserts that navigator.sendBeacon is
 * called for real runtime errors but NOT for ResizeObserver loop errors.
 *
 * Covers: issue #9809 (PR #9790 fix regression coverage)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/* ── Mock automated-environment check BEFORE importing analytics ──── */

vi.mock('../analytics-session', async () => {
  const actual = await vi.importActual<typeof import('../analytics-session')>('../analytics-session')
  return {
    ...actual,
    // Force isAutomatedEnvironment to return false so initAnalytics proceeds
    isAutomatedEnvironment: () => false,
  }
})

import { initAnalytics, startGlobalErrorTracking } from '../analytics'

/* ── Constants ──────────────────────────────────────────────────────── */

/** Timeout for gtag.js load decision (mirrors GTAG_LOAD_TIMEOUT_MS in analytics-core) */
const GTAG_LOAD_TIMEOUT_MS = 5_000
/** Small buffer added after gtag timeout to ensure decision is made */
const TIMER_BUFFER_MS = 200

describe('ResizeObserver errors are NOT reported to GA4', () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    // Spy on navigator.sendBeacon — the final output of the proxy send path
    sendBeaconSpy = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    })
    // Prevent actual fetch calls from the proxy path
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('filters ResizeObserver loop errors while reporting normal runtime errors', () => {
    // Step 1: Initialize analytics (sets initialized = true)
    initAnalytics()

    // Step 2: Set up error tracking listeners
    startGlobalErrorTracking()

    // Step 3: Simulate first user interaction to ungate the send pipeline
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    // Step 4: Advance timers past the gtag load timeout so gtagDecided = true
    // (gtag.js won't actually load in jsdom, so proxy path is used)
    vi.advanceTimersByTime(GTAG_LOAD_TIMEOUT_MS + TIMER_BUFFER_MS)

    // Baseline: record sendBeacon call count before errors
    const baselineCount = sendBeaconSpy.mock.calls.length

    // Step 5: Dispatch a NORMAL runtime error — should reach sendBeacon
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'TypeError: Cannot read properties of undefined',
    }))

    const afterNormalError = sendBeaconSpy.mock.calls.length
    // The normal error should have triggered at least one sendBeacon call
    expect(afterNormalError).toBeGreaterThan(baselineCount)

    // Step 6: Dispatch ResizeObserver errors — should NOT increase send count
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'ResizeObserver loop completed with undelivered notifications.',
    }))
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'ResizeObserver loop limit exceeded',
    }))

    const afterResizeErrors = sendBeaconSpy.mock.calls.length
    // ResizeObserver errors must NOT produce any additional sendBeacon calls
    expect(afterResizeErrors).toBe(afterNormalError)
  })

  it('filters ResizeObserver errors with partial message match', () => {
    initAnalytics()
    startGlobalErrorTracking()
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    vi.advanceTimersByTime(GTAG_LOAD_TIMEOUT_MS + TIMER_BUFFER_MS)

    const beforeCount = sendBeaconSpy.mock.calls.length

    // Hypothetical future browser message variant containing "ResizeObserver loop"
    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Uncaught: ResizeObserver loop error detected',
    }))

    expect(sendBeaconSpy.mock.calls.length).toBe(beforeCount)
  })
})
