import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pin, PinOff } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../lib/constants/ui'

const SIDEBAR_AUTO_HIDE_MS = 2000
const SIDEBAR_PIN_STORAGE_KEY = 'sidebar-left-pinned'

interface UseSidebarCollapseLogicProps {
  collapsed: boolean
  isMobile: boolean
  setCollapsed: (collapsed: boolean) => void
  toggleCollapsed: () => void
}

export function useSidebarCollapseLogic({
  collapsed,
  isMobile,
  setCollapsed,
  toggleCollapsed,
}: UseSidebarCollapseLogicProps) {
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY) !== 'false'
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

  const handleSidebarMouseEnter = useCallback(() => {
    clearAutoHideTimer()
    if (!isPinned && collapsed && !isMobile) {
      setCollapsed(false)
    }
  }, [clearAutoHideTimer, collapsed, isMobile, isPinned, setCollapsed])

  const handleSidebarMouseLeave = useCallback(() => {
    if (!isPinned && !isMobile) {
      clearAutoHideTimer()
      autoHideTimerRef.current = setTimeout(() => {
        setCollapsed(true)
      }, SIDEBAR_AUTO_HIDE_MS)
    }
  }, [clearAutoHideTimer, isMobile, isPinned, setCollapsed])

  const toggleSidebarPin = useCallback(() => {
    setIsPinned((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, String(next))
      } catch {
        // ignore localStorage write failures
      }
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

  const handleCollapseToggle = useCallback(() => {
    if (collapsed) {
      setCollapsed(false)
      if (!isPinned) {
        setIsPinned(true)
        try {
          localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, 'true')
        } catch {
          // ignore localStorage write failures
        }
        clearAutoHideTimer()
      }
      return
    }

    toggleCollapsed()
  }, [clearAutoHideTimer, collapsed, isPinned, setCollapsed, toggleCollapsed])

  useEffect(() => {
    return () => clearAutoHideTimer()
  }, [clearAutoHideTimer])

  return {
    isPinned,
    clearAutoHideTimer,
    handleSidebarMouseEnter,
    handleSidebarMouseLeave,
    toggleSidebarPin,
    handleCollapseToggle,
  }
}

interface SidebarCollapseControlsProps {
  collapsed: boolean
  sidebarWidth: number
  isPinned: boolean
  onToggleCollapsed: () => void
  onTogglePin: () => void
  expandLabel: string
  collapseLabel: string
  pinLabel: string
  unpinLabel: string
}

export function SidebarCollapseControls({
  collapsed,
  sidebarWidth,
  isPinned,
  onToggleCollapsed,
  onTogglePin,
  expandLabel,
  collapseLabel,
  pinLabel,
  unpinLabel,
}: SidebarCollapseControlsProps) {
  return (
    <div
      className="fixed top-18 z-sidebar flex flex-col gap-1.5 items-center transition-[left] duration-300 bg-background border border-border/50 rounded-full p-1 shadow-md"
      style={{ left: sidebarWidth + SIDEBAR_CONTROLS_LEFT_OFFSET_PX }}
    >
      <button
        data-testid="sidebar-collapse-toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        title={collapsed ? expandLabel : collapseLabel}
        aria-label={collapsed ? expandLabel : collapseLabel}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
      <button
        onClick={onTogglePin}
        aria-pressed={isPinned}
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
          isPinned
            ? 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
            : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80',
        )}
        title={isPinned ? unpinLabel : pinLabel}
        aria-label={isPinned ? unpinLabel : pinLabel}
      >
        {isPinned ? <Pin className="w-3.5 h-3.5" aria-hidden="true" /> : <PinOff className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
    </div>
  )
}
