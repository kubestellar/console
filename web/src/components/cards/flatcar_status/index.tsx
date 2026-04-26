import { CheckCircle, AlertTriangle, RefreshCw, Server } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { useFlatcarStatus } from './useFlatcarStatus'
import { compareFlatcarVersions } from './versionUtils'
import { createCardSyncFormatter } from '../../../lib/formatters'



export function FlatcarStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = createCardSyncFormatter(t, 'flatcar')
  const { data, error, isRefreshing, showSkeleton, showEmptyState } = useFlatcarStatus()

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

  if (error || showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">
          {error ? t('flatcar.fetchError') : t('flatcar.noFlatcarNodes')}
        </p>
        <p className="text-xs">{t('flatcar.noFlatcarNodesHint')}</p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'

  // Sort versions descending (latest first), "unknown" last
  const sortedVersions = Object.entries(data.versions).sort(([a], [b]) =>
    compareFlatcarVersions(a, b),
  )

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
      {/* Health badge + last check */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-orange-500/15 text-orange-400'
          }`}
        >
          {isHealthy ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {isHealthy ? t('flatcar.healthy') : t('flatcar.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="flex gap-3">
        <MetricTile
          label={t('flatcar.totalNodes')}
          value={data.totalNodes}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('flatcar.outdated')}
          value={data.outdatedNodes}
          colorClass={data.outdatedNodes > 0 ? 'text-orange-400' : 'text-green-400'}
          icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
        />
      </div>

      {/* Version distribution */}
      <div className="flex-1 flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('flatcar.versionDistribution')}</p>
        <div className="space-y-2">
          {sortedVersions.map(([version, count], idx) => {
            const pct = data.totalNodes > 0 ? Math.round((count / data.totalNodes) * 100) : 0
            const isLatest = idx === 0 && version !== 'unknown'
            return (
              <div key={version} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 min-w-0 w-24 shrink-0">
                  {isLatest && <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />}
                  <span className={`text-xs truncate ${isLatest ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {version === 'unknown' ? version : `v${version}`}
                  </span>
                </div>
                <div className="flex-1 h-2 bg-secondary/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isLatest ? 'bg-green-500/60' : 'bg-orange-500/40'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                  {count} ({pct}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://www.flatcar.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('flatcar.openFlatcar')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  )
}
