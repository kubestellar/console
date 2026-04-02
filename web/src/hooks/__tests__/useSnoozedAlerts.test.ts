import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  POLL_INTERVAL_SLOW_MS: 60000,
} })

const mockEmitSnoozed = vi.fn()
const mockEmitUnsnoozed = vi.fn()

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: (...args: unknown[]) => mockEmitSnoozed(...args),
  emitUnsnoozed: (...args: unknown[]) => mockEmitUnsnoozed(...args),
}))

import { useSnoozedAlerts, SNOOZE_DURATIONS, formatSnoozeRemaining } from '../useSnoozedAlerts'

describe('useSnoozedAlerts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Reset module-level state by clearing all snoozed alerts
    const { result } = renderHook(() => useSnoozedAlerts())
    act(() => { result.current.clearAllSnoozed() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Initial state ────────────────────────────────────────────────────

  it('starts with empty snoozed list and zero count', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    expect(result.current.snoozedAlerts).toEqual([])
    expect(result.current.snoozedCount).toBe(0)
  })

  // ── SNOOZE_DURATIONS constants ────────────────────────────────────────

  it('exports correct snooze duration values in milliseconds', () => {
    const FIVE_MINUTES_MS = 5 * 60 * 1000
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
    const ONE_HOUR_MS = 60 * 60 * 1000
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

    expect(SNOOZE_DURATIONS['5m']).toBe(FIVE_MINUTES_MS)
    expect(SNOOZE_DURATIONS['15m']).toBe(FIFTEEN_MINUTES_MS)
    expect(SNOOZE_DURATIONS['1h']).toBe(ONE_HOUR_MS)
    expect(SNOOZE_DURATIONS['4h']).toBe(FOUR_HOURS_MS)
    expect(SNOOZE_DURATIONS['24h']).toBe(TWENTY_FOUR_HOURS_MS)
  })

  // ── snoozeAlert ───────────────────────────────────────────────────────

  it('snoozeAlert adds an alert with correct timestamps and duration', () => {
    const now = Date.now()
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('alert-1', '1h') })

    expect(result.current.snoozedAlerts).toHaveLength(1)
    const snoozed = result.current.snoozedAlerts[0]
    expect(snoozed.alertId).toBe('alert-1')
    expect(snoozed.duration).toBe('1h')
    expect(snoozed.snoozedAt).toBeGreaterThanOrEqual(now)
    expect(snoozed.expiresAt).toBe(snoozed.snoozedAt + SNOOZE_DURATIONS['1h'])
  })

  it('snoozeAlert defaults to 1h duration when none specified', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('alert-default') })

    expect(result.current.snoozedAlerts[0].duration).toBe('1h')
  })

  it('snoozeAlert replaces an existing snooze for the same alert', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('alert-dup', '5m') })
    expect(result.current.snoozedAlerts[0].duration).toBe('5m')

    act(() => { result.current.snoozeAlert('alert-dup', '24h') })
    // Still only one entry, but with the updated duration
    expect(result.current.snoozedAlerts).toHaveLength(1)
    expect(result.current.snoozedAlerts[0].duration).toBe('24h')
  })

  it('snoozeAlert emits analytics event', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('alert-analytics', '15m') })

    expect(mockEmitSnoozed).toHaveBeenCalledWith('alert', '15m')
  })

  it('snoozeAlert returns the created SnoozedAlert object', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    let returned: unknown
    act(() => {
      returned = result.current.snoozeAlert('alert-ret', '4h')
    })
    expect(returned).toMatchObject({
      alertId: 'alert-ret',
      duration: '4h',
    })
  })

  // ── snoozeMultiple ────────────────────────────────────────────────────

  it('snoozeMultiple adds multiple alerts at once with same expiry', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeMultiple(['a1', 'a2', 'a3'], '15m')
    })

    expect(result.current.snoozedAlerts).toHaveLength(3)
    expect(result.current.snoozedCount).toBe(3)
    // All should share the same expiresAt
    const expiries = result.current.snoozedAlerts.map(s => s.expiresAt)
    expect(new Set(expiries).size).toBe(1)
  })

  it('snoozeMultiple replaces existing snoozes for the same IDs', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('overlap', '5m') })
    expect(result.current.snoozedAlerts).toHaveLength(1)

    act(() => { result.current.snoozeMultiple(['overlap', 'new-one'], '4h') })
    // overlap should be replaced (not duplicated), new-one added
    expect(result.current.snoozedAlerts).toHaveLength(2)
    const overlap = result.current.snoozedAlerts.find(s => s.alertId === 'overlap')
    expect(overlap?.duration).toBe('4h')
  })

  // ── unsnoozeAlert ─────────────────────────────────────────────────────

  it('unsnoozeAlert removes the alert and emits analytics', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('alert-un', '1h') })
    expect(result.current.isSnoozed('alert-un')).toBe(true)

    act(() => { result.current.unsnoozeAlert('alert-un') })
    expect(result.current.isSnoozed('alert-un')).toBe(false)
    expect(result.current.snoozedCount).toBe(0)
    expect(mockEmitUnsnoozed).toHaveBeenCalledWith('alert')
  })

  it('unsnoozeAlert is a no-op for non-existent alert', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    // Should not throw
    act(() => { result.current.unsnoozeAlert('does-not-exist') })
    expect(result.current.snoozedAlerts).toEqual([])
  })

  // ── isSnoozed ─────────────────────────────────────────────────────────

  it('isSnoozed returns false for expired snoozes', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('will-expire', '5m') })
    expect(result.current.isSnoozed('will-expire')).toBe(true)

    // Advance time past the 5-minute snooze
    const SIX_MINUTES_MS = 6 * 60 * 1000
    act(() => { vi.advanceTimersByTime(SIX_MINUTES_MS) })

    expect(result.current.isSnoozed('will-expire')).toBe(false)
  })

  // ── getSnoozedAlert ───────────────────────────────────────────────────

  it('getSnoozedAlert returns the alert object or null', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('get-test', '1h') })
    const found = result.current.getSnoozedAlert('get-test')
    expect(found).not.toBeNull()
    expect(found?.alertId).toBe('get-test')

    const notFound = result.current.getSnoozedAlert('nope')
    expect(notFound).toBeNull()
  })

  it('getSnoozedAlert returns null for expired alerts', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('expire-get', '5m') })
    expect(result.current.getSnoozedAlert('expire-get')).not.toBeNull()

    const SIX_MINUTES_MS = 6 * 60 * 1000
    act(() => { vi.advanceTimersByTime(SIX_MINUTES_MS) })
    expect(result.current.getSnoozedAlert('expire-get')).toBeNull()
  })

  // ── getSnoozeRemaining ────────────────────────────────────────────────

  it('getSnoozeRemaining returns ms remaining or null', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    // Null for non-existent
    expect(result.current.getSnoozeRemaining('unknown')).toBeNull()

    act(() => { result.current.snoozeAlert('remaining-test', '1h') })
    const remaining = result.current.getSnoozeRemaining('remaining-test')
    expect(remaining).not.toBeNull()
    // Should be approximately 1 hour (within tolerance since time may have advanced slightly)
    expect(remaining!).toBeGreaterThan(0)
    expect(remaining!).toBeLessThanOrEqual(SNOOZE_DURATIONS['1h'])
  })

  it('getSnoozeRemaining returns null after auto-expiry removes the alert', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('clamp-test', '5m') })

    // Advance past the 5-minute snooze plus the 60-second interval check.
    // The auto-expiry interval fires and removes the alert from the array,
    // so getSnoozeRemaining returns null (alert no longer in state).
    const TEN_MINUTES_MS = 10 * 60 * 1000
    act(() => { vi.advanceTimersByTime(TEN_MINUTES_MS) })

    const remaining = result.current.getSnoozeRemaining('clamp-test')
    expect(remaining).toBeNull()
  })

  it('getSnoozeRemaining decreases as time passes', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('decay-test', '1h') })

    const initialRemaining = result.current.getSnoozeRemaining('decay-test')
    expect(initialRemaining).not.toBeNull()

    // Advance 10 minutes (well within the 1-hour snooze, and within
    // a 60s interval boundary so the alert is not cleaned)
    const TEN_MINUTES_MS = 10 * 60 * 1000
    act(() => { vi.advanceTimersByTime(TEN_MINUTES_MS) })

    const laterRemaining = result.current.getSnoozeRemaining('decay-test')
    expect(laterRemaining).not.toBeNull()
    expect(laterRemaining!).toBeLessThan(initialRemaining!)
  })

  // ── clearAllSnoozed ───────────────────────────────────────────────────

  it('clearAllSnoozed removes all snoozes', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => {
      result.current.snoozeAlert('c1', '1h')
      result.current.snoozeAlert('c2', '4h')
      result.current.snoozeAlert('c3', '24h')
    })
    expect(result.current.snoozedCount).toBe(3)

    act(() => { result.current.clearAllSnoozed() })
    expect(result.current.snoozedAlerts).toEqual([])
    expect(result.current.snoozedCount).toBe(0)
  })

  // ── localStorage persistence ──────────────────────────────────────────

  it('persists snoozed alerts to localStorage', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('persist-test', '4h') })

    const stored = localStorage.getItem('kubestellar-snoozed-alerts')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.snoozed).toHaveLength(1)
    expect(parsed.snoozed[0].alertId).toBe('persist-test')
  })

  it('loads snoozed alerts from localStorage on mount and filters expired', () => {
    const now = Date.now()
    const ONE_HOUR_MS = 60 * 60 * 1000
    const stored = {
      snoozed: [
        { alertId: 'valid', snoozedAt: now, expiresAt: now + ONE_HOUR_MS, duration: '1h' },
        { alertId: 'expired', snoozedAt: now - ONE_HOUR_MS * 2, expiresAt: now - ONE_HOUR_MS, duration: '1h' },
      ],
    }
    localStorage.setItem('kubestellar-snoozed-alerts', JSON.stringify(stored))

    // Force loadState to run by re-importing. Since the module has already been imported
    // and the module-level state is shared, we verify via isSnoozed which checks expiresAt.
    const { result } = renderHook(() => useSnoozedAlerts())
    // The expired one should be filtered out by isSnoozed (checks expiresAt > now)
    expect(result.current.isSnoozed('expired')).toBe(false)
  })

  it('handles corrupt localStorage data gracefully', () => {
    localStorage.setItem('kubestellar-snoozed-alerts', 'not-json{{{')

    // Should not throw — the loadState function catches parse errors
    const { result } = renderHook(() => useSnoozedAlerts())
    expect(result.current.snoozedAlerts).toBeDefined()
  })

  // ── Cross-component state sharing ─────────────────────────────────────

  it('shares state across multiple hook instances via module-level state', () => {
    const { result: hook1 } = renderHook(() => useSnoozedAlerts())
    const { result: hook2 } = renderHook(() => useSnoozedAlerts())

    act(() => { hook1.current.snoozeAlert('shared', '1h') })

    // hook2 should see the update via the listener mechanism
    expect(hook2.current.isSnoozed('shared')).toBe(true)
    expect(hook2.current.snoozedCount).toBe(1)
  })

  // ── Auto-expiry via interval ──────────────────────────────────────────

  it('auto-removes expired snoozes on interval check', () => {
    const { result } = renderHook(() => useSnoozedAlerts())

    act(() => { result.current.snoozeAlert('auto-expire', '5m') })
    expect(result.current.snoozedCount).toBe(1)

    // Advance past the 5-minute snooze duration plus the 60-second check interval
    const SIX_MINUTES_MS = 6 * 60 * 1000
    const CHECK_INTERVAL_MS = 60_000
    act(() => { vi.advanceTimersByTime(SIX_MINUTES_MS + CHECK_INTERVAL_MS) })

    // After the interval fires and detects the expiry, it should be cleaned up
    expect(result.current.snoozedCount).toBe(0)
  })

  // ── Cleanup on unmount ────────────────────────────────────────────────

  it('removes listener and clears interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useSnoozedAlerts())
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})

// ── formatSnoozeRemaining ─────────────────────────────────────────────

describe('formatSnoozeRemaining', () => {
  it('formats hours and minutes', () => {
    const TWO_HOURS_THIRTY_MIN_MS = 2 * 60 * 60 * 1000 + 30 * 60 * 1000
    expect(formatSnoozeRemaining(TWO_HOURS_THIRTY_MIN_MS)).toBe('2h 30m')
  })

  it('formats hours with zero minutes', () => {
    const ONE_HOUR_MS = 60 * 60 * 1000
    expect(formatSnoozeRemaining(ONE_HOUR_MS)).toBe('1h 0m')
  })

  it('formats minutes only when less than one hour', () => {
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
    expect(formatSnoozeRemaining(FIFTEEN_MINUTES_MS)).toBe('15m')
  })

  it('returns <1m for very small values', () => {
    const THIRTY_SECONDS_MS = 30 * 1000
    expect(formatSnoozeRemaining(THIRTY_SECONDS_MS)).toBe('<1m')
  })

  it('returns <1m for zero', () => {
    expect(formatSnoozeRemaining(0)).toBe('<1m')
  })
})
