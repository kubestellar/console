import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// ── Mock the toast so we can assert the failure messages ───────────────────
const mockShowToast = vi.hoisted(() => vi.fn())
vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import { useInsightActions } from './useInsightActions'

const ACK_KEY = 'acknowledged-insights'
const DISMISS_KEY = 'dismissed-insights-session'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockShowToast.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useInsightActions / initial state', () => {
  it('starts empty when no storage is set', () => {
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.acknowledgedCount).toBe(0)
    expect(result.current.isAcknowledged('foo')).toBe(false)
    expect(result.current.isDismissed('bar')).toBe(false)
  })

  it('hydrates acknowledgedIds from localStorage', () => {
    localStorage.setItem(ACK_KEY, JSON.stringify(['a', 'b', 'c']))
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.acknowledgedCount).toBe(3)
    expect(result.current.isAcknowledged('a')).toBe(true)
    expect(result.current.isAcknowledged('b')).toBe(true)
    expect(result.current.isAcknowledged('c')).toBe(true)
    expect(result.current.isAcknowledged('d')).toBe(false)
  })

  it('hydrates dismissedIds from sessionStorage (not localStorage)', () => {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(['x']))
    localStorage.setItem(DISMISS_KEY, JSON.stringify(['leaked']))
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.isDismissed('x')).toBe(true)
    expect(result.current.isDismissed('leaked')).toBe(false)
  })

  it('filters out non-string values from the persisted array', () => {
    localStorage.setItem(ACK_KEY, JSON.stringify(['a', 42, null, 'b', { obj: 1 }]))
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.acknowledgedCount).toBe(2)
    expect(result.current.isAcknowledged('a')).toBe(true)
    expect(result.current.isAcknowledged('b')).toBe(true)
  })
})

describe('useInsightActions / malformed persisted data', () => {
  it('treats non-array JSON as empty and warns to console', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(ACK_KEY, JSON.stringify({ notAnArray: true }))
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.acknowledgedCount).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(ACK_KEY))
    // Non-array is not a load *failure* — no toast is shown for this case.
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('treats invalid JSON as empty AND shows a load-failure toast', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(ACK_KEY, '{not json')
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.acknowledgedCount).toBe(0)
    expect(errSpy).toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith('insights.failedToLoadPreferences', 'warning')
  })

  it('load-failure toast fires exactly once even if both storages are malformed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(ACK_KEY, '{broken')
    sessionStorage.setItem(DISMISS_KEY, '{also broken')
    renderHook(() => useInsightActions())
    expect(mockShowToast).toHaveBeenCalledTimes(1)
    expect(mockShowToast).toHaveBeenCalledWith('insights.failedToLoadPreferences', 'warning')
  })
})

describe('useInsightActions / acknowledgeInsight', () => {
  it('marks the id as acknowledged and increments the count', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.acknowledgeInsight('id-1') })
    expect(result.current.isAcknowledged('id-1')).toBe(true)
    expect(result.current.acknowledgedCount).toBe(1)
  })

  it('persists acknowledged ids to localStorage', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.acknowledgeInsight('id-1') })
    act(() => { result.current.acknowledgeInsight('id-2') })
    const stored = JSON.parse(localStorage.getItem(ACK_KEY) ?? '[]') as string[]
    expect(stored.sort()).toEqual(['id-1', 'id-2'])
  })

  it('is idempotent — acknowledging the same id twice does not duplicate', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.acknowledgeInsight('dup') })
    act(() => { result.current.acknowledgeInsight('dup') })
    expect(result.current.acknowledgedCount).toBe(1)
    const stored = JSON.parse(localStorage.getItem(ACK_KEY) ?? '[]') as string[]
    expect(stored).toEqual(['dup'])
  })

  it('shows an error toast when localStorage.setItem throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.acknowledgeInsight('id-1') })
    expect(mockShowToast).toHaveBeenCalledWith('insights.failedToSave', 'error')
    // State still updates even though persistence failed
    expect(result.current.isAcknowledged('id-1')).toBe(true)
    setItemSpy.mockRestore()
  })

  it('does not touch sessionStorage or the dismissed set', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.acknowledgeInsight('id-1') })
    expect(sessionStorage.getItem(DISMISS_KEY)).toBeNull()
    expect(result.current.isDismissed('id-1')).toBe(false)
  })
})

describe('useInsightActions / dismissInsight', () => {
  it('marks the id as dismissed and persists to sessionStorage', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.dismissInsight('id-1') })
    expect(result.current.isDismissed('id-1')).toBe(true)
    const stored = JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[]
    expect(stored).toEqual(['id-1'])
  })

  it('does not touch localStorage or the acknowledged set', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.dismissInsight('id-1') })
    expect(localStorage.getItem(ACK_KEY)).toBeNull()
    expect(result.current.acknowledgedCount).toBe(0)
    expect(result.current.isAcknowledged('id-1')).toBe(false)
  })

  it('is idempotent — dismissing the same id twice does not duplicate', () => {
    const { result } = renderHook(() => useInsightActions())
    act(() => { result.current.dismissInsight('dup') })
    act(() => { result.current.dismissInsight('dup') })
    const stored = JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[]
    expect(stored).toEqual(['dup'])
  })
})

describe('useInsightActions / acknowledgedCount', () => {
  it('reflects the current Set size across mixed operations', () => {
    const { result } = renderHook(() => useInsightActions())
    expect(result.current.acknowledgedCount).toBe(0)
    act(() => { result.current.acknowledgeInsight('a') })
    expect(result.current.acknowledgedCount).toBe(1)
    act(() => { result.current.acknowledgeInsight('b') })
    expect(result.current.acknowledgedCount).toBe(2)
    // Dismiss does not change ack count
    act(() => { result.current.dismissInsight('a') })
    expect(result.current.acknowledgedCount).toBe(2)
  })
})
