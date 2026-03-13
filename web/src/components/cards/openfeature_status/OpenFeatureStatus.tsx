import { CheckCircle, AlertTriangle, RefreshCw, Flag, Server, Activity } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { useOpenFeatureStatus } from './useOpenFeatureStatus'
import { MetricTile } from '../../../lib/cards/CardComponents'

const ERROR_RATE_WARNING_PCT = 5 // Show warning when error rate exceeds this percentage

/** Skeleton placeholder heights in pixels */
const SKELETON_HEADER_HEIGHT = 36
const SKELETON_METRIC_HEIGHT = 80
const SKELETON_TABLE_HEIGHT = 120


function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('openFeature.syncedJustNow')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('openFeature.syncedJustNow')
    if (diff < hour) return t('openFeature.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('openFeature.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('openFeature.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

export function OpenFeatureStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState, isRefreshing } = useOpenFeatureStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={SKELETON_HEADER_HEIGHT} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={SKELETON_METRIC_HEIGHT} className="flex-1" />
          <Skeleton variant="rounded" height={SKELETON_METRIC_HEIGHT} className="flex-1" />
          <Skeleton variant="rounded" height={SKELETON_METRIC_HEIGHT} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={SKELETON_TABLE_HEIGHT} />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('openFeature.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Flag className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('openFeature.notInstalled')}</p>
        <p className="text-xs text-center max-w-xs">
          {t('openFeature.notInstalledHint')}
        </p>
      </div>
    )
  }

  const providers = data.providers || []

  const isHealthy = data.health === 'healthy'
  const isDegraded = data.health === 'degraded'

  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-orange-500/15 text-orange-400'

  const healthLabel = isHealthy
    ? t('openFeature.healthy')
    : isDegraded
      ? t('openFeature.degraded')
      : t('openFeature.notInstalled')

  const hasFlags = data.featureFlags.total > 0
  const hasEvaluations = data.totalEvaluations > 0

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
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

      {/* Metric tiles */}
      <div className="flex gap-3">
        <MetricTile
          label={t('openFeature.providers')}
          value={providers.length.toString()}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('openFeature.flags')}
          value={hasFlags ? `${data.featureFlags.enabled}/${data.featureFlags.total}` : '0'}
          colorClass={hasFlags ? 'text-green-400' : 'text-muted-foreground'}
          icon={<Flag className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('openFeature.evaluations')}
          value={hasEvaluations ? data.totalEvaluations.toLocaleString() : '0'}
          colorClass={hasEvaluations ? 'text-cyan-400' : 'text-muted-foreground'}
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
        />
      </div>

      {/* Provider status list */}
      {providers.length > 0 && (
        <div className="flex-1 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t('openFeature.providerStatus')}
          </p>
          <div className="space-y-2">
            {providers.map((provider) => {
              const statusColor =
                provider.status === 'healthy'
                  ? 'text-green-400'
                  : provider.status === 'degraded'
                    ? 'text-orange-400'
                    : 'text-red-400'

              const statusLabel = String(
                provider.status === 'healthy'
                  ? t('openFeature.healthy')
                  : provider.status === 'degraded'
                    ? t('openFeature.degraded')
                    : provider.status === 'unhealthy'
                      ? t('openFeature.unhealthy')
                      : provider.status
              )

              return (
                <div
                  key={provider.name}
                  className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${statusColor.replace('text-', 'bg-')}`} />
                    <span className="text-sm font-medium text-foreground">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {provider.evaluations > 0 && (
                      <span>{provider.evaluations.toLocaleString()} {t('openFeature.evals')}</span>
                    )}
                    {provider.cacheHitRate > 0 && (
                      <span>{provider.cacheHitRate.toFixed(1)}% {t('openFeature.cache')}</span>
                    )}
                    <span className={`text-xs font-medium ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error rate warning */}
      {hasFlags && data.featureFlags.errorRate > ERROR_RATE_WARNING_PCT && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <span className="text-xs text-orange-400">
            {t('openFeature.highErrorRate', { rate: data.featureFlags.errorRate.toFixed(1) })}
          </span>
        </div>
      )}

      {/* Footer link */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://openFeature.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          {t('openFeature.learnMore')} →
        </a>
      </div>
    </div>
  )
}
