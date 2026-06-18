import { ChevronLeft, ChevronRight, Pin, PinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../../lib/constants/ui'
import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_RESIZE_HANDLE_OFFSET_PX,
  SIDEBAR_RESIZE_HANDLE_TOP_PX,
  SIDEBAR_RESIZE_HANDLE_WIDTH_PX,
} from './utils'

interface SidebarControlsProps {
  isCollapsed: boolean
  isPinned: boolean
  sidebarWidth: number
  isResizing: boolean
  isMobile: boolean
  isMissionFullScreen?: boolean
  showCollapsePin?: boolean
  showResize?: boolean
  onToggleCollapsed: () => void
  onSetCollapsed: (collapsed: boolean) => void
  onTogglePin: () => void
  onResizeStart: (event: React.MouseEvent) => void
  onResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

export function SidebarControls({
  isCollapsed,
  isPinned,
  sidebarWidth,
  isResizing,
  isMobile,
  isMissionFullScreen,
  showCollapsePin = true,
  showResize = true,
  onToggleCollapsed,
  onSetCollapsed,
  onTogglePin,
  onResizeStart,
  onResizeKeyDown,
}: SidebarControlsProps) {
  const { t } = useTranslation()

  return (
    <>
      {showCollapsePin && !isMobile && !isMissionFullScreen && (
        <div
          className="fixed top-18 z-sidebar flex flex-col gap-1.5 items-center transition-[left] duration-300 bg-background border border-border/50 rounded-full p-1 shadow-md"
          style={{ left: sidebarWidth + SIDEBAR_CONTROLS_LEFT_OFFSET_PX }}
        >
          <button
            data-testid="sidebar-collapse-toggle"
            onClick={() => {
              if (isCollapsed) {
                onSetCollapsed(false)
                if (!isPinned) {
                  onTogglePin()
                }
              } else {
                onToggleCollapsed()
              }
            }}
            aria-expanded={!isCollapsed}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            title={isCollapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
            aria-label={isCollapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />}
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
            title={isPinned ? t('layout.sidebar.unpinSidebar') : t('layout.sidebar.pinSidebar')}
            aria-label={isPinned ? t('layout.sidebar.unpinSidebar') : t('layout.sidebar.pinSidebar')}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5" aria-hidden="true" /> : <PinOff className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      )}

      {showResize && !isCollapsed && !isMobile && (
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
            isResizing && 'bg-purple-500/50',
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
