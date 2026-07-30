/**
 * Unit tests for pure helpers exported from useMiniDashboard.
 *
 * The full useMiniDashboard() hook wires up MCP data, PWA install prompts,
 * notifications, polling, and multiple useEffect() side-effects; that is
 * exercised end-to-end by the MiniDashboard component tests. This file
 * pins down the small, side-effect-free helpers that are exported for
 * use elsewhere and are the highest-leverage regression targets.
 *
 * Addresses #21906 (coverage gap for hooks extracted in #21904).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSafari, isStandalone, MAX_ISSUES_SHOWN } from '../useMiniDashboard'

/** Overwrite navigator.userAgent for the duration of one test. */
function withUserAgent(ua: string, fn: () => void) {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent')
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
  try {
    fn()
  } finally {
    if (original) Object.defineProperty(window.navigator, 'userAgent', original)
  }
}

describe('MAX_ISSUES_SHOWN', () => {
  it('is a positive integer (widget renders a bounded list)', () => {
    expect(Number.isInteger(MAX_ISSUES_SHOWN)).toBe(true)
    expect(MAX_ISSUES_SHOWN).toBeGreaterThan(0)
  })
})

describe('isSafari', () => {
  it('returns true for a real Safari user agent (no Chromium marker)', () => {
    withUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      () => expect(isSafari()).toBe(true),
    )
  })

  it('returns false for Chrome (contains both Safari and Chrome markers)', () => {
    withUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      () => expect(isSafari()).toBe(false),
    )
  })

  it('returns false for Chromium-branded browsers (e.g. Edge, Brave)', () => {
    withUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/125.0 Safari/537.36',
      () => expect(isSafari()).toBe(false),
    )
  })

  it('returns false for Firefox (no Safari marker)', () => {
    withUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
      () => expect(isSafari()).toBe(false),
    )
  })
})

describe('isStandalone', () => {
  const originalMatchMedia = window.matchMedia
  const originalStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(window.navigator, 'standalone', {
      value: originalStandalone,
      configurable: true,
    })
  })

  it('returns true when display-mode media query matches (installed PWA)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true })
    expect(isStandalone()).toBe(true)
  })

  it('returns true when iOS Safari standalone flag is set', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
  })

  it('returns false when neither signal is present (running in a browser tab)', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true })
    expect(isStandalone()).toBe(false)
  })

  it('queries the correct display-mode media feature', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false })
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia
    Object.defineProperty(window.navigator, 'standalone', { value: false, configurable: true })
    isStandalone()
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)')
  })
})
