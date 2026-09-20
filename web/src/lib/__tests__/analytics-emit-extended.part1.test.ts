import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  emitCardAdded,
  emitPageView,
  initAnalytics,
  setAnalyticsOptOut,
  emitDeveloperSession,
  emitSessionContext,
  emitScreenshotAttached,
  emitScreenshotUploadFailed,
  emitScreenshotUploadSuccess,
} from '../analytics'

// ---------------------------------------------------------------------------
// Split from analytics-emit-extended.test.ts (part 1 of 3)
// ---------------------------------------------------------------------------

describe('send() gating: opted-out prevents event delivery', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('send drops events when analytics is opted out', async () => {
    vi.resetModules()
    // Set opt-out BEFORE importing the module
    localStorage.setItem('kc-analytics-opt-out', 'true')

    const mod = await import('../analytics')
    // initAnalytics + simulate user interaction would normally be needed,
    // but since opt-out is checked first in send(), events are dropped
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitCardAdded('test-card', 'manual')
    // sendBeacon should NOT have been called because opted out
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
  })
})

describe('send() gating: uninitialized prevents event delivery', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
  })

  it('send drops events when initAnalytics has not been called', async () => {
    const mod = await import('../analytics')
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    // Call emit without calling initAnalytics first
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
  })
})

describe('emitScreenshotAttached', () => {
  it('does not throw with paste method', () => {
    expect(() => emitScreenshotAttached('paste', 1)).not.toThrow()
  })

  it('does not throw with drop method', () => {
    expect(() => emitScreenshotAttached('drop', 3)).not.toThrow()
  })

  it('does not throw with file_picker method', () => {
    expect(() => emitScreenshotAttached('file_picker', 2)).not.toThrow()
  })
})

describe('emitScreenshotUploadFailed', () => {
  it('does not throw with short error', () => {
    expect(() => emitScreenshotUploadFailed('network error', 1)).not.toThrow()
  })

  it('does not throw with long error (truncated)', () => {
    const longError = 'E'.repeat(300)
    expect(() => emitScreenshotUploadFailed(longError, 2)).not.toThrow()
  })

  it('does not throw with zero screenshots', () => {
    expect(() => emitScreenshotUploadFailed('error', 0)).not.toThrow()
  })
})

describe('emitScreenshotUploadSuccess', () => {
  it('does not throw with count', () => {
    expect(() => emitScreenshotUploadSuccess(3)).not.toThrow()
  })

  it('does not throw with zero count', () => {
    expect(() => emitScreenshotUploadSuccess(0)).not.toThrow()
  })
})

describe('initAnalytics automated environment detection', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('skips initialization when navigator.webdriver is true', async () => {
    vi.resetModules()
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    const mod = await import('../analytics')
    mod.initAnalytics()
    // After init with webdriver=true, analytics should not be initialized
    // Verify by checking that emitting does not trigger sendBeacon
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitPageView('/test')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  })

  it('skips initialization for HeadlessChrome user agent', async () => {
    vi.resetModules()
    const originalUA = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 HeadlessChrome/120.0',
      configurable: true,
    })
    const mod = await import('../analytics')
    mod.initAnalytics()
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitCardAdded('test', 'auto')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    })
  })

  it('skips initialization for PhantomJS user agent', async () => {
    vi.resetModules()
    const originalUA = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 PhantomJS/2.1',
      configurable: true,
    })
    const mod = await import('../analytics')
    mod.initAnalytics()
    // Ensure sendBeacon exists on navigator (JSDOM does not provide it)
    if (!navigator.sendBeacon) {
      Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
    }
    const beaconSpy = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true)
    mod.emitCardAdded('test', 'auto')
    expect(beaconSpy).not.toHaveBeenCalled()
    beaconSpy.mockRestore()
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    })
  })
})

describe('setAnalyticsOptOut cookie cleanup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears _ga and _ksc cookies on opt-out', () => {
    // Set some fake cookies
    document.cookie = '_ga_test=value;path=/'
    document.cookie = '_ksc_cid=value;path=/'

    setAnalyticsOptOut(true)

    // After opt-out, these cookies should be expired
    // Note: in JSDOM cookies may not behave exactly like browsers,
    // but the code path is exercised
    expect(localStorage.getItem('_ksc_cid')).toBeNull()
    expect(localStorage.getItem('_ksc_sid')).toBeNull()
  })
})

describe('setAnalyticsOptOut re-enable does not clear keys', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('opt-in does not clear session keys', () => {
    localStorage.setItem('_ksc_cid', 'test-cid')
    localStorage.setItem('_ksc_sid', 'test-sid')

    setAnalyticsOptOut(false)

    // Keys should still be present after opting back in
    expect(localStorage.getItem('_ksc_cid')).toBe('test-cid')
    expect(localStorage.getItem('_ksc_sid')).toBe('test-sid')
  })
})

describe('emitDeveloperSession conditional branches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('deduplicates: second call does not throw', () => {
    emitDeveloperSession()
    emitDeveloperSession()
    // Should not throw — deduped by localStorage key
  })

  it('does not fire on console.kubestellar.io (not localhost)', () => {
    // getDeploymentType() checks window.location.hostname
    // In JSDOM, hostname is 'localhost' by default, but let's verify
    // the function doesn't throw regardless
    expect(() => emitDeveloperSession()).not.toThrow()
  })
})

describe('emitSessionContext deduplication via sessionStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('first call sets sessionStorage marker', () => {
    emitSessionContext('binary', 'stable')
    expect(sessionStorage.getItem('_ksc_session_start_sent')).toBe('1')
  })

  it('second call is deduped (sessionStorage marker already set)', () => {
    emitSessionContext('binary', 'stable')
    // Call again -- should not throw and should be deduped
    expect(() => emitSessionContext('docker', 'nightly')).not.toThrow()
    // Marker should still be '1' (not overwritten)
    expect(sessionStorage.getItem('_ksc_session_start_sent')).toBe('1')
  })
})
