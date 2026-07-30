import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Pin, PinOff } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { SIDEBAR_CONTROLS_LEFT_OFFSET_PX } from '../../../lib/constants/ui'

interface SidebarCollapseControlsProps {
  isCollapsed: boolean
  isPinned: boolean
  sidebarWidth: number
  isMissionFullScreen: boolean
  onToggleCollapse: () => void
  onTogglePin: () => void
}

export function SidebarCollapseControls({
  isCollapsed,
  isPinned,
  sidebarWidth,
  isMissionFullScreen,
  onToggleCollapse,
  onTogglePin,
}: SidebarCollapseControlsProps) {
  const { t } = useTranslation()

  if (isMissionFullScreen) return null

  return (
    <div
      className="fixed top-18 z-sidebar flex flex-col gap-1.5 items-center transition-[left] duration-300 bg-background border border-border/50 rounded-full p-1 shadow-md"
      style={{ left: sidebarWidth + SIDEBAR_CONTROLS_LEFT_OFFSET_PX }}
    >
      <button
        data-testid="sidebar-collapse-toggle"
        onClick={onToggleCollapse}
        aria-expanded={!isCollapsed}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
        title={isCollapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
        aria-label={isCollapsed ? t('layout.sidebar.expandSidebar') : t('layout.sidebar.collapseSidebar')}
      >
        {isCollapsed
          ? <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          : <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
      <button
        onClick={onTogglePin}
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
        {isPinned
          ? <Pin className="w-3.5 h-3.5" aria-hidden="true" />
          : <PinOff className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
    </div>
  )
}
