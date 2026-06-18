import { useCallback, useEffect, useRef, useState } from 'react'
import { SIDEBAR_AUTO_HIDE_MS } from './utils'

interface UseSidebarPinningProps {
  isCollapsed: boolean
  isMobile: boolean
  onSetCollapsed: (collapsed: boolean) => void
}

export function useSidebarPinning({
  isCollapsed,
  isMobile,
  onSetCollapsed,
}: UseSidebarPinningProps) {
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem('sidebar-left-pinned') !== 'false'
    } catch {
      return true
    }
  })

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
  }, [])

  const handleSidebarMouseEnter = () => {
    clearAutoHideTimer()
    if (!isPinned && isCollapsed && !isMobile) {
      onSetCollapsed(false)
    }
  }

  const handleSidebarMouseLeave = () => {
    if (!isPinned && !isMobile) {
      clearAutoHideTimer()
      autoHideTimerRef.current = setTimeout(() => {
        onSetCollapsed(true)
      }, SIDEBAR_AUTO_HIDE_MS)
    }
  }

  const toggleSidebarPin = () => {
    setIsPinned(previous => {
      const next = !previous
      try {
        localStorage.setItem('sidebar-left-pinned', String(next))
      } catch {
        // ignore
      }

      if (next) {
        clearAutoHideTimer()
        if (isCollapsed) {
          onSetCollapsed(false)
        }
      } else if (!isCollapsed) {
        autoHideTimerRef.current = setTimeout(() => onSetCollapsed(true), SIDEBAR_AUTO_HIDE_MS)
      }

      return next
    })
  }

  useEffect(() => () => clearAutoHideTimer(), [clearAutoHideTimer])

  return {
    isPinned,
    clearAutoHideTimer,
    handleSidebarMouseEnter,
    handleSidebarMouseLeave,
    toggleSidebarPin,
  }
}
