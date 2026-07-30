import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isBrowserNotifVerified, setBrowserNotifVerified } from '../notificationStatus'

describe('isBrowserNotifVerified', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns false when nothing stored', () => {
    expect(isBrowserNotifVerified()).toBe(false)
  })

  it('returns true when recently verified', () => {
    setBrowserNotifVerified(true)
    expect(isBrowserNotifVerified()).toBe(true)
  })

  it('returns false when verified=false', () => {
    setBrowserNotifVerified(false)
    expect(isBrowserNotifVerified()).toBe(false)
  })

  it('returns false when verification expired', () => {
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000
    localStorage.setItem('kc_browser_notif_verified', JSON.stringify({
      verified: true,
      at: Date.now() - THIRTY_ONE_DAYS_MS,
    }))
    expect(isBrowserNotifVerified()).toBe(false)
  })

  it('returns false for invalid JSON', () => {
    localStorage.setItem('kc_browser_notif_verified', 'not-json')
    expect(isBrowserNotifVerified()).toBe(false)
  })
})

describe('setBrowserNotifVerified', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists verified state', () => {
    setBrowserNotifVerified(true)
    const stored = JSON.parse(localStorage.getItem('kc_browser_notif_verified')!)
    expect(stored.verified).toBe(true)
    expect(typeof stored.at).toBe('number')
  })

  it('returns true when persistence succeeds', () => {
    expect(setBrowserNotifVerified(true)).toBe(true)
  })

  describe('when localStorage.setItem throws (#8866)', () => {
    let setItemSpy: ReturnType<typeof vi.spyOn>
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        // Simulate browser quota / private-browsing failure mode
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      setItemSpy.mockRestore()
      warnSpy.mockRestore()
    })

    it('returns false instead of throwing', () => {
      expect(() => setBrowserNotifVerified(true)).not.toThrow()
      expect(setBrowserNotifVerified(true)).toBe(false)
    })

    it('logs a warning so the failure is observable', () => {
      setBrowserNotifVerified(true)
      expect(warnSpy).toHaveBeenCalled()
    })
  })
})
