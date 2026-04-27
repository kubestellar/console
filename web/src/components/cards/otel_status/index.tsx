/**
 * OpenTelemetry Status Card
 *
 * Shows OpenTelemetry (CNCF incubating) Collector instances across
 * connected clusters: collector state, pipeline health (traces / metrics /
 * logs), receiver & exporter mix, and counters for dropped telemetry and
 * exporter errors. Demo fallback is used when OTel Collectors are not
 * installed or the user is in demo mode.
 */

import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Radio,
  Send,
  Telescope,
} from 'lucide-react'
import { useCachedOtel } from '../../../hooks/useCachedOtel'
import { useCardLoadingState } from '../CardDataContext'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type { OtelCollector } from '../../../lib/demo/otel'
import { getHealthBadgeClasses } from '../../../lib/cards/statusColors'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const COLLECTOR_PAGE_SIZE = 5
const RECEIVER_BADGE_LIMIT = 4
const EXPORTER_BADGE_LIMIT = 4
const PIPELINE_BADGE_LIMIT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  return n.toLocaleString()
}

function collectorIsHealthy(c: OtelCollector): boolean {
  if (c.state !== 'Running') return false
  if (c.exportErrors > 0) return false
  return (c.pipelines ?? []).every(p => p.healthy)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OtelStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedOtel()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' still counts as "we have data" so the card isn't stuck in skeleton
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalCollectors > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <SkeletonCardWithRefresh showStats={true} rows={COLLECTOR_PAGE_SIZE} />
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          icon={<Telescope className="w-8 h-8 text-muted-foreground/40" />}
          title={t('otelStatus.notInstalled', 'OpenTelemetry not detected')}
          description={t(
            'otelStatus.notInstalledHint',
            'No OpenTelemetry Collector pods found on connected clusters. Deploy the OTel Collector to monitor traces, metrics, and logs.',
          )}
        />
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const collectors = (data.collectors ?? []).slice(0, COLLECTOR_PAGE_SIZE)
  const receivers = (data.summary.uniqueReceivers ?? []).slice(0, RECEIVER_BADGE_LIMIT)
  const exporters = (data.summary.uniqueExporters ?? []).slice(0, EXPORTER_BADGE_LIMIT)
  const extraReceivers = Math.max(
    0,
    (data.summary.uniqueReceivers ?? []).length - RECEIVER_BADGE_LIMIT,
  )
  const extraExporters = Math.max(
    0,
    (data.summary.uniqueExporters ?? []).length - EXPORTER_BADGE_LIMIT,
  )

  const droppedTotal =
    data.summary.totalSpansDropped +
    data.summary.totalMetricsDropped +
    data.summary.totalLogsDropped

  return (
    <div className="h-full flex flex-col min-h-card gap-4 overflow-hidden animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            getHealthBadgeClasses(isHealthy),
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('otelStatus.healthy', 'Healthy')
            : t('otelStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('otelStatus.collectors', {
              count: data.summary.totalCollectors,
              defaultValue: '{{count}} collectors',
            })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('otelStatus.running', 'Running')}
          value={data.summary.runningCollectors}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('otelStatus.degradedCount', 'Degraded')}
          value={data.summary.degradedCollectors}
          colorClass={data.summary.degradedCollectors > 0 ? 'text-yellow-400' : 'text-green-400'}
          icon={
            data.summary.degradedCollectors > 0 ? (
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
        <MetricTile
          label={t('otelStatus.pipelines', 'Pipelines')}
          value={`${data.summary.healthyPipelines}/${data.summary.totalPipelines}`}
          colorClass="text-cyan-400"
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('otelStatus.dropped', 'Dropped')}
          value={formatCount(droppedTotal)}
          colorClass={droppedTotal > 0 ? 'text-red-400' : 'text-green-400'}
          icon={
            droppedTotal > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
      </div>

      {(receivers.length > 0 || exporters.length > 0) && (
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-2">
          {receivers.length > 0 && (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                <Radio className="w-3 h-3" />
                {t('otelStatus.receivers', 'Receivers')}
              </div>
              <div className="flex flex-wrap gap-1">
                {receivers.map(r => (
                  <span
                    key={r}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono"
                  >
                    {r}
                  </span>
                ))}
                {extraReceivers > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">
                    +{extraReceivers}
                  </span>
                )}
              </div>
            </div>
          )}

          {exporters.length > 0 && (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                <Send className="w-3 h-3" />
                {t('otelStatus.exporters', 'Exporters')}
              </div>
              <div className="flex flex-wrap gap-1">
                {exporters.map(e => (
                  <span
                    key={e}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-mono"
                  >
                    {e}
                  </span>
                ))}
                {extraExporters > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">
                    +{extraExporters}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5 overflow-y-auto scrollbar-thin pr-0.5">
        {collectors.length === 0 ? (
          <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
            {t('otelStatus.noCollectors', 'No OpenTelemetry Collectors reporting.')}
          </div>
        ) : (
          collectors.map(collector => {
            const healthy = collectorIsHealthy(collector)
            const pipelines = (collector.pipelines ?? []).slice(0, PIPELINE_BADGE_LIMIT)
            const extraPipelines = Math.max(
              0,
              (collector.pipelines ?? []).length - PIPELINE_BADGE_LIMIT,
            )
            return (
              <div
                key={`${collector.cluster}:${collector.namespace}:${collector.name}`}
                className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    {healthy ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate font-mono">
                      {collector.name}
                    </span>
                    {collector.cluster && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {collector.cluster}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
                      healthy
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400',
                    )}
                  >
                    {collector.state}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {pipelines.map(p => (
                    <span
                      key={`${collector.name}:${p.name}`}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-mono',
                        p.healthy
                          ? 'bg-secondary/50 text-foreground/80'
                          : 'bg-red-500/15 text-red-300',
                      )}
                    >
                      {p.signal}:{p.name}
                    </span>
                  ))}
                  {extraPipelines > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground">
                      +{extraPipelines}
                    </span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate">
                    {t('otelStatus.mode', 'Mode')}: {collector.mode}
                    {collector.version ? ` · v${collector.version}` : ''}
                  </span>
                  <span
                    className={cn(
                      'shrink-0',
                      collector.exportErrors > 0 ? 'text-red-400' : 'text-green-400',
                    )}
                  >
                    {t('otelStatus.exportErrors', {
                      count: collector.exportErrors,
                      defaultValue: '{{count}} export errors',
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default OtelStatus
