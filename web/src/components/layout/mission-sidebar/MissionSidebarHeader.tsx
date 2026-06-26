import { useRef, useState, useEffect } from 'react'
import {
  X,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Plus,
  Globe,
  Rocket,
  History,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { LogoWithStar } from '../../ui/LogoWithStar'
import { StatusBadge } from '../../ui/StatusBadge'
import { AgentSelector } from '../../agent/AgentSelector'
import { FOCUS_DELAY_MS } from '../../../lib/constants/network'

interface MissionSidebarHeaderProps {
  isMobile: boolean
  isFullScreen: boolean
  needsAttention: number
  showHistoryPanel: boolean
  listTotalMissions: number
  activeMission: { id: string } | null
  newMissionInputRef: React.RefObject<HTMLTextAreaElement>
  onClose: () => void
  onMinimize: () => void
  onToggleFullScreen: () => void
  onOpenMissionBrowser: () => void
  onOpenMissionControl: () => void
  onSetShowNewMission: (show: boolean) => void
  onToggleHistory: () => void
  onSetActiveMission: (id: string | null) => void
  onSetShowHistoryPanel: (show: boolean) => void
}

export function MissionSidebarHeader({
  isMobile,
  isFullScreen,
  needsAttention,
  showHistoryPanel,
  listTotalMissions,
  activeMission,
  newMissionInputRef,
  onClose,
  onMinimize,
  onToggleFullScreen,
  onOpenMissionBrowser,
  onOpenMissionControl,
  onSetShowNewMission,
  onToggleHistory,
  onSetActiveMission,
  onSetShowHistoryPanel,
}: MissionSidebarHeaderProps) {
  const { t } = useTranslation(['common'])
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  return (
    <div className="flex items-center gap-2 p-3 md:p-4 border-b border-border min-w-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <LogoWithStar className="w-5 h-5 shrink-0" />
        <h2 className="font-semibold text-foreground text-sm md:text-base truncate">{t('missionSidebar.aiMissions')}</h2>
        {needsAttention > 0 && (
          <StatusBadge color="purple" rounded="full">{needsAttention}</StatusBadge>
        )}
      </div>
      {/* Toolbar and window controls — split so close/minimize never overflow */}
      <div className="flex items-center gap-1.5 shrink-0" role="toolbar" aria-label={t('missionSidebar.headerActions', { defaultValue: 'Mission panel actions' })}>
        {/* + button with dropdown — outside overflow-hidden so the dropdown isn't clipped */}
        <div className="relative mr-1 shrink-0" ref={addMenuRef}>
          <button
            type="button"
            onClick={() => setShowAddMenu(prev => !prev)}
            className={cn(
              "p-1.5 rounded transition-colors ring-1",
              showAddMenu
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-purple-500/10 text-purple-400 ring-purple-500/30 hover:bg-purple-500/20 hover:text-purple-300"
            )}
            aria-label="Add"
            title="Add"
          >
            <Plus className="w-4 h-4" />
          </button>
          {showAddMenu && (
            <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-border bg-background shadow-lg py-1">
              <button
                type="button"
                onClick={() => {
                  setShowAddMenu(false)
                  onSetShowNewMission(true)
                  setTimeout(() => newMissionInputRef.current?.focus(), FOCUS_DELAY_MS)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
              >
                <Plus className="w-4 h-4 text-purple-400" />
                New Mission
              </button>
              <button
                type="button"
                onClick={() => { setShowAddMenu(false); onOpenMissionBrowser() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
              >
                <Globe className="w-4 h-4 text-muted-foreground" />
                Browse Community
              </button>
              <button
                type="button"
                onClick={() => { setShowAddMenu(false); onOpenMissionControl() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
              >
                <Rocket className="w-4 h-4 text-muted-foreground" />
                Mission Control
              </button>
              {/* History toggle on mobile — desktop uses a standalone icon button (#10522) */}
              {isMobile && listTotalMissions > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false)
                    if (activeMission) {
                      onSetActiveMission(null)
                      onSetShowHistoryPanel(true)
                    } else {
                      onToggleHistory()
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 text-foreground"
                >
                  <History className="w-4 h-4 text-muted-foreground" />
                  {showHistoryPanel
                    ? t('missionSidebar.hideHistory', { defaultValue: 'Hide History' })
                    : t('missionSidebar.showHistory', { defaultValue: 'Show History' })}
                  {!showHistoryPanel && listTotalMissions > 0 && (
                    <span className="ml-auto text-2xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">{listTotalMissions}</span>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
        {/* History toggle button (#10522) — shows/hides mission history list.
            On mobile, the toggle is inside the + menu to avoid crowding the header. */}
        {!isMobile && (
          <button
            onClick={() => {
              if (activeMission) {
                // In chat mode the history panel is hidden behind the chat view;
                // navigate back to the list and open history so the click is visible.
                onSetActiveMission(null)
                onSetShowHistoryPanel(true)
              } else {
                onToggleHistory()
              }
            }}
            className={cn(
              "relative p-1.5 rounded transition-colors ring-1 mr-1 shrink-0",
              showHistoryPanel && !activeMission
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-secondary/50 text-muted-foreground ring-border hover:bg-secondary hover:text-foreground"
            )}
            aria-label={t('missionSidebar.toggleHistory', { defaultValue: 'Toggle mission history' })}
            title={t('missionSidebar.toggleHistory', { defaultValue: 'Toggle mission history' })}
          >
            <History className="w-4 h-4" />
            {listTotalMissions > 0 && !showHistoryPanel && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-medium bg-purple-500 text-white rounded-full px-1">
                {listTotalMissions}
              </span>
            )}
          </button>
        )}
        {/* Optional toolbar buttons — keep the selector fully visible while the title truncates first */}
        <div className="flex items-center gap-1 min-w-0 shrink-0">
          <AgentSelector compact={!isFullScreen} className="shrink-0" />
        </div>
        {/* Window control buttons — always visible, never clipped */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Fullscreen and minimize - desktop only */}
          {!isMobile && (isFullScreen ? (
            <button
              onClick={onToggleFullScreen}
              className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={t('missionSidebar.exitFullScreen')}
              title={t('missionSidebar.exitFullScreen')}
            >
              <Minimize2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            </button>
          ) : (
            <>
              <button
                onClick={onToggleFullScreen}
                className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={t('missionSidebar.fullScreen')}
                title={t('missionSidebar.fullScreen')}
              >
                <Maximize2 className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              </button>
              <button
                onClick={onMinimize}
                className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={t('missionSidebar.minimizeSidebar')}
                title={t('missionSidebar.minimizeSidebar')}
              >
                <PanelRightClose className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              </button>
            </>
          ))}
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] p-2 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
            aria-label={t('missionSidebar.closeSidebar')}
            title={t('missionSidebar.closeSidebar')}
          >
            <X className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
