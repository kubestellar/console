import type React from 'react'
import { ChevronLeft, ChevronRight, Pin, PinOff } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../lib/constants/ui'
import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_RESIZE_HANDLE_OFFSET_PX,
  SIDEBAR_RESIZE_HANDLE_TOP_PX,
  SIDEBAR_RESIZE_HANDLE_WIDTH_PX,
} from './SidebarShell.constants'

interface SidebarShellControlsProps {
  enableCollapsePin: boolean
  enableResize: boolean
  isMobile: boolean
  isMissionFullScreen: boolean
  isCollapsed: boolean
  sidebarWidth: number
  isPinned: boolean
  setIsPinned: (next: boolean) => void
  configCollapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  clearAutoHideTimer: () => void
  toggleSidebarPin: () => void
  isResizing: boolean
  onResizeStart: (event: React.MouseEvent) => void
  onResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  t: (key: string) => string
}

export function SidebarShellControls({
  enableCollapsePin,
  enableResize,
  isMobile,
  isMissionFullScreen,
  isCollapsed,
  sidebarWidth,
  isPinned,
  setIsPinned,
  configCollapsed,
  setCollapsed,
  toggleCollapsed,
  clearAutoHideTimer,
  toggleSidebarPin,
  isResizing,
  onResizeStart,
  onResizeKeyDown,
  t,
}: SidebarShellControlsProps) {
  return (
    <>
      {enableCollapsePin && !isMobile && !isMissionFullScreen && (
        <div
          className="fixed top-18 z-sidebar flex flex-col gap-1.5 items-center transition-[left] duration-300 bg-background border border-border/50 rounded-full p-1 shadow-md"
          style={{ left: sidebarWidth + SIDEBAR_CONTROLS_LEFT_OFFSET_PX }}
        >
          <button
            data-testid="sidebar-collapse-toggle"
            onClick={() => {
              if (configCollapsed) {
                setCollapsed(false)
                if (!isPinned) {
                  setIsPinned(true)
                  try { localStorage.setItem('sidebar-left-pinned', 'true') } catch { /* ignore */ }
                  clearAutoHideTimer()
                }
              } else {
                toggleCollapsed()
              }
            }}
            aria-expanded={!configCollapsed}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            title={configCollapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
            aria-label={configCollapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
          >
            {configCollapsed ? <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
          <button
            onClick={toggleSidebarPin}
            aria-pressed={isPinned}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
              isPinned
                ? 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
            title={isPinned ? t('layout.sidebar.unpinSidebar') : t('layout.sidebar.pinSidebar')}
            aria-label={isPinned ? t('layout.sidebar.unpinSidebar') : t('layout.sidebar.pinSidebar')}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5" aria-hidden="true" /> : <PinOff className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      )}

      {enableResize && !isCollapsed && !isMobile && (
        <div
          onMouseDown={onResizeStart}
          onKeyDown={onResizeKeyDown}
          tabIndex={0}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('layout.sidebar.resizeSidebar')}
          aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
          aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
          aria-valuenow={sidebarWidth}
          className={cn(
            'fixed bottom-0 hidden cursor-col-resize z-sidebar transition-colors md:block',
            'hover:bg-purple-500/30 focus-visible:bg-purple-500/30 focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-purple-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isResizing && 'bg-purple-500/50'
          )}
          style={{
            top: SIDEBAR_RESIZE_HANDLE_TOP_PX,
            left: sidebarWidth - SIDEBAR_RESIZE_HANDLE_OFFSET_PX,
            width: SIDEBAR_RESIZE_HANDLE_WIDTH_PX,
          }}
        />
      )}
    </>
  )
}
