/**
 * OrbitStatusTracker — Run history timeline for orbit missions.
 * Shows inside the mission detail view when viewing an orbit mission.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertTriangle, XCircle, Clock, Play, ChevronDown, ChevronUp } from 'lucide-react'
import type { OrbitRunHistoryEntry, OrbitCadence } from '../../lib/missions/types'
import { ORBIT_CADENCE_HOURS } from '../../lib/constants/orbit'
import { cn } from '../../lib/cn'

/** Maximum history entries shown before "Show more" */
const VISIBLE_HISTORY_COUNT = 5

const RESULT_CONFIG = {
  success: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  failure: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
} as const

interface OrbitStatusTrackerProps {
  history: OrbitRunHistoryEntry[]
  cadence: OrbitCadence
  lastRunAt?: string | null
  onRunNow: () => void
  onChangeCadence: (cadence: OrbitCadence) => void
}

const CADENCE_OPTIONS: OrbitCadence[] = ['daily', 'weekly', 'monthly']

export function OrbitStatusTracker({
  history,
  cadence,
  lastRunAt,
  onRunNow,
  onChangeCadence,
}: OrbitStatusTrackerProps) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const [showCadenceMenu, setShowCadenceMenu] = useState(false)

  const visibleHistory = showAll ? (history || []) : (history || []).slice(0, VISIBLE_HISTORY_COUNT)
  const hasMore = (history || []).length > VISIBLE_HISTORY_COUNT

  // Compute next run
  const cadenceMs = ORBIT_CADENCE_HOURS[cadence] * 3_600_000
  const lastRunTime = lastRunAt ? new Date(lastRunAt).getTime() : 0
  const nextRunTime = lastRunTime ? lastRunTime + cadenceMs : 0
  const msUntilNext = nextRunTime ? nextRunTime - Date.now() : 0
  const hoursUntilNext = msUntilNext / 3_600_000

  return (
    <div className="mx-4 mb-4 rounded-xl border border-border bg-secondary/20 overflow-hidden">
      {/* Header with next run + actions */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <div className="text-xs font-medium text-foreground">{t('orbit.title')}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {lastRunAt
              ? hoursUntilNext > 0
                ? t('orbit.dueIn', { time: hoursUntilNext < 24 ? `${Math.round(hoursUntilNext)}h` : `${Math.round(hoursUntilNext / 24)}d` })
                : t('orbit.overdue', { time: Math.abs(hoursUntilNext) < 24 ? `${Math.round(Math.abs(hoursUntilNext))}h` : `${Math.round(Math.abs(hoursUntilNext) / 24)}d` })
              : t('orbit.neverRun')}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Cadence selector */}
          <div className="relative">
            <button
              onClick={() => setShowCadenceMenu(!showCadenceMenu)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-md transition-colors"
            >
              <Clock className="w-3 h-3" />
              {t(`orbit.cadence${cadence.charAt(0).toUpperCase() + cadence.slice(1)}` as 'orbit.cadenceDaily')}
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
            {showCadenceMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1">
                {CADENCE_OPTIONS.map(option => (
                  <button
                    key={option}
                    onClick={() => { onChangeCadence(option); setShowCadenceMenu(false) }}
                    className={cn(
                      'w-full px-3 py-1 text-[10px] text-left hover:bg-secondary/50 transition-colors',
                      cadence === option ? 'text-primary font-medium' : 'text-foreground',
                    )}
                  >
                    {t(`orbit.cadence${option.charAt(0).toUpperCase() + option.slice(1)}` as 'orbit.cadenceDaily')}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Run Now */}
          <button
            onClick={onRunNow}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
          >
            <Play className="w-3 h-3" />
            {t('orbit.runNow')}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {visibleHistory.length > 0 ? (
        <div className="px-4 py-2">
          {visibleHistory.map((entry, idx) => {
            const config = RESULT_CONFIG[entry.result]
            const Icon = config.icon
            const date = new Date(entry.timestamp)
            return (
              <div key={idx} className="flex items-start gap-2.5 py-1.5">
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5', config.bg)}>
                  <Icon className={cn('w-3 h-3', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-foreground">
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={cn('text-[10px] font-medium', config.color)}>
                      {entry.result}
                    </span>
                  </div>
                  {entry.summary && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{entry.summary}</p>
                  )}
                </div>
              </div>
            )
          })}
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-primary hover:bg-primary/5 rounded transition-colors"
            >
              {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showAll ? 'Show less' : `Show ${(history || []).length - VISIBLE_HISTORY_COUNT} more`}
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 py-4 text-center">
          <p className="text-[10px] text-muted-foreground">{t('orbit.neverRun')}</p>
        </div>
      )}
    </div>
  )
}
