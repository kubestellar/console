import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  POLL_INTERVAL_SLOW_MS: 60000,
} })

vi.mock('../../lib/analytics', () => ({
  emitSnoozed: vi.fn(),
  emitUnsnoozed: vi.fn(),
}))

import { useSnoozedAlerts, SNOOZE_DURATIONS } from '../useSnoozedAlerts'

describe('useSnoozedAlerts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('starts with empty snoozed list', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    expect(result.current.snoozedAlerts).toEqual([])
  })

  it('snoozeAlert adds an alert with expiry', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    act(() => { result.current.snoozeAlert('alert-1', '1h') })
    expect(result.current.snoozedAlerts).toHaveLength(1)
    expect(result.current.snoozedAlerts[0].alertId).toBe('alert-1')
    expect(result.current.snoozedAlerts[0].duration).toBe('1h')
  })

  it('isSnoozed returns true for snoozed alerts', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    act(() => { result.current.snoozeAlert('alert-2', '5m') })
    expect(result.current.isSnoozed('alert-2')).toBe(true)
    expect(result.current.isSnoozed('alert-nonexistent')).toBe(false)
  })

  it('unsnoozeAlert removes the snooze', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    act(() => { result.current.snoozeAlert('alert-3', '15m') })
    expect(result.current.isSnoozed('alert-3')).toBe(true)
    act(() => { result.current.unsnoozeAlert('alert-3') })
    expect(result.current.isSnoozed('alert-3')).toBe(false)
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useSnoozedAlerts())
    act(() => { result.current.snoozeAlert('alert-4', '4h') })
    const stored = localStorage.getItem('kubestellar-snoozed-alerts')
    expect(stored).not.toBeNull()
  })

  it('SNOOZE_DURATIONS exports expected keys', () => {
    expect(SNOOZE_DURATIONS).toHaveProperty('5m')
    expect(SNOOZE_DURATIONS).toHaveProperty('15m')
    expect(SNOOZE_DURATIONS).toHaveProperty('1h')
    expect(SNOOZE_DURATIONS).toHaveProperty('4h')
    expect(SNOOZE_DURATIONS).toHaveProperty('24h')
  })
})
