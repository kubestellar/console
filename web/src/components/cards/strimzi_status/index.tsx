/**
 * Strimzi Status Card
 *
 * Strimzi is a CNCF Incubating project that runs Apache Kafka on Kubernetes
 * via a set of Operators. This card surfaces the per-cluster operational
 * signals a platform team needs: broker readiness, topic counts, consumer
 * groups, and end-to-end consumer lag across every Kafka CR managed by the
 * Strimzi Cluster Operator.
 *
 * Follows the spiffe_status / linkerd_status pattern for structure and
 * styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Strimzi bridge lands (`/api/strimzi/status`), the hook's fetcher will
 * pick up live data automatically with no component changes.
 */

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  Layers,
  MessageSquare,
  RefreshCw,
  Server,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedStrimzi } from '../../../hooks/useCachedStrimzi'
import type {
  ClusterHealth,
  StrimziConsumerGroup,
  StrimziKafkaCluster,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 4

// Max clusters to show in the list view before we rely on scroll.
const MAX_CLUSTERS_DISPLAYED = 6
// Max consumer groups shown per cluster row (highest lag first).
const MAX_GROUPS_PER_CLUSTER = 3

// Consumer-lag severity thresholds (messages behind the head).
// A group is "ok" at 0 lag, "warning" between 0 and WARNING, and "error" at
// or above WARNING. The per-cluster "critical" threshold on top of that
// drives the red broker/lag tiles.
const LAG_WARNING_THRESHOLD = 100
const LAG_CRITICAL_THRESHOLD = 1_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLUSTER_HEALTH_CLASS: Record<ClusterHealth, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unavailable: 'bg-red-500/20 text-red-400',
}

function lagColorClass(lag: number): string {
  if (lag === 0) return 'text-green-400'
  if (lag < LAG_WARNING_THRESHOLD) return 'text-green-400'
  if (lag < LAG_CRITICAL_THRESHOLD) return 'text-yellow-400'
  return 'text-red-400'
}

function brokerColorClass(ready: number, total: number): string {
  if (total === 0) return 'text-muted-foreground'
  if (ready === total) return 'text-green-400'
  if (ready === 0) return 'text-red-400'
  return 'text-yellow-400'
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ConsumerGroupChip({ group }: { group: StrimziConsumerGroup }) {
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded-full bg-secondary/40 ${lagColorClass(group.lag)}`}
      title={`${group.groupId} • ${group.members} members • lag ${group.lag.toLocaleString()}`}
    >
      <span className="font-mono">{group.groupId}</span>
      <span className="ml-1 opacity-80">({group.lag.toLocaleString()})</span>
    </span>
  )
}

function ClusterRow({ cluster }: { cluster: StrimziKafkaCluster }) {
  const { t } = useTranslation('cards')
  // Show the highest-lag consumer groups first so operators spot hot spots.
  const topGroups = [...(cluster.consumerGroups ?? [])]
    .sort((a, b) => b.lag - a.lag)
    .slice(0, MAX_GROUPS_PER_CLUSTER)

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {cluster.name}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {cluster.namespace}
          </span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${CLUSTER_HEALTH_CLASS[cluster.health]}`}
        >
          {cluster.health}
        </span>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 text-[11px]">
        <div className="flex flex-col">
          <span className="text-muted-foreground">
            {t('strimziStatus.brokers', 'Brokers')}
          </span>
          <span className={`font-mono ${brokerColorClass(cluster.brokers.ready, cluster.brokers.total)}`}>
            {cluster.brokers.ready}/{cluster.brokers.total}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">
            {t('strimziStatus.topics', 'Topics')}
          </span>
          <span className="font-mono text-foreground">
            {(cluster.topics ?? []).length}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">
            {t('strimziStatus.groups', 'Groups')}
          </span>
          <span className="font-mono text-foreground">
            {(cluster.consumerGroups ?? []).length}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">
            {t('strimziStatus.lag', 'Lag')}
          </span>
          <span className={`font-mono ${lagColorClass(cluster.totalLag)}`}>
            {cluster.totalLag.toLocaleString()}
          </span>
        </div>
      </div>

      {topGroups.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(topGroups ?? []).map(group => (
            <ConsumerGroupChip key={group.groupId} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StrimziStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedStrimzi()

  const isHealthy = data.health === 'healthy'
  const clusters = data.clusters ?? []
  const displayedClusters = clusters.slice(0, MAX_CLUSTERS_DISPLAYED)

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
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
        <p className="text-sm text-red-400">
          {t('strimziStatus.fetchError', 'Unable to fetch Strimzi status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <MessageSquare className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('strimziStatus.notInstalled', 'Strimzi not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'strimziStatus.notInstalledHint',
            'No Strimzi Cluster Operator or Kafka custom resources found in the connected clusters.',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      {/* Header — health pill + freshness */}
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('strimziStatus.healthy', 'Healthy')
            : t('strimziStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('strimziStatus.clusters', 'Clusters')}
          value={`${data.stats.clusterCount}`}
          colorClass="text-cyan-400"
          icon={<Database className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('strimziStatus.brokers', 'Brokers')}
          value={`${data.summary.readyBrokers}/${data.summary.totalBrokers}`}
          colorClass={brokerColorClass(data.summary.readyBrokers, data.summary.totalBrokers)}
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('strimziStatus.topics', 'Topics')}
          value={`${data.stats.topicCount}`}
          colorClass="text-blue-400"
          icon={<Layers className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('strimziStatus.totalLag', 'Total Lag')}
          value={data.stats.totalLag.toLocaleString()}
          colorClass={lagColorClass(data.stats.totalLag)}
          icon={<Activity className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Clusters + operator footer */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('strimziStatus.sectionClusters', 'Kafka clusters')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('strimziStatus.operator', 'operator')}:{' '}
              <span className="text-foreground">{data.stats.operatorVersion}</span>
            </span>
          </div>

          {clusters.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('strimziStatus.noClusters', 'No Kafka clusters found')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(displayedClusters ?? []).map(cluster => (
                <ClusterRow
                  key={`${cluster.cluster}:${cluster.namespace}:${cluster.name}`}
                  cluster={cluster}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground pt-1">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>
              {t('strimziStatus.consumerGroupsCount', '{{count}} consumer groups', {
                count: data.stats.consumerGroupCount,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span>
              {t('strimziStatus.healthyClustersCount', '{{healthy}}/{{total}} healthy', {
                healthy: data.summary.healthyClusters,
                total: data.summary.totalClusters,
              })}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

export default StrimziStatus
