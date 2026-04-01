import { describe, it, expect, beforeEach, vi } from 'vitest'
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
})
