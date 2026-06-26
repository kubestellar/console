import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../hooks/useMissions'
import { BACKGROUND_MISSION_PREVIEW_LIMIT } from './missionSidebarConstants'

interface MissionSidebarRunningBannerProps {
  runningMissions: Mission[]
  runningMissionPreview: Mission[]
  onSelectMission: (id: string) => void
  onViewRunningMissions: () => void
  getRunningMissionStatusLabel: (status: Mission['status']) => string
}

export function MissionSidebarRunningBanner({
  runningMissions,
  runningMissionPreview,
  onSelectMission,
  onViewRunningMissions,
  getRunningMissionStatusLabel,
}: MissionSidebarRunningBannerProps) {
  const { t } = useTranslation(['common'])

  return (
    <div className="mx-3 mt-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
      <div className="flex items-start gap-2">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t('missionSidebar.backgroundMissionsRunning', { count: runningMissions.length })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('missionSidebar.backgroundMissionsHint', { defaultValue: 'Missions keep running even if you close Mission Control or this panel. Open history to follow live status and progress.' })}
          </p>
          <div className="mt-3 space-y-2">
            {runningMissionPreview.map((mission) => (
              <button
                key={mission.id}
                type="button"
                onClick={() => onSelectMission(mission.id)}
                className="w-full rounded-md border border-primary/20 bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-background"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">{mission.title}</span>
                  <span className="shrink-0 text-2xs text-primary">{getRunningMissionStatusLabel(mission.status)}</span>
                </div>
                <p className="mt-1 truncate text-2xs text-muted-foreground">
                  {mission.currentStep === 'Reconnecting...' && mission.lastKnownStep
                    ? `${mission.lastKnownStep} (reconnecting...)`
                    : (mission.currentStep || mission.description)}
                </p>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-2xs text-muted-foreground">
              {runningMissions.length > BACKGROUND_MISSION_PREVIEW_LIMIT
                ? t('missionSidebar.moreRunningMissions', {
                    count: runningMissions.length - BACKGROUND_MISSION_PREVIEW_LIMIT,
                    defaultValue: '+{{count}} more running in history',
                  })
                : t('missionSidebar.backgroundMissionsPersist', {
                    defaultValue: 'Closing this view will not stop the running missions.',
                  })}
            </span>
            <button
              type="button"
              onClick={onViewRunningMissions}
              className="shrink-0 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              {t('missionSidebar.viewRunningMissions', { defaultValue: 'View running missions' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
