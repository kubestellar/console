/**
 * gRPC Service Status Card
 *
 * Displays gRPC services, per-service RPS, p99 latency, and error rate.
 * Follows the envoy_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real gRPC Reflection / Channelz bridge lands, the hook's fetcher will
 * pick up live data automatically with no component changes.
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Network,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedGrpc } from '../../../hooks/useCachedGrpc'
import type { GrpcService } from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'
import { formatThroughput } from '../../../lib/cards/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const ERROR_RATE_DECIMALS = 2
const LATENCY_WARN_MS = 100
const LATENCY_DEGRADED_MS = 250
const ERROR_RATE_WARN_PCT = 0.5
const ERROR_RATE_CRIT_PCT = 2.0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latencyColor(p99Ms: number): string {
  if (p99Ms >= LATENCY_DEGRADED_MS) return 'text-red-400'
  if (p99Ms >= LATENCY_WARN_MS) return 'text-yellow-400'
  return 'text-green-400'
}

function errorColor(pct: number): string {
  if (pct >= ERROR_RATE_CRIT_PCT) return 'text-red-400'
  if (pct >= ERROR_RATE_WARN_PCT) return 'text-yellow-400'
  return 'text-green-400'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ServiceRow({ service }: { service: GrpcService }) {
  const isServing = service.status === 'serving'
  const statusClass = isServing
    ? 'bg-green-500/20 text-green-400'
    : service.status === 'not-serving'
      ? 'bg-red-500/20 text-red-400'
      : 'bg-yellow-500/20 text-yellow-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {isServing ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-foreground truncate">
            {service.name}
          </span>
        </div>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${statusClass}`}>
          {service.status}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {service.namespace} · {service.endpoints} endpoints
        </span>
        <span className="flex items-center gap-2 shrink-0 font-mono">
          <span className="text-cyan-400">{formatThroughput(service.rps)} rps</span>
          <span className={latencyColor(service.latencyP99Ms)}>
            {service.latencyP99Ms}ms p99
          </span>
          <span className={errorColor(service.errorRatePct)}>
            {service.errorRatePct.toFixed(ERROR_RATE_DECIMALS)}%
          </span>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GrpcStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedGrpc()

  const isHealthy = data.health === 'healthy'

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={90} height={20} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={5} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {t('grpcStatus.fetchError', 'Unable to fetch gRPC status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Network className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('grpcStatus.notInstalled', 'No gRPC services detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'grpcStatus.notInstalledHint',
            'No gRPC reflection endpoint reachable from the connected clusters.',
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
            ? t('grpcStatus.healthy', 'Healthy')
            : t('grpcStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('grpcStatus.services', 'Services')}
          value={`${data.summary.servingServices}/${data.summary.totalServices}`}
          colorClass={
            data.summary.servingServices === data.summary.totalServices
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('grpcStatus.totalRps', 'Total RPS')}
          value={formatThroughput(data.stats.totalRps)}
          colorClass="text-cyan-400"
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('grpcStatus.avgP99', 'Avg p99')}
          value={`${data.stats.avgLatencyP99Ms}ms`}
          colorClass={latencyColor(data.stats.avgLatencyP99Ms)}
          icon={<Clock className="w-4 h-4 text-yellow-400" />}
        />
        <MetricTile
          label={t('grpcStatus.endpoints', 'Endpoints')}
          value={formatThroughput(data.summary.totalEndpoints)}
          colorClass="text-foreground"
          icon={<Zap className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Service list */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('grpcStatus.sectionServices', 'gRPC services')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('grpcStatus.avgErrorRate', 'avg err')}:{' '}
              <span className={errorColor(data.stats.avgErrorRatePct)}>
                {data.stats.avgErrorRatePct.toFixed(ERROR_RATE_DECIMALS)}%
              </span>
            </span>
          </div>

          {data.services.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('grpcStatus.noServices', 'No gRPC services found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.services || []).map(service => (
                <ServiceRow
                  key={`${service.cluster}:${service.namespace}:${service.name}`}
                  service={service}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default GrpcStatus
