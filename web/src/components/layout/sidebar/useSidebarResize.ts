import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_RESIZE_STEP_PX,
} from './utils'

interface UseSidebarResizeProps {
  getWidth: () => number
  onSetWidth: (width: number) => void
}

function clampSidebarWidth(width: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(width, SIDEBAR_MAX_WIDTH_PX))
}

export function useSidebarResize({ getWidth, onSetWidth }: UseSidebarResizeProps) {
  const [isResizing, setIsResizing] = useState(false)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.()
    }
  }, [])

  const handleResizeStart = (event: MouseEvent) => {
    event.preventDefault()
    setIsResizing(true)
    const startX = event.clientX
    const startWidth = getWidth()

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const newWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX))
      onSetWidth(newWidth)
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
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>, currentWidth: number) => {
    let delta = 0

    if (event.key === 'ArrowLeft') {
      delta = -SIDEBAR_RESIZE_STEP_PX
    } else if (event.key === 'ArrowRight') {
      delta = SIDEBAR_RESIZE_STEP_PX
    }

    if (delta === 0) {
      return
    }

    event.preventDefault()
    onSetWidth(clampSidebarWidth(currentWidth + delta))
  }

  return {
    isResizing,
    handleResizeStart,
    handleResizeKeyDown,
  }
}
