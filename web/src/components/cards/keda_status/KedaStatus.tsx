import { useMemo, useState } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  PauseCircle,
  XCircle,
  TrendingUp,
  Server,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { CardSearchInput } from '../../../lib/cards/CardComponents'
import { useKedaStatus } from './useKedaStatus'
import type { KedaScaledObject, KedaScaledObjectStatus, KedaTriggerType } from './demoData'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  KedaScaledObjectStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  ready: {
    label: 'Ready',
    color: 'text-green-400',
    icon: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  },
  degraded: {
    label: 'Degraded',
    color: 'text-yellow-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  },
  paused: {
    label: 'Paused',
    color: 'text-blue-400',
    icon: <PauseCircle className="w-3.5 h-3.5 text-blue-400" />,
  },
  error: {
    label: 'Error',
    color: 'text-red-400',
    icon: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  },
}

const TRIGGER_LABELS: Record<KedaTriggerType, string> = {
  kafka: 'Kafka',
  prometheus: 'Prometheus',
  rabbitmq: 'RabbitMQ',
  'aws-sqs-queue': 'SQS',
  'azure-servicebus': 'Service Bus',
  redis: 'Redis',
  cron: 'Cron',
  cpu: 'CPU',
  memory: 'Memory',
  external: 'External',
}

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('keda.syncedJustNow')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('keda.syncedJustNow')
    if (diff < hour) return t('keda.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('keda.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('keda.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatTile({
  icon,
  label,
  value,
  colorClass,
  borderClass,
}: {
  icon: React.ReactNode
  label: string
  value: number
  colorClass: string
  borderClass: string
}) {
  return (
    <div className={`p-3 rounded-lg bg-secondary/30 border ${borderClass}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-xs ${colorClass}`}>{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </div>
  )
}

function ReplicaBar({
  current,
  desired,
  max,
}: {
  current: number
  desired: number
  max: number
}) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0
  const targetPct = max > 0 ? Math.min((desired / max) * 100, 100) : 0
  const atTarget = current === desired
  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 rounded-full bg-muted overflow-visible">
        {/* filled bar */}
        <div
          className={`absolute h-full rounded-full transition-all ${atTarget ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
        {/* target marker */}
        {!atTarget && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-yellow-400 rounded-full"
            style={{ left: `${targetPct}%` }}
          />
        )}
      </div>
    </div>
  )
}

function ScaledObjectRow({ obj }: { obj: KedaScaledObject }) {
  const { t } = useTranslation('cards')
  const cfg = STATUS_CONFIG[obj.status]
  const triggers = obj.triggers || []
  const triggerLabel =
    triggers.length > 0
      ? TRIGGER_LABELS[triggers[0].type] ?? triggers[0].type
      : '—'
  const extraTriggers = triggers.length > 1 ? triggers.length - 1 : 0
  const triggerSource =
    triggers.length > 0 ? triggers[0].source : ''
  const currentVal =
    triggers.length > 0 ? triggers[0].currentValue : null
  const targetVal =
    triggers.length > 0 ? triggers[0].targetValue : null

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2 space-y-1.5">
      {/* Row 1: name + status + replicas */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {cfg.icon}
          <span className="text-xs font-medium truncate">{obj.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">
            {obj.currentReplicas}/{obj.maxReplicas}
          </span>
          <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Row 2: namespace + trigger */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{obj.namespace} › {obj.target}</span>
        <span className="shrink-0 ml-2">
          {triggerLabel}
          {triggerSource ? `: ${triggerSource}` : ''}
          {extraTriggers > 0 && (
            <span className="text-muted-foreground/60 ml-1">+{extraTriggers} {t('keda.moreTriggersLabel', 'more')}</span>
          )}
        </span>
      </div>

      {/* Row 3: replica bar + queue depth */}
      <div>
        <ReplicaBar
          current={obj.currentReplicas}
          desired={obj.desiredReplicas}
          max={obj.maxReplicas}
        />
        {currentVal !== null && targetVal !== null && (
          <div className="flex justify-between mt-0.5 text-xs text-muted-foreground tabular-nums">
            <span>{t('keda.queue', 'queue')}: {currentVal.toLocaleString()}</span>
            <span>{t('keda.target', 'target')}: {targetVal.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KedaStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useKedaStatus()
  const [search, setSearch] = useState('')

  // Derived stats
  const stats = useMemo(() => {
    const objs = data.scaledObjects || []
    return {
      total: objs.length,
      ready: objs.filter(o => o.status === 'ready').length,
      degradedOrError: objs.filter(o => o.status === 'degraded' || o.status === 'error').length,
      paused: objs.filter(o => o.status === 'paused').length,
    }
  }, [data.scaledObjects])

  // Guard against undefined nested data from API/cache
  const scaledObjects = useMemo(() => data.scaledObjects || [], [data.scaledObjects])
  const operatorPods = data.operatorPods || { ready: 0, total: 0 }

  // Filtered list (local search)
  const filteredObjects = useMemo(() => {
    if (!search.trim()) return scaledObjects
    const q = search.toLowerCase()
    return scaledObjects.filter(
      o =>
        o.name.toLowerCase().includes(q) ||
        o.namespace.toLowerCase().includes(q) ||
        o.target.toLowerCase().includes(q) ||
        (o.triggers || []).some(tr => tr.type.includes(q) || tr.source.toLowerCase().includes(q)),
    )
  }, [scaledObjects, search])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={120} height={28} />
          <Skeleton variant="rounded" width={80} height={20} />
        </div>
        <SkeletonStats className="grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('keda.fetchError', 'Failed to fetch KEDA status')}
        </p>
      </div>
    )
  }

  // ── Not installed ─────────────────────────────────────────────────────────
  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('keda.notInstalled', 'KEDA not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'keda.notInstalledHint',
            'No KEDA operator pods found. Deploy KEDA to enable event-driven autoscaling.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* ── Header: health badge + operator pods + last check ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}
          >
            {isHealthy ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isHealthy
              ? t('keda.healthy', 'Healthy')
              : t('keda.degraded', 'Degraded')}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {operatorPods.ready}/{operatorPods.total}{' '}
            {t('keda.operatorPods', 'pods')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* ── Stats grid ── */}
      {scaledObjects.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
            label={t('keda.total', 'Total')}
            value={stats.total + data.totalScaledJobs}
            colorClass="text-blue-400"
            borderClass="border-blue-500/20"
          />
          <StatTile
            icon={<CheckCircle className="w-4 h-4 text-green-400" />}
            label={t('keda.ready', 'Ready')}
            value={stats.ready}
            colorClass="text-green-400"
            borderClass="border-green-500/20"
          />
          <StatTile
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
            label={t('keda.issues', 'Issues')}
            value={stats.degradedOrError}
            colorClass="text-red-400"
            borderClass="border-red-500/20"
          />
          <StatTile
            icon={<PauseCircle className="w-4 h-4 text-blue-400" />}
            label={t('keda.paused', 'Paused')}
            value={stats.paused}
            colorClass="text-blue-400"
            borderClass="border-blue-500/20"
          />
        </div>
      )}

      {/* ── Search ── */}
      {scaledObjects.length > 0 && (
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('keda.searchPlaceholder', 'Search scaled objects…')}
        />
      )}

      {/* ── ScaledObjects list ── */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {filteredObjects.length > 0 ? (
          filteredObjects.map(obj => (
            <ScaledObjectRow key={`${obj.namespace}/${obj.name}`} obj={obj} />
          ))
        ) : scaledObjects.length === 0 ? (
          // Live mode: operator running but no ScaledObjects available via API
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1 py-6">
            <TrendingUp className="w-6 h-6 opacity-40" />
            <p className="text-sm">{t('keda.noScaledObjects', 'Operator running')}</p>
            <p className="text-xs text-center">
              {t(
                'keda.noScaledObjectsHint',
                'ScaledObject data requires the KEDA CRD API.',
              )}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {t('keda.noSearchResults', 'No scaled objects match your search.')}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {data.totalScaledJobs > 0 && (
        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
          +{data.totalScaledJobs} {data.totalScaledJobs === 1
            ? t('keda.scaledJob', 'ScaledJob')
            : t('keda.scaledJobs', 'ScaledJobs')}
        </div>
      )}
    </div>
  )
}
