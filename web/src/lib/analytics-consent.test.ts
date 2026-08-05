import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setAnalyticsOptOut, isAnalyticsOptedOut } from './analytics-consent'
import { STORAGE_KEY_ANALYTICS_OPT_OUT } from './constants'
import {
  CID_KEY,
  SID_KEY,
  SC_KEY,
  LAST_KEY,
} from './analytics-session'

// Prevent the real dispatcher from firing side effects during tests;
// we're testing the consent surface, not the transport.
vi.mock('./analytics-dispatch', () => ({
  send: vi.fn(),
}))

// stopEngagementTracking uses a real interval; stub it out to keep the
// test hermetic.
vi.mock('./analytics-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./analytics-session')>()
  return {
    ...actual,
    stopEngagementTracking: vi.fn(),
  }
})

describe('analytics-consent', () => {
  beforeEach(() => {
    localStorage.clear()
    // reset document.cookie by clearing every cookie the runtime knows about
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      if (name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setAnalyticsOptOut', () => {
    it('persists true to the opt-out storage key when opting out', () => {
      setAnalyticsOptOut(true)
      expect(localStorage.getItem(STORAGE_KEY_ANALYTICS_OPT_OUT)).toBe('true')
    })

    it('persists false to the opt-out storage key when opting in', () => {
      setAnalyticsOptOut(false)
      expect(localStorage.getItem(STORAGE_KEY_ANALYTICS_OPT_OUT)).toBe('false')
    })

    it('dispatches a kubestellar-settings-changed event on change', () => {
      const listener = vi.fn()
      window.addEventListener('kubestellar-settings-changed', listener)
      try {
        setAnalyticsOptOut(true)
        expect(listener).toHaveBeenCalledTimes(1)
        setAnalyticsOptOut(false)
        expect(listener).toHaveBeenCalledTimes(2)
      } finally {
        window.removeEventListener('kubestellar-settings-changed', listener)
      }
    })

    it('clears session/client-id storage keys when opting out', () => {
      localStorage.setItem(CID_KEY, 'cid-1')
      localStorage.setItem(SID_KEY, 'sid-1')
      localStorage.setItem(SC_KEY, '5')
      localStorage.setItem(LAST_KEY, String(Date.now()))

      setAnalyticsOptOut(true)

      expect(localStorage.getItem(CID_KEY)).toBeNull()
      expect(localStorage.getItem(SID_KEY)).toBeNull()
      expect(localStorage.getItem(SC_KEY)).toBeNull()
      expect(localStorage.getItem(LAST_KEY)).toBeNull()
    })

    it('does not clear session/client-id storage keys when opting in', () => {
      localStorage.setItem(CID_KEY, 'cid-1')
      localStorage.setItem(SID_KEY, 'sid-1')
      localStorage.setItem(SC_KEY, '5')
      localStorage.setItem(LAST_KEY, '1234')

      setAnalyticsOptOut(false)

      expect(localStorage.getItem(CID_KEY)).toBe('cid-1')
      expect(localStorage.getItem(SID_KEY)).toBe('sid-1')
      expect(localStorage.getItem(SC_KEY)).toBe('5')
      expect(localStorage.getItem(LAST_KEY)).toBe('1234')
    })

    it('deletes _ga* and _ksc* cookies when opting out', () => {
      document.cookie = '_ga=abc;path=/'
      document.cookie = '_ga_XYZ=def;path=/'
      document.cookie = '_ksc_something=1;path=/'
      document.cookie = 'unrelated=keep;path=/'

      setAnalyticsOptOut(true)

      const cookies = document.cookie
      expect(cookies).not.toMatch(/(^|;\s*)_ga=/)
      expect(cookies).not.toMatch(/(^|;\s*)_ga_XYZ=/)
      expect(cookies).not.toMatch(/(^|;\s*)_ksc_something=/)
      // unrelated cookie remains
      expect(cookies).toMatch(/(^|;\s*)unrelated=keep/)
    })

    it('leaves unrelated cookies untouched when opting in', () => {
      document.cookie = 'unrelated=keep;path=/'
      document.cookie = '_ga=leaveme;path=/'
      setAnalyticsOptOut(false)
      expect(document.cookie).toMatch(/unrelated=keep/)
      // opt-in path does not touch cookies
      expect(document.cookie).toMatch(/_ga=leaveme/)
    })
  })

  describe('isAnalyticsOptedOut', () => {
    it('returns false when the storage key is unset', () => {
      expect(isAnalyticsOptedOut()).toBe(false)
    })

    it('returns true only when the storage key equals the exact string "true"', () => {
      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, 'true')
      expect(isAnalyticsOptedOut()).toBe(true)

      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, 'false')
      expect(isAnalyticsOptedOut()).toBe(false)

      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPT_OUT, '1')
      expect(isAnalyticsOptedOut()).toBe(false)
    })

    it('round-trips through setAnalyticsOptOut', () => {
      setAnalyticsOptOut(true)
      expect(isAnalyticsOptedOut()).toBe(true)

      setAnalyticsOptOut(false)
      expect(isAnalyticsOptedOut()).toBe(false)
    })
  })
})
