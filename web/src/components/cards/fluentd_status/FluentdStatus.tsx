import { CheckCircle, AlertTriangle, RefreshCw, Layers, Activity, RotateCcw, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { useFluentdStatus } from './useFluentdStatus'
import type { FluentdOutputPlugin } from './demoData'

function useFluentdRelativeTime() {
  const { t } = useTranslation('cards')

  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('fluentd.syncedJustNow')

    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) return t('fluentd.syncedJustNow')
    if (diff < hour) return t('fluentd.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('fluentd.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('fluentd.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

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

export function FluentdStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFluentdRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useFluentdStatus()

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
        <p className="text-sm text-red-400">{t('fluentd.fetchError', 'Failed to fetch Fluentd status')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Layers className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('fluentd.notInstalled', 'Fluentd not detected')}</p>
        <p className="text-xs text-center max-w-xs">
          {t('fluentd.notInstalledHint', 'No Fluentd pods found. Deploy Fluentd as a DaemonSet to monitor log pipelines.')}
        </p>
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
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${healthColorClass}`}>
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {healthLabel}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isRefreshing && <RefreshCw className="w-3 h-3 animate-spin" />}
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
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
          <div className="flex items-center justify-between mb-1">
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
                className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
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
