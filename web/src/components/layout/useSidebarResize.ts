import { useState, useCallback, useRef, useEffect } from 'react'

export const SIDEBAR_MIN_WIDTH_PX = 180
export const SIDEBAR_MAX_WIDTH_PX = 480
export const SIDEBAR_RESIZE_STEP_PX = 16

/**
 * Clamp a proposed sidebar width to the allowed [min, max] range.
 * Exported as a pure function so it can be unit-tested without DOM or React.
 */
export function clampSidebarWidth(w: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, w))
}

export interface UseSidebarResizeResult {
  /** Current width in px (clamped to [SIDEBAR_MIN_WIDTH_PX, SIDEBAR_MAX_WIDTH_PX]) */
  width: number
  /** True while a mouse-drag resize is in progress */
  isResizing: boolean
  /** Programmatically set the width (will be clamped) */
  setWidth: (w: number) => void
  /** Mouse-down handler to attach to the resize handle element */
  handleResizeStart: (e: React.MouseEvent) => void
  /** Keyboard handler for ArrowLeft / ArrowRight on the resize handle */
  handleResizeKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

/**
 * Manages sidebar width state with mouse-drag and keyboard resize support.
 * Width is always clamped to [SIDEBAR_MIN_WIDTH_PX, SIDEBAR_MAX_WIDTH_PX].
 */
export function useSidebarResize(initialWidth: number): UseSidebarResizeResult {
  const [width, setWidthRaw] = useState<number>(() => clampSidebarWidth(initialWidth))
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  // Clean up stale event listeners if the component unmounts mid-drag.
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const setWidth = useCallback((w: number) => {
    setWidthRaw(clampSidebarWidth(w))
  }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setWidthRaw(clampSidebarWidth(startWidth + (moveEvent.clientX - startX)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeCleanupRef.current = null
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    resizeCleanupRef.current = handleMouseUp
  }, [width])

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0
    if (event.key === 'ArrowLeft') delta = -SIDEBAR_RESIZE_STEP_PX
    else if (event.key === 'ArrowRight') delta = SIDEBAR_RESIZE_STEP_PX

    if (delta === 0) return

    event.preventDefault()
    setWidthRaw(clampSidebarWidth(width + delta))
  }, [width])

  return { width, isResizing, setWidth, handleResizeStart, handleResizeKeyDown }
}
