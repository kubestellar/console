import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAccessibility } from './useAccessibility'

const STORAGE_KEY = 'accessibility-settings'

describe('useAccessibility', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    document.documentElement.className = ''
  })

  it('returns defaults when nothing is stored', () => {
    const { result } = renderHook(() => useAccessibility())
    expect(result.current.colorBlindMode).toBe(false)
    expect(result.current.reduceMotion).toBe(false)
    expect(result.current.highContrast).toBe(false)
  })

  it('hydrates from persisted settings and merges over defaults', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ colorBlindMode: true, highContrast: true }),
    )
    const { result } = renderHook(() => useAccessibility())
    expect(result.current.colorBlindMode).toBe(true)
    expect(result.current.reduceMotion).toBe(false)
    expect(result.current.highContrast).toBe(true)
  })

  it('applies color-blind-mode class on documentElement when enabled', () => {
    const { result } = renderHook(() => useAccessibility())
    expect(document.documentElement.classList.contains('color-blind-mode')).toBe(false)

    act(() => {
      result.current.setColorBlindMode(true)
    })
    expect(document.documentElement.classList.contains('color-blind-mode')).toBe(true)

    act(() => {
      result.current.setColorBlindMode(false)
    })
    expect(document.documentElement.classList.contains('color-blind-mode')).toBe(false)
  })

  it('applies reduce-motion class on documentElement when enabled', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => {
      result.current.setReduceMotion(true)
    })
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true)
  })

  it('applies high-contrast class on documentElement when enabled', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => {
      result.current.setHighContrast(true)
    })
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)
  })

  it('persists individual setters to localStorage', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => {
      result.current.setColorBlindMode(true)
    })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(stored.colorBlindMode).toBe(true)
  })

  it('updateSettings merges partial updates and preserves untouched fields', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => {
      result.current.setColorBlindMode(true)
    })
    act(() => {
      result.current.updateSettings({ highContrast: true })
    })
    expect(result.current.colorBlindMode).toBe(true)
    expect(result.current.highContrast).toBe(true)
    expect(result.current.reduceMotion).toBe(false)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(stored).toEqual({
      colorBlindMode: true,
      reduceMotion: false,
      highContrast: true,
    })
  })

  it('responds to cross-tab storage events for the accessibility key', () => {
    const { result } = renderHook(() => useAccessibility())
    expect(result.current.colorBlindMode).toBe(false)

    act(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ colorBlindMode: true, reduceMotion: false, highContrast: false }),
      )
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    })
    expect(result.current.colorBlindMode).toBe(true)
  })

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ colorBlindMode: true, reduceMotion: false, highContrast: false }),
      )
      window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }))
    })
    // Not re-read because key doesn't match
    expect(result.current.colorBlindMode).toBe(false)
  })

  it('removes storage listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useAccessibility())
    unmount()
    expect(
      removeSpy.mock.calls.some(([type]) => type === 'storage'),
    ).toBe(true)
    removeSpy.mockRestore()
  })
})
