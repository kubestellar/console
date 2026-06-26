import { useState, useEffect, useRef } from 'react'

export const SIDEBAR_MIN_WIDTH = 380
export const SIDEBAR_MAX_WIDTH = 800
export const SIDEBAR_DEFAULT_WIDTH = 480
const SIDEBAR_WIDTH_KEY = 'ksc-mission-sidebar-width'

// Tablet breakpoint matches Tailwind's `lg` (1024px). Below this width the
// mission sidebar is rendered as an overlay (position: fixed without pushing
// main content) so tablet layouts don't get squeezed below the min sidebar
// width. See issues 6388 / 6394.
export const TABLET_BREAKPOINT_PX = 1024

function loadSavedWidth(): number {
  const maxW = typeof window !== 'undefined'
    ? Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.6)
    : SIDEBAR_MAX_WIDTH
  try {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    if (saved) {
      const w = Number(saved)
      if (w >= SIDEBAR_MIN_WIDTH && w <= SIDEBAR_MAX_WIDTH) return Math.min(w, maxW)
    }
  } catch { /* ignore */ }
  return Math.min(SIDEBAR_DEFAULT_WIDTH, maxW)
}

export interface SidebarResizeResult {
  sidebarWidth: number
  isResizing: boolean
  isTablet: boolean
  handleResizeStart: (e: React.MouseEvent) => void
}

/**
 * Manages sidebar drag-to-resize state, viewport clamping, and tablet
 * breakpoint detection. Width is persisted to localStorage under
 * `ksc-mission-sidebar-width`.
 */
export function useSidebarResize(): SidebarResizeResult {
  const [sidebarWidth, setSidebarWidth] = useState(loadSavedWidth)
  const [isResizing, setIsResizing] = useState(false)
  const latestWidthRef = useRef(sidebarWidth)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < TABLET_BREAKPOINT_PX
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT_PX - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsTablet(e.matches)
    setIsTablet(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Re-clamp sidebar width when viewport is resized
  useEffect(() => {
    const onResize = () => {
      const maxW = Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.6)
      setSidebarWidth((w) => {
        const clamped = Math.min(w, maxW)
        latestWidthRef.current = clamped
        return clamped
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Clean up resize listeners on unmount to prevent leaks if mouseup never fires
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    document.documentElement.dataset.missionResizing = '1'
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (ev: MouseEvent) => {
      // Sidebar is on the right, so dragging left increases width
      const delta = startX - ev.clientX
      const maxW = Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth * 0.6)
      const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(maxW, startWidth + delta))
      latestWidthRef.current = newWidth
      setSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      delete document.documentElement.dataset.missionResizing
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeCleanupRef.current = null
      // Persist final width using ref to avoid state-updater side effects
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(latestWidthRef.current)) } catch { /* ignore */ }
      // Notify child components (charts, resize observers) to recalculate
      // their layout after the panel resize completes (#11458).
      window.dispatchEvent(new Event('resize'))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    resizeCleanupRef.current = onMouseUp
  }

  return { sidebarWidth, isResizing, isTablet, handleResizeStart }
}
