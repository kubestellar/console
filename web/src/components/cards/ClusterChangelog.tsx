import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'
import { useCachedEvents } from '../../hooks/useCachedData'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { RefreshIndicator } from '../ui/RefreshIndicator'

const CHANGE_REASONS = new Set([
  'ScalingReplicaSet', 'SuccessfulCreate', 'SuccessfulDelete',
  'Killing', 'Pulled', 'Created', 'Started', 'Scheduled',
  'SuccessfulRescale', 'ScaledUp', 'ScaledDown',
  'DeploymentRollback', 'DeploymentUpdated',
])

type TimeRange = '1h' | '6h' | '24h' | '7d'

export function ClusterChangelog() {
  const { t } = useTranslation('cards')
  const { events, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, refetch, lastRefresh: eventsLastRefresh } = useCachedEvents(undefined, undefined, { limit: 200 })
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const hasData = events.length > 0
  const { showSkeleton } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: events.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures })

  const cutoff = (() => {
    const now = Date.now()
    const hours: Record<TimeRange, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }
    return now - hours[timeRange] * MS_PER_HOUR
  })()

  const changeEvents = useMemo(() => {
    return events
      .filter(e => {
        if (!CHANGE_REASONS.has(e.reason || '')) return false
        const ts = e.lastSeen || e.firstSeen
        if (!ts) return true
        return new Date(ts).getTime() > cutoff
      })
      .sort((a, b) => {
        const ta = new Date(a.lastSeen || a.firstSeen || 0).getTime()
        const tb = new Date(b.lastSeen || b.firstSeen || 0).getTime()
        return tb - ta
      })
      .slice(0, 50)
  }, [events, cutoff])

  if (showSkeleton) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  const reasonColor = (reason: string) => {
    if (reason.includes('Create') || reason.includes('Started') || reason.includes('Scheduled')) return 'bg-green-500/10 text-green-400'
    if (reason.includes('Delete') || reason.includes('Killing')) return 'bg-red-500/10 text-red-400'
    if (reason.includes('Scal')) return 'bg-blue-500/10 text-blue-400'
    if (reason.includes('Rollback')) return 'bg-orange-500/10 text-orange-400'
    return 'bg-muted/50 text-muted-foreground'
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < MS_PER_MINUTE) return t('clusterChangelog.justNow')
    if (diff < MS_PER_HOUR) return t('clusterChangelog.minutesAgo', { count: Math.floor(diff / MS_PER_MINUTE) })
    if (diff < MS_PER_DAY) return t('clusterChangelog.hoursAgo', { count: Math.floor(diff / MS_PER_HOUR) })
    return t('clusterChangelog.daysAgo', { count: Math.floor(diff / MS_PER_DAY) })
  }

  return (
    <div className="space-y-2 p-1">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex gap-1">
          {(['1h', '6h', '24h', '7d'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                timeRange === r ? 'bg-primary text-primary-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {/* #6217 part 2: freshness indicator. */}
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={typeof eventsLastRefresh === 'number' ? new Date(eventsLastRefresh) : null}
          size="sm"
          showLabel={true}
          staleThresholdMinutes={5}
        />
      </div>

      {/* Error Display */}
      {isFailed && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-red-400">{t('clusterChangelog.errorLoading')}</p>
            <p className="text-2xs text-muted-foreground mt-0.5">{t('clusterChangelog.fetchFailed', { count: consecutiveFailures })}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 shrink-0"
          >
            {t('clusterChangelog.retry')}
          </button>
        </div>
      )}

      <div className="space-y-1 max-h-[350px] overflow-y-auto">
        {changeEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">{t('clusterChangelog.noChanges')}</div>
        ) : (
          changeEvents.map((event, i) => {
            const ts = event.lastSeen || event.firstSeen || ''
            return (
              <div key={`${event.cluster}-${event.object}-${i}`} className="flex gap-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mt-1.5" />
                  {i < changeEvents.length - 1 && <div className="w-px flex-1 bg-muted-foreground/20 mt-1" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${reasonColor(event.reason || '')}`}>
                      {event.reason}
                    </span>
                    {event.cluster && (
                      <StatusBadge color="purple">{event.cluster}</StatusBadge>
                    )}
                    {ts && <span className="text-xs text-muted-foreground">{formatTime(ts)}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {event.object || 'Unknown'}: {event.message || ''}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
