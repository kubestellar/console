import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarPin } from '../useSidebarPin'

describe('useSidebarPin', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to pinned when localStorage is empty', () => {
    const { result } = renderHook(() => useSidebarPin())
    expect(result.current.pinned).toBe(true)
  })

  it('reads initial pinned=true from localStorage', () => {
    localStorage.setItem('sidebar-left-pinned', 'true')
    const { result } = renderHook(() => useSidebarPin())
    expect(result.current.pinned).toBe(true)
  })

  it('reads initial pinned=false from localStorage', () => {
    localStorage.setItem('sidebar-left-pinned', 'false')
    const { result } = renderHook(() => useSidebarPin())
    expect(result.current.pinned).toBe(false)
  })

  it('toggles from pinned to unpinned', () => {
    const { result } = renderHook(() => useSidebarPin())
    expect(result.current.pinned).toBe(true)
    act(() => { result.current.togglePinned() })
    expect(result.current.pinned).toBe(false)
  })

  it('toggles from unpinned to pinned', () => {
    localStorage.setItem('sidebar-left-pinned', 'false')
    const { result } = renderHook(() => useSidebarPin())
    act(() => { result.current.togglePinned() })
    expect(result.current.pinned).toBe(true)
  })

  it('persists pinned state to localStorage on toggle', () => {
    const { result } = renderHook(() => useSidebarPin())
    act(() => { result.current.togglePinned() })
    expect(localStorage.getItem('sidebar-left-pinned')).toBe('false')
    act(() => { result.current.togglePinned() })
    expect(localStorage.getItem('sidebar-left-pinned')).toBe('true')
  })

  it('persists state across remounts', () => {
    const { result, unmount } = renderHook(() => useSidebarPin())
    act(() => { result.current.togglePinned() })
    unmount()
    const { result: next } = renderHook(() => useSidebarPin())
    expect(next.current.pinned).toBe(false)
  })
})
