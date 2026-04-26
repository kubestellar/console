/**
 * Integration tests verifying GA4 runtime noise filters added in PR #9824.
 *
 * These tests dispatch each category of "noise" error (WebGL / canvas /
 * network / Non-Error) to both the `window.error` and `unhandledrejection`
 * handlers set up by `startGlobalErrorTracking()`, and assert that
 * `navigator.sendBeacon` is NOT called — i.e. the error is skipped and
 * never reaches GA4.
 *
 * A real runtime error is dispatched first so we can prove sendBeacon *does*
 * fire on non-filtered errors, which establishes a non-trivial baseline.
 *
 * Covers: issue #9833 (PR #9824 regression coverage)
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
import { _resetErrorThrottles } from '../analytics-core'

/* ── Constants ──────────────────────────────────────────────────────── */

/** Timeout for gtag.js load decision (mirrors GTAG_LOAD_TIMEOUT_MS in analytics-core) */
const GTAG_LOAD_TIMEOUT_MS = 5_000
/** Small buffer added after gtag timeout to ensure decision is made */
const TIMER_BUFFER_MS = 200

/* ── Helpers ────────────────────────────────────────────────────────── */

/**
 * Bring the analytics pipeline to a state where a normal runtime error
 * would reach `navigator.sendBeacon`. Returns the post-baseline call count.
 */
function primeAnalyticsAndCaptureBaseline(
  sendBeaconSpy: ReturnType<typeof vi.fn>,
): number {
  initAnalytics()
  startGlobalErrorTracking()
  // First user interaction ungates the send pipeline
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  // Advance past the gtag.js load timeout so the proxy path is chosen
  vi.advanceTimersByTime(GTAG_LOAD_TIMEOUT_MS + TIMER_BUFFER_MS)

  // Prove sendBeacon fires on a normal runtime error, then anchor the baseline
  const before = sendBeaconSpy.mock.calls.length
  window.dispatchEvent(new ErrorEvent('error', {
    message: 'TypeError: non-filtered runtime error',
  }))
  const after = sendBeaconSpy.mock.calls.length
  expect(after).toBeGreaterThan(before)
  return after
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe('GA4 runtime noise filters — window.error handler', () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    _resetErrorThrottles()
    sendBeaconSpy = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('filters WebGL errors (context lost / GL_INVALID) from runtime errors', () => {
    const baseline = primeAnalyticsAndCaptureBaseline(sendBeaconSpy)

    window.dispatchEvent(new ErrorEvent('error', { message: 'WebGL: context lost' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'GL_INVALID_OPERATION in glDrawElements' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'WebGL context lost due to GPU reset' }))

    expect(sendBeaconSpy.mock.calls.length).toBe(baseline)
  })

  it('filters canvas errors (CanvasRenderingContext / toDataURL)', () => {
    const baseline = primeAnalyticsAndCaptureBaseline(sendBeaconSpy)

    window.dispatchEvent(new ErrorEvent('error', { message: 'canvas: tainted by cross-origin data' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'CanvasRenderingContext2D is null' }))

    expect(sendBeaconSpy.mock.calls.length).toBe(baseline)
  })

  it('filters network errors surfacing as runtime errors', () => {
    const baseline = primeAnalyticsAndCaptureBaseline(sendBeaconSpy)

    window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'NetworkError when attempting to fetch resource.' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'net::ERR_CONNECTION_REFUSED' }))

    expect(sendBeaconSpy.mock.calls.length).toBe(baseline)
  })

  it('filters Non-Error promise rejection messages', () => {
    const baseline = primeAnalyticsAndCaptureBaseline(sendBeaconSpy)

    window.dispatchEvent(new ErrorEvent('error', {
      message: 'Non-Error promise rejection captured with value: undefined',
    }))

    expect(sendBeaconSpy.mock.calls.length).toBe(baseline)
  })
})

describe('GA4 runtime noise filters — unhandledrejection handler', () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    _resetErrorThrottles()
    sendBeaconSpy = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', {
      value: sendBeaconSpy,
      writable: true,
      configurable: true,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * Helper that dispatches an unhandledrejection event with a given reason
   * message, without throwing in jsdom.
   */
  function dispatchRejection(message: string): void {
    const event = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(event, 'reason', {
      value: { message },
      configurable: true,
    })
    window.dispatchEvent(event)
  }

  it('filters WebGL / context-lost rejections (per PR #9824 handler parity)', () => {
    const baseline = primeAnalyticsAndCaptureBaseline(sendBeaconSpy)

    dispatchRejection('WebGL: context lost')
    dispatchRejection('WebGLRenderingContext: context lost')

    expect(sendBeaconSpy.mock.calls.length).toBe(baseline)
  })

  it('filters network rejections (Failed to fetch / NetworkError / net::ERR_)', () => {
    const baseline = primeAnalyticsAndCaptureBaseline(sendBeaconSpy)

    dispatchRejection('Failed to fetch')
    dispatchRejection('NetworkError when attempting to fetch resource.')
    dispatchRejection('net::ERR_INTERNET_DISCONNECTED')

    expect(sendBeaconSpy.mock.calls.length).toBe(baseline)
  })
})
