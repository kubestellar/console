/**
 * KServe Status Card
 *
 * KServe is a CNCF incubating model-serving platform on Kubernetes. It
 * surfaces AI / ML inference workloads as declarative `InferenceService`
 * custom resources. This card shows the KServe control plane health, the
 * discovered `InferenceService` list with per-service readiness, predictor
 * replica counts, canary traffic split, and serving throughput / latency.
 *
 * Follows the dapr_status / tuf_status / spiffe_status scaffolding pattern
 * for structure, styling, and loading/demo semantics.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real KServe bridge lands (`/api/kserve/status`), the hook's fetcher will
 * pick up live data automatically with no component changes.
 *
 * Source: kubestellar/console-marketplace#38
 */

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle,
  Gauge,
  Layers,
  RefreshCw,
  Server,
  Timer,
  XCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedKserve } from '../../../hooks/useCachedKserve'
import { cn } from '../../../lib/cn'
import type {
  KServeService,
  KServeServiceStatus,
} from '../../../lib/demo/kserve'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 4

// Cap how many InferenceServices we render inline on the card. Drill-downs
// surface the full list; the card itself stays within a consistent 6x4 grid
// footprint. Matches the pattern used by dapr_status / spiffe_status.
const MAX_SERVICES_DISPLAYED = 6

// Traffic split is reported as an integer percentage (0 - 100).
const FULL_TRAFFIC_PERCENT = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: KServeServiceStatus): string {
  const map: Record<KServeServiceStatus, string> = {
    ready: 'bg-green-500/20 text-green-400',
    'not-ready': 'bg-red-500/20 text-red-400',
    unknown: 'bg-yellow-500/20 text-yellow-400',
  }
  return map[status] ?? 'bg-secondary/40 text-muted-foreground'
}

function statusIconClass(status: KServeServiceStatus): string {
  const map: Record<KServeServiceStatus, string> = {
    ready: 'text-green-400',
    'not-ready': 'text-red-400',
    unknown: 'text-yellow-400',
  }
  return map[status] ?? 'text-muted-foreground'
}

function StatusIcon({ status }: { status: KServeServiceStatus }) {
  const className = cn('w-3.5 h-3.5 shrink-0', statusIconClass(status))
  if (status === 'ready') return <CheckCircle className={className} />
  if (status === 'not-ready') return <XCircle className={className} />
  return <AlertTriangle className={className} />
}

function statusLabel(
  status: KServeServiceStatus,
  t: TFunction<'cards'>,
): string {
  const map: Record<KServeServiceStatus, string> = {
    ready: t('kserveStatus.statusReady', 'Ready'),
    'not-ready': t('kserveStatus.statusNotReady', 'Not ready'),
    unknown: t('kserveStatus.statusUnknown', 'Unknown'),
  }
  return map[status] ?? status
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ServiceRow({
  service,
  t,
}: {
  service: KServeService
  t: TFunction<'cards'>
}) {
  const showTrafficSplit = service.trafficPercent < FULL_TRAFFIC_PERCENT
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <StatusIcon status={service.status} />
          <span className="text-xs font-medium font-mono truncate text-foreground">
            {service.name}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {service.namespace}
          </span>
        </div>
        <span
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
            statusBadgeClass(service.status),
          )}
        >
          {statusLabel(service.status, t)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Layers className="w-3 h-3" />
          {service.readyReplicas}/{service.desiredReplicas}{' '}
          {t('kserveStatus.replicas', 'replicas')}
        </span>
        <span className="flex items-center gap-1">
          <Gauge className="w-3 h-3" />
          {service.requestsPerSecond.toFixed(1)}{' '}
          {t('kserveStatus.rpsShort', 'rps')}
        </span>
        <span className="flex items-center gap-1">
          <Timer className="w-3 h-3" />
          {service.p95LatencyMs}
          {t('kserveStatus.msSuffix', 'ms')} {t('kserveStatus.p95Short', 'p95')}
        </span>
        {showTrafficSplit ? (
          <span className="ml-auto shrink-0 font-mono">
            {service.trafficPercent}%
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KServeStatus() {
  const { t } = useTranslation('cards')
  const {
    data,
    isRefreshing,
    error,
    showSkeleton,
    showEmptyState,
    isDemoData,
  } = useCachedKserve()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton
            variant="rounded"
            width={SKELETON_TITLE_WIDTH}
            height={SKELETON_TITLE_HEIGHT}
          />
          <Skeleton
            variant="rounded"
            width={SKELETON_BADGE_WIDTH}
            height={SKELETON_BADGE_HEIGHT}
          />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('kserveStatus.fetchError', 'Unable to fetch KServe status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed' && !isDemoData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <BrainCircuit className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('kserveStatus.notInstalled', 'KServe not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'kserveStatus.notInstalledHint',
            'No KServe controller pods found. Deploy KServe to monitor model-serving inference workloads.',
          )}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const services = data.services ?? []
  const displayedServices = services.slice(0, MAX_SERVICES_DISPLAYED)

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + controller pod status */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400',
          )}
        >
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy
            ? t('kserveStatus.healthy', 'Healthy')
            : t('kserveStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw
            className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')}
          />
          <span>
            <Server className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            {data.controllerPods.ready}/{data.controllerPods.total}{' '}
            {t('kserveStatus.controllerPods', 'controllers')}
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('kserveStatus.services', 'Services')}
          value={data.summary.totalServices}
          colorClass="text-cyan-400"
          icon={<BrainCircuit className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('kserveStatus.readyServices', 'Ready')}
          value={data.summary.readyServices}
          colorClass={
            data.summary.readyServices > 0 ? 'text-green-400' : 'text-muted-foreground'
          }
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('kserveStatus.requestsPerSecond', 'RPS')}
          value={data.summary.totalRequestsPerSecond.toFixed(1)}
          colorClass="text-purple-400"
          icon={<Gauge className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('kserveStatus.p95Latency', 'p95')}
          value={`${data.summary.avgP95LatencyMs}${t('kserveStatus.msSuffix', 'ms')}`}
          colorClass={
            data.summary.avgP95LatencyMs > 0 ? 'text-yellow-400' : 'text-muted-foreground'
          }
          icon={<Timer className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* InferenceServices list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('kserveStatus.sectionServices', 'Inference services')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {services.length}
            </span>
          </div>

          {services.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('kserveStatus.noServices', 'No inference services reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedServices ?? []).map(service => (
                <ServiceRow key={service.id} service={service} t={t} />
              ))}
            </div>
          )}

          {data.lastCheckTime ? (
            <div className="text-[11px] text-muted-foreground text-right">
              {formatTimeAgo(data.lastCheckTime)}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

export default KServeStatus
