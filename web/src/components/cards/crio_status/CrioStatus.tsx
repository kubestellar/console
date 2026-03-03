import { CheckCircle, AlertTriangle, RefreshCw, Box, Image, Layers, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { useCrioStatus } from './useCrioStatus'
import { MetricTile } from '../../../lib/cards/CardComponents'

function useFormatRelativeTime() {
  const { t } = useTranslation('cards')
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('crio.syncedJustNow')
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    if (diff < minute) return t('crio.syncedJustNow')
    if (diff < hour) return t('crio.syncedMinutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('crio.syncedHoursAgo', { count: Math.floor(diff / hour) })
    return t('crio.syncedDaysAgo', { count: Math.floor(diff / day) })
  }
}

export function CrioStatus() {
  const { t } = useTranslation('cards')
  const formatRelativeTime = useFormatRelativeTime()
  const { data, error, showSkeleton, showEmptyState } = useCrioStatus()

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <Skeleton variant="rounded" height={36} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
          <Skeleton variant="rounded" height={80} className="flex-1" />
        </div>
        <div className="flex gap-2">
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
        <p className="text-sm text-red-400">{t('crio.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Box className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('crio.notInstalled')}</p>
        <p className="text-xs text-center max-w-xs">{t('crio.notInstalledHint')}</p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const imagePullSuccessRate = data.imagePulls.total > 0
    ? ((data.imagePulls.successful / data.imagePulls.total) * 100).toFixed(1)
    : '0'
  const podSandboxReadyRate = data.podSandboxes.total > 0
    ? ((data.podSandboxes.ready / data.podSandboxes.total) * 100).toFixed(1)
    : '0'

  // Sort versions descending (latest first), "unknown" last
  const sortedVersions = Object.entries(data.versions).sort(([a], [b]) => {
    if (a === 'unknown') return 1
    if (b === 'unknown') return -1
    const [aMajor, aMinor, aPatch] = a.split('.').map(Number)
    const [bMajor, bMinor, bPatch] = b.split('.').map(Number)
    if (aMajor !== bMajor) return bMajor - aMajor
    if (aMinor !== bMinor) return bMinor - aMinor
    return bPatch - aPatch
  })

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4">
      {/* Health badge + last check */}
      <div className="flex items-center justify-between">
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
          {isHealthy ? t('crio.healthy') : t('crio.degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3" />
          <span>{formatRelativeTime(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Top metric tiles - Container Runtime */}
      <div className="flex gap-3">
        <MetricTile
          label={t('crio.totalNodes')}
          value={data.totalNodes}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('crio.runningContainers')}
          value={data.runtimeMetrics.runningContainers}
          colorClass="text-green-400"
          icon={<Box className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('crio.stoppedContainers')}
          value={data.runtimeMetrics.stoppedContainers}
          colorClass={data.runtimeMetrics.stoppedContainers > 0 ? 'text-yellow-400' : 'text-muted-foreground'}
          icon={<Box className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Bottom metric tiles - Image & Sandbox Status */}
      <div className="flex gap-3">
        <MetricTile
          label={t('crio.imagePullSuccess')}
          value={`${imagePullSuccessRate}%`}
          colorClass={parseFloat(imagePullSuccessRate) >= 95 ? 'text-green-400' : 'text-orange-400'}
          icon={<Image className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('crio.podSandboxReady')}
          value={`${podSandboxReadyRate}%`}
          colorClass={parseFloat(podSandboxReadyRate) >= 95 ? 'text-green-400' : 'text-orange-400'}
          icon={<Layers className="w-4 h-4 text-green-400" />}
        />
      </div>

      {/* Version distribution */}
      <div className="flex-1 flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('crio.versionDistribution')}</p>
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

      {/* Recent image pulls (if available) */}
      {data.recentImagePulls.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">{t('crio.recentImagePulls')}</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
            {data.recentImagePulls.slice(0, 5).map((pull, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs gap-2">
                <span className="text-muted-foreground truncate flex-1" title={pull.image}>
                  {pull.image.split('/').pop()?.split(':')[0] || pull.image}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {pull.size && <span className="text-muted-foreground/70">{pull.size}</span>}
                  {pull.status === 'success' ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <a
          href="https://cri-o.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          {t('crio.openCrio')}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  )
}
