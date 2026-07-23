import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  clampSidebarWidth,
  useSidebarResize,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_RESIZE_STEP_PX,
} from '../useSidebarResize'

describe('clampSidebarWidth (pure)', () => {
  it('returns value unchanged when within bounds', () => {
    expect(clampSidebarWidth(256)).toBe(256)
  })

  it('clamps to minimum when too small', () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH_PX)
    expect(clampSidebarWidth(-100)).toBe(SIDEBAR_MIN_WIDTH_PX)
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH_PX - 1)).toBe(SIDEBAR_MIN_WIDTH_PX)
  })

  it('clamps to maximum when too large', () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH_PX)
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH_PX + 1)).toBe(SIDEBAR_MAX_WIDTH_PX)
  })

  it('accepts exact boundary values', () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH_PX)).toBe(SIDEBAR_MIN_WIDTH_PX)
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH_PX)).toBe(SIDEBAR_MAX_WIDTH_PX)
  })
})

describe('useSidebarResize', () => {
  it('initialises width from the argument', () => {
    const { result } = renderHook(() => useSidebarResize(300))
    expect(result.current.width).toBe(300)
  })

  it('clamps initial width below minimum', () => {
    const { result } = renderHook(() => useSidebarResize(10))
    expect(result.current.width).toBe(SIDEBAR_MIN_WIDTH_PX)
  })

  it('clamps initial width above maximum', () => {
    const { result } = renderHook(() => useSidebarResize(9999))
    expect(result.current.width).toBe(SIDEBAR_MAX_WIDTH_PX)
  })

  it('starts with isResizing=false', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    expect(result.current.isResizing).toBe(false)
  })

  it('setWidth clamps to minimum', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    act(() => { result.current.setWidth(0) })
    expect(result.current.width).toBe(SIDEBAR_MIN_WIDTH_PX)
  })

  it('setWidth clamps to maximum', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    act(() => { result.current.setWidth(9999) })
    expect(result.current.width).toBe(SIDEBAR_MAX_WIDTH_PX)
  })

  it('setWidth accepts valid in-range value', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    act(() => { result.current.setWidth(320) })
    expect(result.current.width).toBe(320)
  })

  it('handleResizeKeyDown ignores non-arrow keys', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    act(() => {
      result.current.handleResizeKeyDown({ key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.width).toBe(256)
  })

  it('handleResizeKeyDown increases width on ArrowRight', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    act(() => {
      result.current.handleResizeKeyDown({ key: 'ArrowRight', preventDefault: () => {} } as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.width).toBe(256 + SIDEBAR_RESIZE_STEP_PX)
  })

  it('handleResizeKeyDown decreases width on ArrowLeft', () => {
    const { result } = renderHook(() => useSidebarResize(256))
    act(() => {
      result.current.handleResizeKeyDown({ key: 'ArrowLeft', preventDefault: () => {} } as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.width).toBe(256 - SIDEBAR_RESIZE_STEP_PX)
  })

  it('handleResizeKeyDown clamps to minimum on ArrowLeft at min', () => {
    const { result } = renderHook(() => useSidebarResize(SIDEBAR_MIN_WIDTH_PX))
    act(() => {
      result.current.handleResizeKeyDown({ key: 'ArrowLeft', preventDefault: () => {} } as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.width).toBe(SIDEBAR_MIN_WIDTH_PX)
  })

  it('handleResizeKeyDown clamps to maximum on ArrowRight at max', () => {
    const { result } = renderHook(() => useSidebarResize(SIDEBAR_MAX_WIDTH_PX))
    act(() => {
      result.current.handleResizeKeyDown({ key: 'ArrowRight', preventDefault: () => {} } as React.KeyboardEvent<HTMLDivElement>)
    })
    expect(result.current.width).toBe(SIDEBAR_MAX_WIDTH_PX)
  })
})
