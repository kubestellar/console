import { Sparkles, Globe, Rocket, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { MISSION_CONTROL_BUTTON_CLASSES } from './missionSidebarConstants'

/**
 * Mission sidebar dashboard component.
 * Displays mission control actions. System health status is shown in the main dashboard header.
 */

interface MissionSidebarDashboardProps {
  showNewMission: boolean
  listTotalMissions: number
  onOpenMissionBrowser: () => void
  onOpenMissionControl: () => void
  onStartNewMission: () => void
  onToggleHistory: () => void
}

export function MissionSidebarDashboard({
  showNewMission,
  listTotalMissions,
  onOpenMissionBrowser,
  onOpenMissionControl,
  onStartNewMission,
  onToggleHistory,
}: MissionSidebarDashboardProps) {
  const { t } = useTranslation(['common'])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
      <p className="text-foreground font-medium">{t('missionSidebar.readyToHelp', { defaultValue: 'Ready to help' })}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        {t('missionSidebar.startMissionPrompt')}
      </p>
      <div className="mt-4 grid w-full max-w-sm grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
        {!showNewMission && (
          <button
            type="button"
            onClick={onStartNewMission}
            className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Sparkles className="h-6 w-6 shrink-0" />
            <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('missionSidebar.startCustomMission')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenMissionBrowser}
          className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
        >
          <Globe className="h-6 w-6 shrink-0" />
          <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('layout.missionSidebar.browseCommunityMissions')}</span>
        </button>
        <button
          type="button"
          onClick={onOpenMissionControl}
          className={cn(
            'flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
            MISSION_CONTROL_BUTTON_CLASSES
          )}
        >
          <Rocket className="h-6 w-6 shrink-0" />
          <span className="max-w-full text-center text-xs leading-tight whitespace-normal break-words">{t('layout.missionSidebar.missionControl')}</span>
        </button>
      </div>
      {/* Hint to open history when missions exist */}
      {listTotalMissions > 0 && (
        <button
          type="button"
          onClick={onToggleHistory}
          className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-primary cursor-pointer hover:underline underline-offset-2 transition-colors rounded-md px-2 py-1 -mx-2 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
        >
          <History className="w-3.5 h-3.5" />
          {t('missionSidebar.viewHistory', {
            defaultValue: 'View {{count}} previous missions',
            count: listTotalMissions })}
        </button>
      )}
    </div>
  )
}
