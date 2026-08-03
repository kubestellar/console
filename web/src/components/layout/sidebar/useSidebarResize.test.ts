import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { useSidebarResize } from './useSidebarResize'

const DEFAULT = 240
const MIN = 160
const MAX = 400
const STEP = 8

interface Overrides {
  sidebarWidth?: number
  widthOverride?: number
  configWidth?: number
  setWidth?: (w: number) => void
}

function makeParams(overrides: Overrides = {}) {
  return {
    sidebarWidth: overrides.sidebarWidth ?? DEFAULT,
    widthOverride: overrides.widthOverride,
    configWidth: overrides.configWidth,
    setWidth: overrides.setWidth ?? vi.fn(),
    SIDEBAR_DEFAULT_WIDTH_PX: DEFAULT,
    SIDEBAR_MIN_WIDTH_PX: MIN,
    SIDEBAR_MAX_WIDTH_PX: MAX,
    SIDEBAR_RESIZE_STEP_PX: STEP,
  }
}

function mouseEvent(clientX: number): React.MouseEvent {
  return {
    clientX,
    preventDefault: vi.fn(),
  } as unknown as React.MouseEvent
}

function keyEvent(key: string): React.KeyboardEvent<HTMLDivElement> {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLDivElement>
}

function dispatchMove(clientX: number) {
  const evt = new MouseEvent('mousemove', { clientX })
  document.dispatchEvent(evt)
}

function dispatchUp() {
  document.dispatchEvent(new MouseEvent('mouseup'))
}

describe('useSidebarResize', () => {
  beforeEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  describe('initial state', () => {
    it('isResizing starts false', () => {
      const { result } = renderHook(() => useSidebarResize(makeParams()))
      expect(result.current.isResizing).toBe(false)
    })
  })

  describe('handleResizeStart (mouse drag)', () => {
    it('sets isResizing=true and applies body cursor/userSelect styles', () => {
      const { result } = renderHook(() => useSidebarResize(makeParams()))
      act(() => { result.current.handleResizeStart(mouseEvent(100)) })
      expect(result.current.isResizing).toBe(true)
      expect(document.body.style.cursor).toBe('col-resize')
      expect(document.body.style.userSelect).toBe('none')
    })

    it('calls preventDefault on the start event', () => {
      const { result } = renderHook(() => useSidebarResize(makeParams()))
      const evt = mouseEvent(100)
      act(() => { result.current.handleResizeStart(evt) })
      expect(evt.preventDefault).toHaveBeenCalled()
    })

    it('computes new width as startWidth + (clientX - startX) using widthOverride', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ widthOverride: 220, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(100)) })
      act(() => { dispatchMove(140) })
      expect(setWidth).toHaveBeenLastCalledWith(260)
    })

    it('falls back to configWidth when widthOverride is undefined', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ configWidth: 200, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(50)) })
      act(() => { dispatchMove(90) })
      expect(setWidth).toHaveBeenLastCalledWith(240)
    })

    it('falls back to SIDEBAR_DEFAULT_WIDTH_PX when neither override nor config given', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() => useSidebarResize(makeParams({ setWidth })))
      act(() => { result.current.handleResizeStart(mouseEvent(0)) })
      act(() => { dispatchMove(10) })
      expect(setWidth).toHaveBeenLastCalledWith(DEFAULT + 10)
    })

    it('clamps width to SIDEBAR_MIN_WIDTH_PX on large negative drag', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ widthOverride: 200, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(500)) })
      act(() => { dispatchMove(0) })
      expect(setWidth).toHaveBeenLastCalledWith(MIN)
    })

    it('clamps width to SIDEBAR_MAX_WIDTH_PX on large positive drag', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ widthOverride: 300, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(0)) })
      act(() => { dispatchMove(9999) })
      expect(setWidth).toHaveBeenLastCalledWith(MAX)
    })

    it('mouseup ends resize: isResizing=false, styles cleared, further moves ignored', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ widthOverride: 220, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(100)) })
      act(() => { dispatchMove(120) }) // 240
      act(() => { dispatchUp() })
      expect(result.current.isResizing).toBe(false)
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
      setWidth.mockClear()
      act(() => { dispatchMove(200) })
      expect(setWidth).not.toHaveBeenCalled()
    })

    it('supports multiple consecutive drags', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ widthOverride: 200, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(100)) })
      act(() => { dispatchMove(150) }) // 250
      act(() => { dispatchUp() })
      act(() => { result.current.handleResizeStart(mouseEvent(0)) })
      act(() => { dispatchMove(20) }) // 220
      expect(setWidth).toHaveBeenLastCalledWith(220)
    })
  })

  describe('cleanup on unmount', () => {
    it('runs cleanup if a drag is active — listeners removed and styles cleared', () => {
      const setWidth = vi.fn()
      const { result, unmount } = renderHook(() =>
        useSidebarResize(makeParams({ widthOverride: 200, setWidth })),
      )
      act(() => { result.current.handleResizeStart(mouseEvent(100)) })
      unmount()
      expect(document.body.style.cursor).toBe('')
      expect(document.body.style.userSelect).toBe('')
      setWidth.mockClear()
      dispatchMove(500)
      expect(setWidth).not.toHaveBeenCalled()
    })

    it('is a no-op when no drag is active', () => {
      const { unmount } = renderHook(() => useSidebarResize(makeParams()))
      expect(() => unmount()).not.toThrow()
    })
  })

  describe('handleResizeKeyDown', () => {
    it('ArrowLeft decreases width by step and calls preventDefault', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ sidebarWidth: 250, setWidth })),
      )
      const evt = keyEvent('ArrowLeft')
      act(() => { result.current.handleResizeKeyDown(evt) })
      expect(setWidth).toHaveBeenCalledWith(250 - STEP)
      expect(evt.preventDefault).toHaveBeenCalled()
    })

    it('ArrowRight increases width by step', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ sidebarWidth: 250, setWidth })),
      )
      act(() => { result.current.handleResizeKeyDown(keyEvent('ArrowRight')) })
      expect(setWidth).toHaveBeenCalledWith(250 + STEP)
    })

    it('clamps to MIN when decreasing below limit', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ sidebarWidth: MIN, setWidth })),
      )
      act(() => { result.current.handleResizeKeyDown(keyEvent('ArrowLeft')) })
      expect(setWidth).toHaveBeenCalledWith(MIN)
    })

    it('clamps to MAX when increasing above limit', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ sidebarWidth: MAX, setWidth })),
      )
      act(() => { result.current.handleResizeKeyDown(keyEvent('ArrowRight')) })
      expect(setWidth).toHaveBeenCalledWith(MAX)
    })

    it('ignores other keys (Enter, ArrowUp, Space) — no setWidth, no preventDefault', () => {
      const setWidth = vi.fn()
      const { result } = renderHook(() =>
        useSidebarResize(makeParams({ sidebarWidth: 250, setWidth })),
      )
      for (const key of ['Enter', 'ArrowUp', 'ArrowDown', ' ', 'a']) {
        const evt = keyEvent(key)
        act(() => { result.current.handleResizeKeyDown(evt) })
        expect(evt.preventDefault).not.toHaveBeenCalled()
      }
      expect(setWidth).not.toHaveBeenCalled()
    })
  })
})
