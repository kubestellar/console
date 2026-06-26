import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { isDNDActive, getDNDRemaining, useDoNotDisturb } from '../useDoNotDisturb'

const STORAGE_KEY = 'kc_dnd'

beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('isDNDActive', () => {
  it('returns false when no state stored', () => {
    expect(isDNDActive()).toBe(false)
  })

  it('returns true when manualDND is true', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ manualDND: true }))
    expect(isDNDActive()).toBe(true)
  })

  it('returns false when manualDND is explicitly false', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ manualDND: false }))
    expect(isDNDActive()).toBe(false)
  })

  it('returns true when timed DND is active (future timestamp)', () => {
    const until = Date.now() + 60_000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timedDNDUntil: until }))
    expect(isDNDActive()).toBe(true)
  })

  it('returns false when timed DND has expired', () => {
    const until = Date.now() - 1_000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timedDNDUntil: until }))
    expect(isDNDActive()).toBe(false)
  })

  it('returns false when timedDNDUntil is zero', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timedDNDUntil: 0 }))
    expect(isDNDActive()).toBe(false)
  })

  it('returns false when quiet hours disabled', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      quietHoursEnabled: false,
      quietHoursStart: '00:00',
      quietHoursEnd: '23:59',
    }))
    expect(isDNDActive()).toBe(false)
  })

  it('returns false for corrupt localStorage JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{')
    expect(isDNDActive()).toBe(false)
  })
})

describe('getDNDRemaining', () => {
  it('returns 0 when no timed DND', () => {
    expect(getDNDRemaining()).toBe(0)
  })

  it('returns positive remaining ms when timed DND is active', () => {
    const until = Date.now() + 60_000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timedDNDUntil: until }))
    const remaining = getDNDRemaining()
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(60_000)
  })

  it('returns 0 when timed DND has expired', () => {
    const until = Date.now() - 1_000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timedDNDUntil: until }))
    expect(getDNDRemaining()).toBe(0)
  })
})

describe('useDoNotDisturb hook', () => {
  it('initializes with default state (not active)', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    expect(result.current.isActive).toBe(false)
    expect(result.current.isManualDND).toBe(false)
    expect(result.current.timedDNDUntil).toBe(0)
    expect(result.current.quietHoursEnabled).toBe(false)
  })

  it('setManualDND(true) activates DND', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setManualDND(true) })
    expect(result.current.isManualDND).toBe(true)
    expect(result.current.isActive).toBe(true)
  })

  it('setManualDND(false) deactivates DND', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setManualDND(true) })
    act(() => { result.current.setManualDND(false) })
    expect(result.current.isManualDND).toBe(false)
    expect(result.current.isActive).toBe(false)
  })

  it('setTimedDND("1h") sets timedDNDUntil ~1h from now', () => {
    const before = Date.now()
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setTimedDND('1h') })
    const MS_PER_HOUR = 60 * 60 * 1000
    expect(result.current.timedDNDUntil).toBeGreaterThanOrEqual(before + MS_PER_HOUR - 1000)
    expect(result.current.isActive).toBe(true)
  })

  it('setTimedDND("4h") sets timedDNDUntil ~4h from now', () => {
    const before = Date.now()
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setTimedDND('4h') })
    const MS_4_HOURS = 4 * 60 * 60 * 1000
    expect(result.current.timedDNDUntil).toBeGreaterThanOrEqual(before + MS_4_HOURS - 1000)
  })

  it('setTimedDND("tomorrow") sets timedDNDUntil to tomorrow 8am', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setTimedDND('tomorrow') })
    const tomorrow = new Date(result.current.timedDNDUntil)
    expect(tomorrow.getHours()).toBe(8)
    expect(tomorrow.getMinutes()).toBe(0)
  })

  it('clearDND removes manual and timed DND', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setManualDND(true) })
    act(() => { result.current.clearDND() })
    expect(result.current.isManualDND).toBe(false)
    expect(result.current.timedDNDUntil).toBe(0)
    expect(result.current.isActive).toBe(false)
  })

  it('setQuietHours enables and sets start/end', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setQuietHours(true, '21:00', '07:00') })
    expect(result.current.quietHoursEnabled).toBe(true)
    expect(result.current.quietHoursStart).toBe('21:00')
    expect(result.current.quietHoursEnd).toBe('07:00')
  })

  it('setQuietHours disable preserves start/end', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setQuietHours(true, '21:00', '07:00') })
    act(() => { result.current.setQuietHours(false) })
    expect(result.current.quietHoursEnabled).toBe(false)
    expect(result.current.quietHoursStart).toBe('21:00')
  })

  it('remaining is positive when timed DND is active', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setTimedDND('1h') })
    expect(result.current.remaining).toBeGreaterThan(0)
  })

  it('persists state to localStorage', () => {
    const { result } = renderHook(() => useDoNotDisturb())
    act(() => { result.current.setManualDND(true) })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.manualDND).toBe(true)
  })

  it('initializes from stored localStorage state', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ manualDND: true, timedDNDUntil: 0 }))
    const { result } = renderHook(() => useDoNotDisturb())
    expect(result.current.isManualDND).toBe(true)
  })

  it('auto-clears expired timed DND on interval tick', async () => {
    vi.useFakeTimers()
    const expiredUntil = Date.now() - 1_000
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ timedDNDUntil: expiredUntil }))
    const { result } = renderHook(() => useDoNotDisturb())

    act(() => { vi.advanceTimersByTime(30_000) })

    expect(result.current.timedDNDUntil).toBe(0)
    expect(result.current.isActive).toBe(false)
  })
})
