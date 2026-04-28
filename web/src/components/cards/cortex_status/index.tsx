/**
 * Cortex Status Card
 *
 * Displays Cortex (CNCF incubating — horizontally scalable, multi-tenant,
 * long-term Prometheus) microservice pod health plus core ingestion and
 * query metrics: active series, ingestion rate (samples/sec), query rate
 * (queries/sec), and tenant count.
 *
 * Follows the dapr_status / tuf_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Cortex bridge lands, the hook's fetcher will pick up live data
 * automatically with no component changes.
 *
 * Source: kubestellar/console-marketplace#35
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Database,
  Layers,
  RefreshCw,
  Server,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedCortex } from '../../../hooks/useCachedCortex'
import type {
  CortexComponentName,
  CortexComponentPod,
} from '../../../lib/demo/cortex'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 6

// Cortex has six canonical top-level components (distributor, ingester,
// querier, store-gateway, ruler, alertmanager) — used for skeleton row
// pre-allocation and rendering hints.
const CORTEX_COMPONENT_COUNT = 6

// Numeric formatting thresholds — keep compact labels readable.
const THOUSAND = 1_000
const MILLION = 1_000_000
const BILLION = 1_000_000_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compact display for large counts (e.g. "4.25M", "125K"). */
function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  if (value >= BILLION) return `${(value / BILLION).toFixed(2)}B`
  if (value >= MILLION) return `${(value / MILLION).toFixed(2)}M`
  if (value >= THOUSAND) return `${(value / THOUSAND).toFixed(1)}K`
  return String(Math.round(value))
}

function componentLabel(
  name: CortexComponentName,
  t: TFunction<'cards'>,
): string {
  // Literal Record — every component name gets a translated label.
  const map: Record<CortexComponentName, string> = {
    distributor: t('cortexStatus.componentDistributor', 'Distributor'),
    ingester: t('cortexStatus.componentIngester', 'Ingester'),
    querier: t('cortexStatus.componentQuerier', 'Querier'),
    'store-gateway': t('cortexStatus.componentStoreGateway', 'Store gateway'),
    ruler: t('cortexStatus.componentRuler', 'Ruler'),
    alertmanager: t('cortexStatus.componentAlertmanager', 'Alertmanager'),
  }
  return map[name] ?? name
}

function componentColor(name: CortexComponentName): string {
  // Literal Record so every component gets a colour without falling back
  // to a muted default and looking "missing" on the card.
  const map: Record<CortexComponentName, string> = {
    distributor: 'text-blue-400',
    ingester: 'text-emerald-400',
    querier: 'text-violet-400',
    'store-gateway': 'text-cyan-400',
    ruler: 'text-amber-400',
    alertmanager: 'text-rose-400',
  }
  return map[name] ?? 'text-muted-foreground'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ComponentRow({
  pod,
  t,
}: {
  pod: CortexComponentPod
  t: TFunction<'cards'>
}) {
  const isRunning =
    pod.status === 'running' && pod.replicasReady === pod.replicasDesired
  const statusClass = isRunning
    ? 'bg-green-500/20 text-green-400'
    : pod.status === 'pending'
      ? 'bg-yellow-500/20 text-yellow-400'
      : 'bg-red-500/20 text-red-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        {isRunning ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        )}
        <span
          className={`text-xs font-medium truncate ${componentColor(pod.name)}`}
        >
          {componentLabel(pod.name, t)}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0 truncate">
          {pod.namespace}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-mono text-muted-foreground">
          {pod.replicasReady}/{pod.replicasDesired}
        </span>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full ${statusClass}`}
        >
          {pod.status}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CortexStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } =
    useCachedCortex()

  const isHealthy = data.health === 'healthy'
  const components = data.components ?? []

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
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
          {t('cortexStatus.fetchError', 'Unable to fetch Cortex status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Database className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('cortexStatus.notInstalled', 'Cortex not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'cortexStatus.notInstalledHint',
            'No Cortex services reachable from the connected clusters. Deploy Cortex to store long-term Prometheus data.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy
            ? t('cortexStatus.healthy', 'Healthy')
            : t('cortexStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>
            {t('cortexStatus.version', 'version')}:{' '}
            <span className="text-foreground font-mono">{data.version}</span>
            {' · '}
            {formatTimeAgo(data.lastCheckTime)}
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('cortexStatus.pods', 'Pods')}
          value={`${data.summary.runningPods}/${data.summary.totalPods}`}
          colorClass={
            data.summary.runningPods === data.summary.totalPods
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('cortexStatus.activeSeries', 'Active series')}
          value={formatCompactNumber(data.metrics.activeSeries)}
          colorClass="text-emerald-400"
          icon={<Activity className="w-4 h-4 text-emerald-400" />}
        />
        <MetricTile
          label={t('cortexStatus.ingestionRate', 'Ingest/s')}
          value={formatCompactNumber(data.metrics.ingestionRatePerSec)}
          colorClass="text-violet-400"
          icon={<BarChart3 className="w-4 h-4 text-violet-400" />}
        />
        <MetricTile
          label={t('cortexStatus.tenants', 'Tenants')}
          value={data.metrics.tenantCount}
          colorClass="text-cyan-400"
          icon={<Users className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Query rate + component count strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('cortexStatus.queryRate', 'Queries/s')}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {formatCompactNumber(data.metrics.queryRatePerSec)}
            </div>
          </div>
        </div>
        <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center gap-2">
          <Layers className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('cortexStatus.componentsHealthy', 'Components healthy')}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {data.summary.runningComponents}/{data.summary.totalComponents}
            </div>
          </div>
        </div>
      </div>

      {/* Component list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cortexStatus.sectionComponents', 'Microservices')}
            </h4>
          </div>

          {components.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('cortexStatus.noComponents', 'No Cortex microservices reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(components ?? [])
                .slice(0, CORTEX_COMPONENT_COUNT)
                .map(pod => (
                  <ComponentRow
                    key={`${pod.cluster}:${pod.namespace}:${pod.name}`}
                    pod={pod}
                    t={t}
                  />
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default CortexStatus
