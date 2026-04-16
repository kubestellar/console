import { describe, it, expect } from 'vitest'
import { detectInstructionKey } from '../BrowserNotificationSettings'

const FIREFOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15'

describe('detectInstructionKey', () => {
  it('returns Firefox key for a Firefox UA (reporter is on Firefox — #8305)', () => {
    expect(detectInstructionKey(FIREFOX_UA)).toBe('settings.notifications.browser.enableInstructionsFirefox')
  })

  it('returns Chrome key for Chrome', () => {
    expect(detectInstructionKey(CHROME_UA)).toBe('settings.notifications.browser.enableInstructionsChrome')
  })

  it('returns Edge key for Edge (must match before Chrome — its UA contains "Chrome")', () => {
    expect(detectInstructionKey(EDGE_UA)).toBe('settings.notifications.browser.enableInstructionsEdge')
  })

  it('returns Safari key only for real Safari, not Chrome-on-Mac', () => {
    expect(detectInstructionKey(SAFARI_UA)).toBe('settings.notifications.browser.enableInstructionsSafari')
    expect(detectInstructionKey(CHROME_UA)).not.toBe('settings.notifications.browser.enableInstructionsSafari')
  })

  it('falls back to generic for empty/unknown UA', () => {
    expect(detectInstructionKey('')).toBe('settings.notifications.browser.enableInstructionsGeneric')
    expect(detectInstructionKey('SomeWeirdBrowser/1.0')).toBe('settings.notifications.browser.enableInstructionsGeneric')
  })
})
