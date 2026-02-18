import { useState, useMemo } from 'react'
import { useCachedEvents } from '../../hooks/useCachedData'
import { useCardLoadingState } from './CardDataContext'

const CHANGE_REASONS = new Set([
  'ScalingReplicaSet', 'SuccessfulCreate', 'SuccessfulDelete',
  'Killing', 'Pulled', 'Created', 'Started', 'Scheduled',
  'SuccessfulRescale', 'ScaledUp', 'ScaledDown',
  'DeploymentRollback', 'DeploymentUpdated',
])

type TimeRange = '1h' | '6h' | '24h' | '7d'

export function ClusterChangelog() {
  const { events, isLoading, isDemoFallback, isFailed, consecutiveFailures } = useCachedEvents(undefined, undefined, { limit: 200 })
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const { showSkeleton } = useCardLoadingState({
    isLoading,
    hasAnyData: events.length > 0,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })

  const cutoff = useMemo(() => {
    const now = Date.now()
    const hours: Record<TimeRange, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }
    return now - hours[timeRange] * 3600000
  }, [timeRange])

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
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  }

  return (
    <div className="space-y-2 p-1">
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

      <div className="space-y-1 max-h-[350px] overflow-y-auto">
        {changeEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">No changes in selected time range</div>
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
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">{event.cluster}</span>
                    )}
                    {ts && <span className="text-xs text-muted-foreground">{formatTime(ts)}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {event.object}: {event.message}
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
