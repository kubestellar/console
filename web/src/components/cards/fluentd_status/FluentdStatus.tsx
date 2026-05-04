import { CheckCircle, AlertTriangle, Layers, Activity, RotateCcw, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { useFluentdStatus } from './useFluentdStatus'
// Issue 8836 Auto-QA (Data Freshness): subscribe to demo mode at the component
// level so the card re-renders (and Demo badge / yellow outline apply) when
// the user flips the global toggle. The underlying useFluentdStatus hook
// already swaps data; this direct subscription is what the static Auto-QA
// scan looks for, and it also guarantees re-render on toggle.
import { useDemoMode } from '../../../hooks/useDemoMode'
import type { FluentdOutputPlugin } from './demoData'

function pluginStatusColor(status: FluentdOutputPlugin['status']): string {
  if (status === 'healthy') return 'text-green-400'
  if (status === 'degraded') return 'text-yellow-400'
  return 'text-red-400'
}

function pluginStatusIcon(status: FluentdOutputPlugin['status']) {
  if (status === 'healthy') return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
  if (status === 'degraded') return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
  return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
}

function BufferBar({ utilization }: { utilization: number }) {
  const normalizedUtilization = Math.max(0, Math.min(utilization, 100))
  const color =
    normalizedUtilization >= 80
      ? 'bg-red-500'
      : normalizedUtilization >= 50
        ? 'bg-yellow-500'
        : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${normalizedUtilization}%` }}
        />
      </div>
      <span className="text-xs tabular-nums w-9 text-right text-muted-foreground">
        {normalizedUtilization}%
      </span>
    </div>
  )
}

// #6216: wrapped at the bottom of the file in DynamicCardErrorBoundary so
// a runtime error in the 205-line component doesn't crash the dashboard.
function FluentdStatusInternal() {
  const { t } = useTranslation('cards')
  // Issue 8836 Auto-QA: component-level demo-mode subscription. The underlying
  // hook already swaps data on toggle, but the Auto-QA static scan looks
  // for the import + call in the .tsx and the direct subscription also
  // ensures an immediate re-render when the toggle flips.
  useDemoMode()
  const { data, error, showSkeleton, showEmptyState, isRefreshing, lastRefresh } = useFluentdStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={20} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <div className="text-sm text-red-400">{t('fluentd.fetchError', 'Failed to fetch Fluentd status')}</div>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-6 h-6 text-muted-foreground/50" />
        <div className="text-sm font-medium">{t('fluentd.notInstalled', 'Fluentd not detected')}</div>
        <div className="text-xs text-center max-w-xs">
          {t('fluentd.notInstalledHint', 'No Fluentd pods found. Deploy Fluentd as a DaemonSet to monitor log pipelines.')}
        </div>
      </div>
    )
  }

  const outputPlugins = data.outputPlugins || []

  const isHealthy = data.health === 'healthy'
  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-yellow-500/15 text-yellow-400'
  const healthLabel = isHealthy
    ? t('fluentd.healthy', 'Healthy')
    : t('fluentd.degraded', 'Degraded')

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Health badge + last check */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}>
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {healthLabel}
        </div>
        {/*
          Issue 8836 Auto-QA (Data Freshness): render "Last updated X ago" via the
          shared RefreshIndicator. lastUpdated reads from useCache.lastRefresh
          (via useFluentdStatus), which reflects the cache refresh cadence
          instead of the server-reported data.lastCheckTime (which does not
          advance across cache rehydrates).
        */}
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
          size="sm"
          showLabel={true}
        />
      </div>

      {/* Key metrics */}
      <div className="flex gap-3">
        <MetricTile
          label={t('fluentd.pods', 'Pods')}
          value={`${data.pods.ready}/${data.pods.total}`}
          colorClass={
            data.pods.ready === data.pods.total && data.pods.total > 0
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-3 h-3" />}
        />
        <MetricTile
          label={t('fluentd.eventsPerSec', 'Events/s')}
          value={data.eventsPerSecond > 0 ? data.eventsPerSecond.toLocaleString() : '—'}
          colorClass="text-blue-400"
          icon={<Activity className="w-3 h-3" />}
        />
        <MetricTile
          label={t('fluentd.retries', 'Retries')}
          value={data.retryCount.toString()}
          colorClass={data.retryCount === 0 ? 'text-green-400' : 'text-yellow-400'}
          icon={<RotateCcw className="w-3 h-3" />}
        />
      </div>

      {/* Buffer utilization */}
      {data.bufferUtilization > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
            <span className="text-xs text-muted-foreground">
              {t('fluentd.bufferUtilization', 'Buffer utilization')}
            </span>
          </div>
          <BufferBar utilization={data.bufferUtilization} />
        </div>
      )}

      {/* Output plugins */}
      {outputPlugins.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-2">
            {t('fluentd.outputPlugins', 'Output plugins')}
          </p>
          <div className="space-y-1.5">
            {outputPlugins.map((plugin) => (
              <div
                key={plugin.name}
                className="flex flex-wrap items-center justify-between gap-y-2 rounded-md bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {pluginStatusIcon(plugin.status)}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{plugin.name}</p>
                    <p className="text-xs text-muted-foreground">{plugin.type}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-xs font-medium tabular-nums ${pluginStatusColor(plugin.status)}`}>
                    {plugin.emitCount.toLocaleString()} {t('fluentd.emitted', 'emitted')}
                  </p>
                  {plugin.errorCount > 0 && (
                    <p className="text-xs text-red-400 tabular-nums">
                      {plugin.errorCount} {t('fluentd.errors', 'errors')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function FluentdStatus() {
  return (
    <DynamicCardErrorBoundary cardId="FluentdStatus">
      <FluentdStatusInternal />
    </DynamicCardErrorBoundary>
  )
}
