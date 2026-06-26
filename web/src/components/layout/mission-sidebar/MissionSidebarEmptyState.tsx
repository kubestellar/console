import { Sparkles, Globe, Rocket } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { MISSION_CONTROL_BUTTON_CLASSES } from './missionSidebarConstants'

interface MissionSidebarEmptyStateProps {
  showNewMission: boolean
  onOpenMissionBrowser: () => void
  onOpenMissionControl: () => void
  onStartNewMission: () => void
}

export function MissionSidebarEmptyState({
  showNewMission,
  onOpenMissionBrowser,
  onOpenMissionControl,
  onStartNewMission,
}: MissionSidebarEmptyStateProps) {
  const { t } = useTranslation(['common'])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <Sparkles className="w-10 h-10 text-purple-400/60 mb-4" />
      <p className="text-muted-foreground">{t('missionSidebar.noActiveMissions')}</p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        {t('missionSidebar.startMissionPrompt')}
      </p>
      <div className="flex flex-col gap-2.5 mt-5 w-full max-w-xs">
        {!showNewMission && (
          <button
            type="button"
            onClick={onStartNewMission}
            className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="text-left leading-snug">{t('missionSidebar.startCustomMission')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenMissionBrowser}
          className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
        >
          <Globe className="w-5 h-5 shrink-0" />
          <span className="text-left leading-snug">{t('layout.missionSidebar.browseCommunityMissions')}</span>
        </button>
        <button
          type="button"
          onClick={onOpenMissionControl}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
            MISSION_CONTROL_BUTTON_CLASSES
          )}
        >
          <Rocket className="w-5 h-5 shrink-0" />
          <span className="text-left leading-snug">{t('layout.missionSidebar.missionControl')}</span>
        </button>
      </div>
    </div>
  )
}
