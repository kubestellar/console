/**
 * NightlyReleasePulse — hero card for the /ci-cd dashboard.
 *
 * Shows the latest nightly Release workflow outcome, the current success/
 * failure streak, the next scheduled cron time, and a 14-day conclusion
 * sparkline. Data sourced from /api/github-pipelines?view=pulse.
 */
import { useMemo } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Clock, ExternalLink } from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useCardLoadingState } from '../CardDataContext'
import { usePipelinePulse } from '../../../hooks/useGitHubPipelines'
import { cn } from '../../../lib/cn'

/** Opacity for cells in the sparkline that have no data yet */
const EMPTY_CELL_OPACITY = 0.15

/** Colors for conclusion swatches — matches NPS/status conventions elsewhere */
const CONCLUSION_CLASS: Record<string, string> = {
  success: 'bg-green-500/70',
  failure: 'bg-red-500/80',
  timed_out: 'bg-orange-500/80',
  cancelled: 'bg-gray-500/60',
  skipped: 'bg-gray-500/40',
  action_required: 'bg-yellow-500/70',
  neutral: 'bg-gray-500/50',
  stale: 'bg-gray-500/40',
}

function formatCron(cron: string): string {
  // Best-effort pretty-print for the common "m h * * *" case. Not a full parser.
  const parts = cron.trim().split(/\s+/)
  if (parts.length === 5 && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
    const minute = parseInt(parts[0], 10)
    const hourUtc = parseInt(parts[1], 10)
    if (!isNaN(minute) && !isNaN(hourUtc)) {
      // Convert UTC → local for readability (honors DST)
      const now = new Date()
      const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minute))
      return `${utc.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} daily`
    }
  }
  return cron
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const secs = Math.max(0, Math.floor((now - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  if (secs < 3_600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86_400) return `${Math.floor(secs / 3_600)}h ago`
  return `${Math.floor(secs / 86_400)}d ago`
}

export function NightlyReleasePulse() {
  const { data, isLoading, error, refetch } = usePipelinePulse()
  const { isDemoMode } = useDemoMode()
  const hasData = !!data?.lastRun
  useCardLoadingState({ isLoading: isLoading && !hasData, hasAnyData: hasData, isDemoData: isDemoMode })

  const streakLabel = useMemo(() => {
    if (!data) return '—'
    if (data.streakKind === 'mixed' || data.streak === 0) return 'No active streak'
    const s = data.streak === 1 ? '' : 's'
    return data.streakKind === 'success'
      ? `${data.streak} success${s} in a row`
      : `${data.streak} failure${s} in a row`
  }, [data])

  if (error && !hasData) {
    return (
      <div className="p-4 h-full flex items-center justify-center text-sm text-red-400">
        Failed to load release pulse. {error}
      </div>
    )
  }

  const { lastRun, recent, nextCron } = data
  const conclusion = lastRun?.conclusion ?? null
  const StatusIcon =
    conclusion === 'success' ? CheckCircle2
      : conclusion === 'failure' || conclusion === 'timed_out' ? XCircle
      : AlertTriangle
  const iconColor =
    conclusion === 'success' ? 'text-green-400'
      : conclusion === 'failure' || conclusion === 'timed_out' ? 'text-red-400'
      : 'text-yellow-400'

  return (
    <div className="p-4 h-full flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon className={cn('w-6 h-6 shrink-0', iconColor)} />
            <div className="text-lg font-semibold text-foreground truncate">
              {lastRun?.releaseTag ?? 'No release yet'}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            {lastRun && (
              <>
                <span>{relativeTime(lastRun.createdAt)}</span>
                <span>•</span>
                <span className="capitalize">{conclusion ?? 'unknown'}</span>
                <span>•</span>
                <span>run #{lastRun.runNumber}</span>
              </>
            )}
          </div>
        </div>
        {lastRun?.htmlUrl && lastRun.htmlUrl !== '#' && (
          <a
            href={lastRun.htmlUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
          >
            GitHub <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/30 p-3">
          <div className="text-xs text-muted-foreground">Streak</div>
          <div className={cn(
            'text-sm font-medium mt-1',
            data.streakKind === 'success' && 'text-green-400',
            data.streakKind === 'failure' && 'text-red-400',
          )}>
            {streakLabel}
          </div>
        </div>
        <div className="rounded-lg bg-secondary/30 p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> Next
          </div>
          <div className="text-sm font-medium mt-1 text-foreground">{formatCron(nextCron)}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Last {recent.length} nightlies
        </div>
        <div className="flex gap-1 h-6" role="list">
          {recent.map((r, i) => {
            const cls = r.conclusion ? CONCLUSION_CLASS[r.conclusion] : undefined
            return (
              <a
                key={`${r.createdAt}-${i}`}
                href={r.htmlUrl !== '#' ? r.htmlUrl : undefined}
                target="_blank"
                rel="noreferrer noopener"
                title={`${r.createdAt.slice(0, 10)} — ${r.conclusion ?? 'no run'}`}
                className={cn(
                  'flex-1 rounded-sm',
                  cls ?? 'bg-muted'
                )}
                style={cls ? undefined : { opacity: EMPTY_CELL_OPACITY }}
                role="listitem"
              />
            )
          })}
        </div>
      </div>

      {/* Manual refetch on isDemoMode click would be surprising — leave a
       *  subtle nudge for dev inspection. */}
      <button
        type="button"
        onClick={() => refetch()}
        className="mt-auto self-end text-[11px] text-muted-foreground hover:text-foreground"
      >
        Refresh
      </button>
    </div>
  )
}
