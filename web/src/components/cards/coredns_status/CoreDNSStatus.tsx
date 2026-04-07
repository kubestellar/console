import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, AlertTriangle, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import { useCachedCoreDNSStatus, type CoreDNSClusterStatus } from '../../../hooks/useCachedData'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'

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

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
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
        <div className="grid grid-cols-3 gap-2">
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
        <div className="grid grid-cols-3 gap-2">
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
      <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between">
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

  return (
    <div
      className={`p-3 rounded-lg transition-colors ${cluster.healthy
        ? 'bg-secondary/30 hover:bg-secondary/50'
        : 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/15'
        }`}
    >
      {/* name + badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={`w-4 h-4 flex-shrink-0 ${cluster.healthy ? 'text-green-400' : 'text-red-400'}`}
          />
          <span className="text-sm font-medium truncate">{cluster.cluster}</span>
        </div>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${cluster.healthy
            ? 'bg-green-500/15 text-green-400'
            : 'bg-red-500/15 text-red-400'
            }`}
        >
          {cluster.healthy ? t('coreDNSStatus.healthy') : t('coreDNSStatus.degraded')}
        </span>
      </div>

      {/* pods */}
      <div className="flex gap-1 flex-wrap mb-2">
        {cluster.pods.map(pod => (
          <span
            key={pod.name}
            title={pod.name}
            className={`text-xs px-1.5 py-0.5 rounded ${pod.status === 'Running'
              ? 'bg-green-500/10 text-green-400'
              : 'bg-red-500/10 text-red-400'
              }`}
          >
            {pod.status === 'Running' ? '✓' : '✗'}
            {pod.version ? ` v${pod.version}` : ''}
            {pod.restarts > 0 && (
              <span className="ml-1 text-orange-400">↺{pod.restarts}</span>
            )}
          </span>
        ))}
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
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>{t('coreDNSStatus.podNotReady', { ready: readyCount, total: cluster.pods.length })}</span>
        </div>
      )}
    </div>
  )
}

function StatTile({ value, sub, color }: { value: string; sub: string; color: string }) {
  const COLORS: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    yellow: 'bg-yellow-500/10 text-yellow-400',
    red: 'bg-red-500/10 text-red-400',
  }
  return (
    <div className={`p-2 rounded-lg text-center ${COLORS[color] ?? COLORS.blue}`}>
      <div className="text-base font-bold leading-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}
