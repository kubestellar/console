import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, AlertTriangle, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import { useCachedCoreDNSStatus, type CoreDNSClusterStatus } from '../../../hooks/useCachedData'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'
import { cn } from '../../../lib/cn'
import { STATUS_COLORS } from '../../../lib/statusColors'

const RESTART_WARNING_THRESHOLD = 5

interface CoreDNSStatusProps {
  config?: {
    cluster?: string
  }
}

export function CoreDNSStatus({ config }: CoreDNSStatusProps) {
  const { t } = useTranslation('cards')

  const {
    clusters,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
  } = useCachedCoreDNSStatus(config?.cluster)

  const isDemoData = isDemoFallback

  const hasData = clusters.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    isDemoData,
    hasAnyData: clusters.length > 0,
    isFailed,
    consecutiveFailures,
  })

  // summary stats derived only from pod metadata
  const totals = useMemo(() => {
    if (clusters.length === 0) return null
    const totalPods = clusters.reduce((s, c) => s + c.pods.length, 0)
    const healthyClusters = clusters.filter(c => c.healthy).length
    const totalRestarts = clusters.reduce((s, c) => s + c.totalRestarts, 0)
    return { totalPods, healthyClusters, totalRestarts }
  }, [clusters])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={52} />)}
        </div>
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={64} />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Wifi className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('coreDNSStatus.noPods')}</p>
        <p className="text-xs mt-1 text-center">{t('coreDNSStatus.noPods_hint')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden gap-3">
      {/* top stats — only pod-derivable metrics */}
      {totals && (
        <div className="grid grid-cols-2 @md:grid-cols-3 gap-2">
          <StatTile
            value={totals.totalPods.toString()}
            sub={t('coreDNSStatus.pods')}
            color="blue"
          />
          <StatTile
            value={`${totals.healthyClusters}/${clusters.length}`}
            sub={t('coreDNSStatus.healthy')}
            color={totals.healthyClusters === clusters.length ? 'green' : 'yellow'}
          />
          <StatTile
            value={totals.totalRestarts.toString()}
            sub={t('coreDNSStatus.restarts')}
            color={totals.totalRestarts === 0 ? 'green' : totals.totalRestarts < RESTART_WARNING_THRESHOLD ? 'yellow' : 'red'}
          />
        </div>
      )}

      {/* clusters */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusters.map(cluster => (
          <ClusterRow key={cluster.cluster} cluster={cluster} t={t} />
        ))}
      </div>

      {/* footer */}
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-y-2">
        <span>
          {t('coreDNSStatus.summary', {
            pods: clusters.reduce((s, c) => s + c.pods.length, 0),
            clusters: clusters.length,
          })}
        </span>
        {isRefreshing && <RotateCcw className="w-3 h-3 animate-spin opacity-60" />}
      </div>
    </div>
  )
}

function ClusterRow({ cluster, t }: { cluster: CoreDNSClusterStatus; t: ReturnType<typeof useTranslation<'cards'>>['t'] }) {
  const StatusIcon = cluster.healthy ? CheckCircle : XCircle
  const readyCount = cluster.pods.filter(pod => pod.ready?.startsWith('1/')).length
  const clusterColors = cluster.healthy ? STATUS_COLORS.success : STATUS_COLORS.error

  return (
    <div
      className={cn(
        'p-3 rounded-lg transition-colors',
        cluster.healthy
          ? 'bg-secondary/30 hover:bg-secondary/50'
          : clusterColors.bg,
        !cluster.healthy && 'border hover:bg-red-500/15',
        !cluster.healthy && clusterColors.border
      )}
    >
      {/* name + badge */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('w-4 h-4 shrink-0', clusterColors.text)} />
          <span className="text-sm font-medium truncate">{cluster.cluster}</span>
        </div>
        <span className={cn('text-xs px-1.5 py-0.5 rounded', clusterColors.bg, clusterColors.text)}>
          {cluster.healthy ? t('coreDNSStatus.healthy') : t('coreDNSStatus.degraded')}
        </span>
      </div>

      {/* pods */}
      <div className="flex gap-1 flex-wrap mb-2">
        {cluster.pods.map(pod => {
          const podColors = pod.status === 'Running' ? STATUS_COLORS.success : STATUS_COLORS.error

          return (
            <span
              key={pod.name}
              title={pod.name}
              className={cn('text-xs px-1.5 py-0.5 rounded', podColors.bg, podColors.text)}
            >
            {pod.status === 'Running' ? '✓' : '✗'}
            {pod.version ? ` v${pod.version}` : ''}
            {pod.restarts > 0 && (
              <span className="ml-1 text-orange-400">↺{pod.restarts}</span>
            )}
            </span>
          )
        })}
      </div>

      {/* pod summary for healthy clusters */}
      {cluster.healthy && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{t('coreDNSStatus.summaryRunning', { count: cluster.pods.length })}</span>
          {cluster.totalRestarts > 0 && (
            <span className="text-orange-400">↺ {t('coreDNSStatus.summaryRestarts', { count: cluster.totalRestarts })}</span>
          )}
        </div>
      )}

      {!cluster.healthy && (
        <div className="flex items-center gap-1 text-xs text-red-400 mt-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{t('coreDNSStatus.podNotReady', { ready: readyCount, total: cluster.pods.length })}</span>
        </div>
      )}
    </div>
  )
}

function StatTile({ value, sub, color }: { value: string; sub: string; color: string }) {
  const COLORS: Record<string, { bg: string; text: string }> = {
    blue: STATUS_COLORS.info,
    green: STATUS_COLORS.success,
    yellow: STATUS_COLORS.warning,
    red: STATUS_COLORS.error,
  }
  const colorClasses = COLORS[color] ?? COLORS.blue

  return (
    <div className={cn('p-2 rounded-lg text-center', colorClasses.bg, colorClasses.text)}>
      <div className="text-base font-bold leading-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}
