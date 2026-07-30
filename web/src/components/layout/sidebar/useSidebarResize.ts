import { useState, useRef, useCallback, useEffect } from 'react'

interface UseSidebarResizeParams {
  sidebarWidth: number
  widthOverride?: number
  configWidth?: number
  setWidth: (w: number) => void
  SIDEBAR_DEFAULT_WIDTH_PX: number
  SIDEBAR_MIN_WIDTH_PX: number
  SIDEBAR_MAX_WIDTH_PX: number
  SIDEBAR_RESIZE_STEP_PX: number
}

export function useSidebarResize({
  sidebarWidth,
  widthOverride,
  configWidth,
  setWidth,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_RESIZE_STEP_PX,
}: UseSidebarResizeParams) {
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const clampSidebarWidth = useCallback((nextWidth: number) => {
    return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, nextWidth))
  }, [SIDEBAR_MIN_WIDTH_PX, SIDEBAR_MAX_WIDTH_PX])

  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = widthOverride ?? configWidth ?? SIDEBAR_DEFAULT_WIDTH_PX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX))
      setWidth(newWidth)
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
  }, [clampSidebarWidth, widthOverride, configWidth, SIDEBAR_DEFAULT_WIDTH_PX, setWidth])

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0
    if (event.key === 'ArrowLeft') delta = -SIDEBAR_RESIZE_STEP_PX
    else if (event.key === 'ArrowRight') delta = SIDEBAR_RESIZE_STEP_PX
    if (delta === 0) return
    event.preventDefault()
    setWidth(clampSidebarWidth(sidebarWidth + delta))
  }, [SIDEBAR_RESIZE_STEP_PX, sidebarWidth, setWidth, clampSidebarWidth])

  return { isResizing, handleResizeStart, handleResizeKeyDown }
}
