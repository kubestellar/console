import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarPin } from './useSidebarPin'

const KEY = 'sidebar-left-pinned'
const AUTO_HIDE_MS = 2000

interface Args {
  isCollapsed?: boolean
  isMobile?: boolean
  collapsed?: boolean
  setCollapsed?: (v: boolean) => void
}

function args(overrides: Args = {}) {
  return {
    isCollapsed: overrides.isCollapsed ?? false,
    isMobile: overrides.isMobile ?? false,
    collapsed: overrides.collapsed ?? false,
    setCollapsed: overrides.setCollapsed ?? vi.fn(),
  }
}

describe('useSidebarPin', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initial isPinned', () => {
    it('defaults to true when localStorage is empty', () => {
      const { result } = renderHook(() => useSidebarPin(args()))
      expect(result.current.isPinned).toBe(true)
    })

    it('is false when localStorage value is exactly the string "false"', () => {
      localStorage.setItem(KEY, 'false')
      const { result } = renderHook(() => useSidebarPin(args()))
      expect(result.current.isPinned).toBe(false)
    })

    it('is true for any non-"false" stored value (e.g. "true")', () => {
      localStorage.setItem(KEY, 'true')
      const { result } = renderHook(() => useSidebarPin(args()))
      expect(result.current.isPinned).toBe(true)
    })

    it('is true when localStorage.getItem throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })
      const { result } = renderHook(() => useSidebarPin(args()))
      expect(result.current.isPinned).toBe(true)
    })
  })

  describe('handleSidebarMouseEnter', () => {
    it('expands (setCollapsed(false)) when unpinned, collapsed, and not mobile', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ isCollapsed: true, setCollapsed })))
      act(() => { result.current.handleSidebarMouseEnter() })
      expect(setCollapsed).toHaveBeenCalledWith(false)
    })

    it('does not expand when pinned', () => {
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ isCollapsed: true, setCollapsed })))
      act(() => { result.current.handleSidebarMouseEnter() })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('does not expand when already expanded (isCollapsed=false)', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ isCollapsed: false, setCollapsed })))
      act(() => { result.current.handleSidebarMouseEnter() })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('does not expand on mobile even when unpinned+collapsed', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ isCollapsed: true, isMobile: true, setCollapsed })))
      act(() => { result.current.handleSidebarMouseEnter() })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('cancels a pending auto-hide timer', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      act(() => { result.current.handleSidebarMouseEnter() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS + 100) })
      // setCollapsed(true) should NOT have fired because timer was cleared
      expect(setCollapsed).not.toHaveBeenCalledWith(true)
    })
  })

  describe('handleSidebarMouseLeave', () => {
    it('schedules setCollapsed(true) after AUTO_HIDE_MS when unpinned and not mobile', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      expect(setCollapsed).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS) })
      expect(setCollapsed).toHaveBeenCalledWith(true)
    })

    it('does nothing when pinned', () => {
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS + 100) })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('does nothing on mobile', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ isMobile: true, setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS + 100) })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('replaces a previously scheduled timer (only latest fires)', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS - 500) })
      act(() => { result.current.handleSidebarMouseLeave() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS - 500) })
      expect(setCollapsed).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(500) })
      expect(setCollapsed).toHaveBeenCalledTimes(1)
    })
  })

  describe('toggleSidebarPin', () => {
    it('flips isPinned true -> false and persists "false"', () => {
      const { result } = renderHook(() => useSidebarPin(args()))
      act(() => { result.current.toggleSidebarPin() })
      expect(result.current.isPinned).toBe(false)
      expect(localStorage.getItem(KEY)).toBe('false')
    })

    it('flips isPinned false -> true and persists "true"', () => {
      localStorage.setItem(KEY, 'false')
      const { result } = renderHook(() => useSidebarPin(args()))
      act(() => { result.current.toggleSidebarPin() })
      expect(result.current.isPinned).toBe(true)
      expect(localStorage.getItem(KEY)).toBe('true')
    })

    it('when pinning while collapsed, expands the sidebar', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ collapsed: true, setCollapsed })))
      act(() => { result.current.toggleSidebarPin() })
      expect(setCollapsed).toHaveBeenCalledWith(false)
    })

    it('when pinning while already expanded, does not call setCollapsed', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ collapsed: false, setCollapsed })))
      act(() => { result.current.toggleSidebarPin() })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('when pinning, clears any pending auto-hide timer', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      act(() => { result.current.toggleSidebarPin() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS + 100) })
      expect(setCollapsed).not.toHaveBeenCalledWith(true)
    })

    it('when unpinning while expanded, schedules auto-hide', () => {
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ collapsed: false, setCollapsed })))
      act(() => { result.current.toggleSidebarPin() })
      expect(setCollapsed).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS) })
      expect(setCollapsed).toHaveBeenCalledWith(true)
    })

    it('when unpinning while collapsed, does not schedule auto-hide', () => {
      const setCollapsed = vi.fn()
      const { result } = renderHook(() => useSidebarPin(args({ collapsed: true, setCollapsed })))
      act(() => { result.current.toggleSidebarPin() })
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS + 100) })
      expect(setCollapsed).not.toHaveBeenCalled()
    })

    it('silently ignores localStorage.setItem exceptions but still flips state', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const { result } = renderHook(() => useSidebarPin(args()))
      act(() => { result.current.toggleSidebarPin() })
      expect(result.current.isPinned).toBe(false)
      spy.mockRestore()
    })
  })

  describe('cleanup on unmount', () => {
    it('clears any pending auto-hide timer', () => {
      localStorage.setItem(KEY, 'false')
      const setCollapsed = vi.fn()
      const { result, unmount } = renderHook(() => useSidebarPin(args({ setCollapsed })))
      act(() => { result.current.handleSidebarMouseLeave() })
      unmount()
      act(() => { vi.advanceTimersByTime(AUTO_HIDE_MS + 100) })
      expect(setCollapsed).not.toHaveBeenCalled()
    })
  })
})
