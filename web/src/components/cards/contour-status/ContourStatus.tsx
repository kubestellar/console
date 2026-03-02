import { CheckCircle, AlertTriangle, RefreshCw, Server, Shield, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { useContourStatus } from './useContourStatus'
import { MetricTile } from '../../../lib/cards/CardComponents'

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('contour.syncedJustNow')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('contour.syncedJustNow')
    if (diff < hour) return t('contour.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('contour.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('contour.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

export function ContourStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState } = useContourStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('contour.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Globe className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('contour.notInstalled')}</p>
        <p className="text-xs text-center max-w-xs">{t('contour.notInstalledHint')}</p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const isDegraded = data.health === 'degraded'

  const healthColorClass = isHealthy
    ? 'bg-green-500/15 text-green-400'
    : 'bg-orange-500/15 text-orange-400'

  const healthLabel = isHealthy
    ? t('contour.healthy')
    : isDegraded
      ? t('contour.degraded')
      : t('contour.notInstalled')

  const httpProxyTotal = data.httpProxies.total
  const showHTTPProxy = httpProxyTotal > 0

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
          <RefreshCw className="w-3 h-3" />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Pod metric tiles */}
      <div className="flex gap-3">
        <MetricTile
          label={t('contour.contourPods')}
          value={`${data.contourPods.ready}/${data.contourPods.total}`}
          colorClass={data.contourPods.ready === data.contourPods.total && data.contourPods.total > 0 ? 'text-green-400' : 'text-orange-400'}
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('contour.envoyPods')}
          value={`${data.envoyPods.ready}/${data.envoyPods.total}`}
          colorClass={data.envoyPods.ready === data.envoyPods.total && data.envoyPods.total > 0 ? 'text-green-400' : 'text-orange-400'}
          icon={<Shield className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('contour.tlsEnabled')}
          value={data.tlsEnabled}
          colorClass="text-blue-400"
          icon={<Globe className="w-4 h-4 text-blue-400" />}
        />
      </div>

      {/* HTTPProxy stats */}
      {showHTTPProxy && (
        <div className="flex-1 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t('contour.httpProxyStatus')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{t('contour.valid')}</span>
              <span className="text-sm font-semibold text-green-400">{data.httpProxies.valid}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{t('contour.invalid')}</span>
              <span className={`text-sm font-semibold ${data.httpProxies.invalid > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {data.httpProxies.invalid}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{t('contour.orphaned')}</span>
              <span className={`text-sm font-semibold ${data.httpProxies.orphaned > 0 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                {data.httpProxies.orphaned}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">{t('contour.total')}</span>
              <span className="text-sm font-semibold text-foreground">{data.httpProxies.total}</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer link */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://projectcontour.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('contour.openDocs')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  )
}
