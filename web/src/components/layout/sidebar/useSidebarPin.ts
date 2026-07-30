import { useState, useRef, useCallback, useEffect } from 'react'

const SIDEBAR_AUTO_HIDE_MS = 2000

interface UseSidebarPinParams {
  isCollapsed: boolean
  isMobile: boolean
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

export function useSidebarPin({ isCollapsed, isMobile, collapsed, setCollapsed }: UseSidebarPinParams) {
  const [isPinned, setIsPinned] = useState(() => {
    try { return localStorage.getItem('sidebar-left-pinned') !== 'false' } catch { return true }
  })

  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = null
    }
  }, [])

  const handleSidebarMouseEnter = useCallback(() => {
    clearAutoHideTimer()
    if (!isPinned && isCollapsed && !isMobile) {
      setCollapsed(false)
    }
  }, [clearAutoHideTimer, isPinned, isCollapsed, isMobile, setCollapsed])

  const handleSidebarMouseLeave = useCallback(() => {
    if (!isPinned && !isMobile) {
      clearAutoHideTimer()
      autoHideTimerRef.current = setTimeout(() => {
        setCollapsed(true)
      }, SIDEBAR_AUTO_HIDE_MS)
    }
  }, [clearAutoHideTimer, isPinned, isMobile, setCollapsed])

  const toggleSidebarPin = useCallback(() => {
    setIsPinned(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar-left-pinned', String(next)) } catch { /* ignore */ }
      if (next) {
        clearAutoHideTimer()
        if (collapsed) {
          setCollapsed(false)
        }
      } else if (!collapsed) {
        autoHideTimerRef.current = setTimeout(() => setCollapsed(true), SIDEBAR_AUTO_HIDE_MS)
      }
      return next
    })
  }, [clearAutoHideTimer, collapsed, setCollapsed])

  useEffect(() => () => clearAutoHideTimer(), [clearAutoHideTimer])

  return { isPinned, handleSidebarMouseEnter, handleSidebarMouseLeave, toggleSidebarPin }
}
