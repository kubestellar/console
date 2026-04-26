import {
  AlertTriangle,
  Server,
  RefreshCw,
  ArrowRightLeft,
  Clock,
  Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { useFailoverTimeline } from './useFailoverTimeline'
import { formatTimeAgo } from '../../../lib/formatters'
import type { FailoverEvent, FailoverEventType, FailoverSeverity } from './demoData'
import { MINUTES_PER_HOUR, HOURS_PER_DAY, MS_PER_MINUTE } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Severity styling
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  FailoverSeverity,
  { dotColor: string; borderColor: string; textColor: string }
> = {
  critical: {
    dotColor: 'bg-red-500',
    borderColor: 'border-red-500/40',
    textColor: 'text-red-400' },
  warning: {
    dotColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500/40',
    textColor: 'text-yellow-400' },
  info: {
    dotColor: 'bg-blue-500',
    borderColor: 'border-blue-500/40',
    textColor: 'text-blue-400' } }

const EVENT_TYPE_CONFIG: Record<
  FailoverEventType,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  cluster_down: {
    label: 'Cluster Down',
    icon: <Server className="w-3 h-3" />,
    badgeClass: 'bg-red-500/15 text-red-400' },
  binding_reschedule: {
    label: 'Reschedule',
    icon: <ArrowRightLeft className="w-3 h-3" />,
    badgeClass: 'bg-yellow-500/15 text-yellow-400' },
  cluster_recovery: {
    label: 'Recovery',
    icon: <Shield className="w-3 h-3" />,
    badgeClass: 'bg-blue-500/15 text-blue-400' },
  replica_rebalance: {
    label: 'Rebalance',
    icon: <RefreshCw className="w-3 h-3" />,
    badgeClass: 'bg-blue-500/15 text-blue-400' } }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTimeSinceFailover(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'None recorded'
  const delta = Date.now() - new Date(isoTimestamp).getTime()
  if (delta < MS_PER_MINUTE) return 'just now'
  const totalMinutes = Math.floor(delta / MS_PER_MINUTE)
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes}m ago`
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  if (hours < HOURS_PER_DAY) return `${hours}h ago`
  const days = Math.floor(hours / HOURS_PER_DAY)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimelineEvent({ event }: { event: FailoverEvent }) {
  const severityCfg = SEVERITY_CONFIG[event.severity]
  const typeCfg = EVENT_TYPE_CONFIG[event.eventType]

  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      {/* Vertical line */}
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${severityCfg.dotColor}`} />
        <div className="w-px flex-1 bg-border/50 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Row 1: type badge + timestamp */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeCfg.badgeClass}`}>
            {typeCfg.icon}
            {typeCfg.label}
          </div>
          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(event.timestamp)}
          </span>
        </div>

        {/* Row 2: cluster + workload */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Server className="w-3 h-3 text-muted-foreground" />
            {event.cluster}
          </span>
          {event.workload && (
            <span className="text-muted-foreground truncate">
              / {event.workload}
            </span>
          )}
        </div>

        {/* Row 3: details */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {event.details}
        </p>

        {/* Row 4: relative time */}
        <span className={`text-xs ${severityCfg.textColor}`}>
          {formatTimeAgo(event.timestamp)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FailoverTimeline() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useFailoverTimeline()

  // Guard arrays
  const events = data.events || []

  const activeClusters = data.activeClusters ?? 0
  const totalClusters = data.totalClusters ?? 0

  // ── Loading ───────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={160} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2" />
        <SkeletonList items={4} className="flex-1" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('failoverTimeline.fetchError', 'Failed to fetch failover timeline')}
        </p>
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (events.length === 0 && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('failoverTimeline.noEvents', 'No failover events')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'failoverTimeline.noEventsHint',
            'No cluster failover or binding reschedule events detected. This is good — your clusters are stable.',
          )}
        </p>
      </div>
    )
  }

  const allClustersHealthy = activeClusters === totalClusters && totalClusters > 0
  const healthColorClass = allClustersHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}>
            <Server className="w-4 h-4" />
            {activeClusters}/{totalClusters}{' '}
            {t('failoverTimeline.clusters', 'Clusters')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t('failoverTimeline.lastFailover', 'Last failover:')}{' '}
            {formatTimeSinceFailover(data.lastFailover)}
          </span>
          <RefreshCw className={`w-3 h-3 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-secondary/30 border border-red-500/20">
          <span className="text-xs text-red-400 block">
            {t('failoverTimeline.clusterDown', 'Down Events')}
          </span>
          <span className="text-lg font-bold text-foreground">
            {events.filter(e => e.eventType === 'cluster_down').length}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 border border-yellow-500/20">
          <span className="text-xs text-yellow-400 block">
            {t('failoverTimeline.reschedules', 'Reschedules')}
          </span>
          <span className="text-lg font-bold text-foreground">
            {events.filter(e => e.eventType === 'binding_reschedule').length}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30 border border-blue-500/20">
          <span className="text-xs text-blue-400 block">
            {t('failoverTimeline.recoveries', 'Recoveries')}
          </span>
          <span className="text-lg font-bold text-foreground">
            {events.filter(e => e.eventType === 'cluster_recovery').length}
          </span>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-y-auto pr-1">
        {events.map((event, idx) => (
          <TimelineEvent key={`${event.timestamp}-${event.eventType}-${idx}`} event={event} />
        ))}
      </div>
    </div>
  )
}
