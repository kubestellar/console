import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isUpdateSnoozed, snoozeUpdate } from './snooze'

const STORAGE_KEY = 'kc-update-snoozed'
const ONE_HOUR_MS = 60 * 60 * 1000

describe('snooze', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('isUpdateSnoozed', () => {
    it('returns false when no value is stored', () => {
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('returns false when stored timestamp is in the past', () => {
      localStorage.setItem(STORAGE_KEY, String(Date.now() - ONE_HOUR_MS))
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('returns true when stored timestamp is in the future', () => {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + ONE_HOUR_MS))
      expect(isUpdateSnoozed()).toBe(true)
    })

    it('returns false at the exact expiry moment (strict less-than)', () => {
      vi.useFakeTimers()
      const now = new Date('2026-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)
      localStorage.setItem(STORAGE_KEY, String(now))
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('returns false when stored value is non-numeric (Number("") is 0)', () => {
      localStorage.setItem(STORAGE_KEY, '')
      // empty string is falsy → early return before Number()
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('returns false when stored value is NaN-producing (Date.now() < NaN is false)', () => {
      localStorage.setItem(STORAGE_KEY, 'not-a-number')
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('returns false when localStorage.getItem throws', () => {
      const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      expect(isUpdateSnoozed()).toBe(false)
      spy.mockRestore()
    })
  })

  describe('snoozeUpdate', () => {
    it('writes now+duration to localStorage', () => {
      vi.useFakeTimers()
      const now = new Date('2026-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)
      snoozeUpdate(ONE_HOUR_MS)
      expect(localStorage.getItem(STORAGE_KEY)).toBe(String(now + ONE_HOUR_MS))
    })

    it('after snoozeUpdate, isUpdateSnoozed returns true within the window', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime())
      snoozeUpdate(ONE_HOUR_MS)
      expect(isUpdateSnoozed()).toBe(true)
    })

    it('after the snooze window expires, isUpdateSnoozed returns false', () => {
      vi.useFakeTimers()
      const start = new Date('2026-01-01T00:00:00Z').getTime()
      vi.setSystemTime(start)
      snoozeUpdate(ONE_HOUR_MS)
      vi.setSystemTime(start + ONE_HOUR_MS + 1)
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('overwrites any prior snooze value', () => {
      vi.useFakeTimers()
      const now = new Date('2026-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)
      snoozeUpdate(ONE_HOUR_MS)
      snoozeUpdate(2 * ONE_HOUR_MS)
      expect(localStorage.getItem(STORAGE_KEY)).toBe(String(now + 2 * ONE_HOUR_MS))
    })

    it('accepts zero duration (snooze expires immediately)', () => {
      vi.useFakeTimers()
      const now = new Date('2026-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)
      snoozeUpdate(0)
      expect(localStorage.getItem(STORAGE_KEY)).toBe(String(now))
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('accepts negative durations (snooze expires in the past → not snoozed)', () => {
      vi.useFakeTimers()
      const now = new Date('2026-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)
      snoozeUpdate(-ONE_HOUR_MS)
      expect(isUpdateSnoozed()).toBe(false)
    })

    it('silently ignores localStorage.setItem exceptions', () => {
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      expect(() => snoozeUpdate(ONE_HOUR_MS)).not.toThrow()
      spy.mockRestore()
    })

    it('does not persist anything when setItem throws', () => {
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      snoozeUpdate(ONE_HOUR_MS)
      spy.mockRestore()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })

  describe('round-trip', () => {
    it('snooze then check reflects real elapsed time via advanceTimersByTime', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime())
      snoozeUpdate(ONE_HOUR_MS)
      expect(isUpdateSnoozed()).toBe(true)
      vi.advanceTimersByTime(ONE_HOUR_MS / 2)
      expect(isUpdateSnoozed()).toBe(true)
      vi.advanceTimersByTime(ONE_HOUR_MS)
      expect(isUpdateSnoozed()).toBe(false)
    })
  })
})
