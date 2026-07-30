/**
 * Tests for useMobile hook.
 *
 * Validates mobile breakpoint detection using matchMedia.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMobile, useIsTablet } from '../useMobile'

describe('useMobile', () => {
  let changeHandler: ((e: MediaQueryListEvent) => void) | null = null
  let currentMatches = false

  beforeEach(() => {
    changeHandler = null
    currentMatches = false

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() { return currentMatches },
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') changeHandler = handler
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    changeHandler = null
  })

  it('should return isMobile=false on desktop viewport', () => {
    currentMatches = false
    const { result } = renderHook(() => useMobile())
    expect(result.current.isMobile).toBe(false)
  })

  it('should return isMobile=true on mobile viewport', () => {
    currentMatches = true
    const { result } = renderHook(() => useMobile())
    expect(result.current.isMobile).toBe(true)
  })

  it('should use max-width 767px media query (Tailwind md breakpoint)', () => {
    renderHook(() => useMobile())
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
  })

  it('should update when matchMedia change event fires', () => {
    currentMatches = false
    const { result } = renderHook(() => useMobile())
    expect(result.current.isMobile).toBe(false)

    // Simulate viewport resize to mobile
    act(() => {
      currentMatches = true
      if (changeHandler) {
        changeHandler({ matches: true } as MediaQueryListEvent)
      }
    })
    expect(result.current.isMobile).toBe(true)
  })

  it('should update back to desktop when viewport widens', () => {
    currentMatches = true
    const { result } = renderHook(() => useMobile())
    expect(result.current.isMobile).toBe(true)

    // Simulate viewport resize to desktop
    act(() => {
      currentMatches = false
      if (changeHandler) {
        changeHandler({ matches: false } as MediaQueryListEvent)
      }
    })
    expect(result.current.isMobile).toBe(false)
  })

  it('should remove event listener on unmount', () => {
    const removeEventListenerMock = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn(),
      })),
    })

    const { unmount } = renderHook(() => useMobile())
    unmount()

    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })
})

describe('useIsTablet', () => {
  let tabletChangeHandler: ((e: MediaQueryListEvent) => void) | null = null
  let tabletMatches = false

  beforeEach(() => {
    tabletChangeHandler = null
    tabletMatches = false

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() { return tabletMatches },
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') tabletChangeHandler = handler
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    tabletChangeHandler = null
  })

  it('returns false when viewport is below tablet range (mobile)', () => {
    tabletMatches = false
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(false)
  })

  it('returns true when viewport is in tablet range', () => {
    tabletMatches = true
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(true)
  })

  it('uses correct min-width 768px / max-width 1023px media query', () => {
    renderHook(() => useIsTablet())
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px) and (max-width: 1023px)')
  })

  it('updates when matchMedia change event fires (desktop → tablet)', () => {
    tabletMatches = false
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(false)

    act(() => {
      tabletMatches = true
      if (tabletChangeHandler) {
        tabletChangeHandler({ matches: true } as MediaQueryListEvent)
      }
    })
    expect(result.current).toBe(true)
  })

  it('updates back to false when viewport leaves tablet range', () => {
    tabletMatches = true
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(true)

    act(() => {
      tabletMatches = false
      if (tabletChangeHandler) {
        tabletChangeHandler({ matches: false } as MediaQueryListEvent)
      }
    })
    expect(result.current).toBe(false)
  })

  it('removes event listener on unmount', () => {
    const removeEventListenerMock = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn(),
      })),
    })

    const { unmount } = renderHook(() => useIsTablet())
    unmount()

    expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
