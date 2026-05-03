/**
 * OrbitReminderBanner — Shows in the Mission Sidebar when orbit missions are due/overdue.
 * Groups multiple due missions into a single banner.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Satellite, X, Play } from 'lucide-react'
import type { Mission } from '../../hooks/useMissions'
import { ORBIT_CADENCE_HOURS, ORBIT_OVERDUE_GRACE_HOURS } from '../../lib/constants/orbit'
import { HOURS_PER_DAY } from '../../lib/constants/time'
import type { OrbitConfig } from '../../lib/missions/types'
import { cn } from '../../lib/cn'


function formatDuration(hours: number): string {
  if (hours < 1) return 'less than 1 hour'
  if (hours < HOURS_PER_DAY) return `${Math.round(hours)}h`
  const days = Math.round(hours / HOURS_PER_DAY)
  return `${days}d`
}

interface OrbitReminder {
  missionId: string
  title: string
  orbitType: string
  overdueHours: number
  isOverdue: boolean
}

function computeReminders(missions: Mission[]): OrbitReminder[] {
  const reminders: OrbitReminder[] = []

  for (const mission of missions || []) {
    if (mission.importedFrom?.missionClass !== 'orbit') continue
    if (mission.status !== 'saved' && mission.status !== 'completed') continue

    const orbitConfig = mission.context?.orbitConfig as OrbitConfig | undefined
    if (!orbitConfig) continue

    const cadenceHours = ORBIT_CADENCE_HOURS[orbitConfig.cadence] || ORBIT_CADENCE_HOURS.weekly
    const lastRun = orbitConfig.lastRunAt ? new Date(orbitConfig.lastRunAt).getTime() : 0
    const hoursSinceRun = lastRun ? (Date.now() - lastRun) / (3_600_000) : Infinity
    const overdueHours = hoursSinceRun - cadenceHours

    if (overdueHours > -ORBIT_OVERDUE_GRACE_HOURS) {
      reminders.push({
        missionId: mission.id,
        title: mission.title,
        orbitType: orbitConfig.orbitType,
        overdueHours: Math.max(0, overdueHours),
        isOverdue: overdueHours > 0,
      })
    }
  }

  return reminders.sort((a, b) => b.overdueHours - a.overdueHours)
}

interface OrbitReminderBannerProps {
  missions: Mission[]
  onRunMission: (missionId: string) => void
}

export function OrbitReminderBanner({ missions, onRunMission }: OrbitReminderBannerProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)

  const reminders = useMemo(() => computeReminders(missions), [missions])

  if (dismissed || reminders.length === 0) return null

  const overdueCount = reminders.filter(r => r.isOverdue).length

  return (
    <div className={cn(
      'mx-2 mb-2 rounded-lg border p-3',
      overdueCount > 0
        ? 'border-amber-500/30 bg-amber-500/5'
        : 'border-purple-500/30 bg-purple-500/5',
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Satellite className={cn('w-3.5 h-3.5', overdueCount > 0 ? 'text-amber-400' : 'text-purple-400')} />
          <span className="text-xs font-medium text-foreground">
            {t('orbit.reminderTitle')}
          </span>
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
            overdueCount > 0
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-purple-500/20 text-purple-400',
          )}>
            {reminders.length}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 hover:bg-secondary/50 rounded transition-colors"
          aria-label={t('orbit.reminderDismiss')}
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-1.5">
        {reminders.slice(0, 3).map(reminder => (
          <div key={reminder.missionId} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-foreground truncate block">{reminder.title}</span>
              <span className={cn(
                'text-[10px]',
                reminder.isOverdue ? 'text-amber-400' : 'text-muted-foreground',
              )}>
                {reminder.isOverdue
                  ? t('orbit.overdue', { time: formatDuration(reminder.overdueHours) })
                  : t('orbit.dueIn', { time: formatDuration(Math.abs(reminder.overdueHours)) })}
              </span>
            </div>
            <button
              onClick={() => onRunMission(reminder.missionId)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 rounded transition-colors shrink-0"
            >
              <Play className="w-2.5 h-2.5" />
              {t('orbit.runNow')}
            </button>
          </div>
        ))}
        {reminders.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{reminders.length - 3} more
          </span>
        )}
      </div>
    </div>
  )
}
