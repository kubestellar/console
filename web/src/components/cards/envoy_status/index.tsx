/**
 * Envoy Proxy Status Card
 *
 * Displays Envoy listeners, upstream clusters, and basic admin stats.
 * Follows the contour_status pattern for structure and styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Envoy admin bridge lands, the hook's fetcher will pick up live data
 * automatically with no component changes.
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Network,
  RefreshCw,
  Server,
  Shield,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedEnvoy } from './useCachedEnvoy'
import type { EnvoyListener, EnvoyUpstreamCluster } from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'
import { formatThroughput } from '../../../lib/cards/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

const HTTP_5XX_PERCENT_DECIMALS = 2
// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ListenerRow({ listener }: { listener: EnvoyListener }) {
  const isActive = listener.status === 'active'
  const statusClass = isActive
    ? 'bg-green-500/20 text-green-400'
    : listener.status === 'warming'
      ? 'bg-cyan-500/20 text-cyan-400'
      : 'bg-yellow-500/20 text-yellow-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        {isActive ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground truncate">{listener.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {listener.address}:{listener.port}
        </span>
      </div>
      <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${statusClass}`}>
        {listener.status}
      </span>
    </div>
  )
}

function ClusterRow({ cluster }: { cluster: EnvoyUpstreamCluster }) {
  const isFullyHealthy =
    cluster.endpointsTotal > 0 && cluster.endpointsHealthy === cluster.endpointsTotal
  const hasAnyHealthy = cluster.endpointsHealthy > 0
  const ringClass = isFullyHealthy
    ? 'text-green-400'
    : hasAnyHealthy
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Server className={`w-3.5 h-3.5 shrink-0 ${ringClass}`} />
          <span className="text-xs font-medium text-foreground truncate">{cluster.name}</span>
        </div>
        <span className={`text-[11px] font-mono shrink-0 ${ringClass}`}>
          {cluster.endpointsHealthy}/{cluster.endpointsTotal}
        </span>
      </div>
      <div className="text-xs text-muted-foreground truncate">{cluster.upstream}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EnvoyStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedEnvoy()

  const isHealthy = data.health === 'healthy'

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-y-2">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
        </div>
        <SkeletonStats className="grid-cols-2 @md:grid-cols-4" />
        <SkeletonList items={SKELETON_LIST_ITEMS} className="flex-1" />
      </div>
    )
  }

  if (error && showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('envoyStatus.fetchError', 'Unable to fetch Envoy status')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('envoyStatus.notInstalled', 'Envoy not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'envoyStatus.notInstalledHint',
            'No Envoy admin endpoint reachable from the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('envoyStatus.healthy', 'Healthy')
            : t('envoyStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('envoyStatus.listeners', 'Listeners')}
          value={`${data.summary.activeListeners}/${data.summary.totalListeners}`}
          colorClass={
            data.summary.activeListeners === data.summary.totalListeners
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Network className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('envoyStatus.clusters', 'Clusters')}
          value={`${data.summary.healthyClusters}/${data.summary.totalClusters}`}
          colorClass={
            data.summary.healthyClusters === data.summary.totalClusters
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('envoyStatus.rps', 'Requests/s')}
          value={formatThroughput(data.stats.requestsPerSecond)}
          colorClass="text-cyan-400"
          icon={<Activity className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('envoyStatus.activeConnections', 'Active conns')}
          value={formatThroughput(data.stats.activeConnections)}
          colorClass="text-foreground"
          icon={<Zap className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Listener + cluster lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('envoyStatus.sectionListeners', 'Listeners')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('envoyStatus.http5xx', '5xx rate')}:{' '}
              <span className={data.stats.http5xxRate > 0 ? 'text-yellow-400' : 'text-green-400'}>
                {data.stats.http5xxRate.toFixed(HTTP_5XX_PERCENT_DECIMALS)}%
              </span>
            </span>
          </div>

          {data.listeners.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('envoyStatus.noListeners', 'No listeners configured')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.listeners || []).map(listener => (
                <ListenerRow
                  key={`${listener.cluster}:${listener.name}:${listener.port}`}
                  listener={listener}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('envoyStatus.sectionClusters', 'Upstream clusters')}
            </h4>
          </div>

          {data.clusters.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('envoyStatus.noClusters', 'No upstream clusters')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.clusters || []).map(cluster => (
                <ClusterRow
                  key={`${cluster.cluster}:${cluster.name}`}
                  cluster={cluster}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default EnvoyStatus
