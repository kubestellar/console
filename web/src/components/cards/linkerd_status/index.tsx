/**
 * Linkerd Service Mesh Status Card
 *
 * Displays Linkerd meshed deployments with success rate, RPS, and p99 latency.
 * Follows the envoy_status / contour_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Linkerd Viz bridge lands, the hook's fetcher will pick up live data
 * automatically with no component changes.
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Gauge,
  Network,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedLinkerd } from '../../../hooks/useCachedLinkerd'
import type { LinkerdMeshedDeployment } from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'
import { formatThroughput } from '../../../lib/cards/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const SUCCESS_RATE_DECIMALS = 2
const SUCCESS_RATE_WARN_THRESHOLD_PCT = 99.0
const SUCCESS_RATE_CRIT_THRESHOLD_PCT = 95.0
const P99_LATENCY_WARN_MS = 30
const P99_LATENCY_CRIT_MS = 100

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successRateColorClass(pct: number): string {
  if (pct >= SUCCESS_RATE_WARN_THRESHOLD_PCT) return 'text-green-400'
  if (pct >= SUCCESS_RATE_CRIT_THRESHOLD_PCT) return 'text-yellow-400'
  return 'text-red-400'
}

function latencyColorClass(ms: number): string {
  if (ms <= P99_LATENCY_WARN_MS) return 'text-green-400'
  if (ms <= P99_LATENCY_CRIT_MS) return 'text-yellow-400'
  return 'text-red-400'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function DeploymentRow({ deployment }: { deployment: LinkerdMeshedDeployment }) {
  const isFullyMeshed = deployment.status === 'meshed'
  const statusClass = isFullyMeshed
    ? 'bg-green-500/20 text-green-400'
    : deployment.status === 'partial'
      ? 'bg-yellow-500/20 text-yellow-400'
      : 'bg-red-500/20 text-red-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {isFullyMeshed ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-foreground truncate">
            {deployment.namespace}/{deployment.deployment}
          </span>
        </div>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${statusClass}`}>
          {deployment.meshedPods}/{deployment.totalPods}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
        <span className={successRateColorClass(deployment.successRatePct)}>
          {deployment.successRatePct.toFixed(SUCCESS_RATE_DECIMALS)}%
        </span>
        <span className="text-muted-foreground">
          {formatThroughput(deployment.requestsPerSecond)} rps
        </span>
        <span className={latencyColorClass(deployment.p99LatencyMs)}>
          p99 {deployment.p99LatencyMs}ms
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LinkerdStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedLinkerd()

  const isHealthy = data.health === 'healthy'

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
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
          {t('linkerdStatus.fetchError', 'Unable to fetch Linkerd status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('linkerdStatus.notInstalled', 'Linkerd not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'linkerdStatus.notInstalledHint',
            'No Linkerd control plane reachable from the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('linkerdStatus.healthy', 'Healthy')
            : t('linkerdStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('linkerdStatus.meshedPods', 'Meshed pods')}
          value={`${data.summary.totalMeshedPods}/${data.summary.totalPods}`}
          colorClass={
            data.summary.totalMeshedPods === data.summary.totalPods
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Network className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('linkerdStatus.successRate', 'Success rate')}
          value={`${data.stats.avgSuccessRatePct.toFixed(SUCCESS_RATE_DECIMALS)}%`}
          colorClass={successRateColorClass(data.stats.avgSuccessRatePct)}
          icon={<Gauge className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('linkerdStatus.rps', 'Requests/s')}
          value={formatThroughput(data.stats.totalRps)}
          colorClass="text-cyan-400"
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('linkerdStatus.p99Latency', 'Avg p99')}
          value={`${data.stats.avgP99LatencyMs}ms`}
          colorClass={latencyColorClass(data.stats.avgP99LatencyMs)}
          icon={<Zap className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Meshed deployments list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('linkerdStatus.sectionDeployments', 'Meshed deployments')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('linkerdStatus.controlPlane', 'control plane')}:{' '}
              <span className="text-foreground">{data.stats.controlPlaneVersion}</span>
            </span>
          </div>

          {data.deployments.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('linkerdStatus.noDeployments', 'No meshed deployments found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.deployments || []).map(deployment => (
                <DeploymentRow
                  key={`${deployment.cluster}:${deployment.namespace}:${deployment.deployment}`}
                  deployment={deployment}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default LinkerdStatus
