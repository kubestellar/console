import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, Clock, AlertTriangle, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import { useCachedCoreDNSStatus, type CoreDNSClusterStatus } from '../../../hooks/useCachedData'
import { useCardLoadingState } from '../CardDataContext'
import { Skeleton } from '../../ui/Skeleton'

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

  // avg metrics across all clusters for the top stat tiles
  const totals = useMemo(() => {
    if (clusters.length === 0) return null
    const totalPods = clusters.reduce((s, c) => s + c.pods.length, 0)
    const healthyClusters = clusters.filter(c => c.healthy).length
    const avgQPS = Math.round(clusters.reduce((s, c) => s + c.queriesPerSecond, 0) / clusters.length)
    const avgCacheHit = Math.round(clusters.reduce((s, c) => s + c.cacheHitRate, 0) / clusters.length)
    const avgError = parseFloat((clusters.reduce((s, c) => s + c.errorRate, 0) / clusters.length).toFixed(1))
    const avgLatency = parseFloat((clusters.reduce((s, c) => s + c.avgLatencyMs, 0) / clusters.length).toFixed(1))
    return { totalPods, healthyClusters, avgQPS, avgCacheHit, avgError, avgLatency }
  }, [clusters])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-3">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={52} />)}
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
      {/* top stats */}
      {totals && (
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            value={totals.avgQPS.toLocaleString()}
            sub="avg QPS"
            color="blue"
          />
          <StatTile
            value={`${totals.avgCacheHit}%`}
            sub="cache hit"
            color={totals.avgCacheHit >= 70 ? 'green' : 'yellow'}
          />
          <StatTile
            value={`${totals.avgError}%`}
            sub="errors"
            color={totals.avgError < 1 ? 'green' : totals.avgError < 5 ? 'yellow' : 'red'}
          />
          <StatTile
            value={`${totals.avgLatency}ms`}
            sub="latency"
            color={totals.avgLatency < 2 ? 'green' : totals.avgLatency < 5 ? 'yellow' : 'red'}
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

      {/* metrics (only if healthy) */}
      {cluster.healthy && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <MiniStat icon={<Wifi className="w-3 h-3" />} label="QPS" value={cluster.queriesPerSecond.toLocaleString()} />
          <MiniStat icon={<CheckCircle className="w-3 h-3" />} label="Cache" value={`${cluster.cacheHitRate}%`} />
          <MiniStat icon={<Clock className="w-3 h-3" />} label="Latency" value={`${cluster.avgLatencyMs}ms`} />
        </div>
      )}

      {!cluster.healthy && (
        <div className="flex items-center gap-1 text-xs text-red-400 mt-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>{t('coreDNSStatus.podNotReady', { ready: cluster.pods.filter(p => p.status === 'Running').length, total: cluster.pods.length })}</span>
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

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      {icon}
      <span>{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
