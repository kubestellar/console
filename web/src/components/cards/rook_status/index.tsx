/**
 * Rook Status Card
 *
 * Surfaces Rook-managed CephCluster state (CNCF graduated cloud-native
 * storage orchestrator) — per-cluster Ceph health, OSD/MON/MGR counts,
 * capacity utilization and pool/PG summary. Falls back to demo data
 * when Rook isn't installed or the user is in demo mode.
 */

import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react'
import { useCachedRook } from '../../../hooks/useCachedRook'
import { useCardLoadingState } from '../CardDataContext'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type { RookCephCluster, RookCephHealth } from '../../../lib/demo/rook'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = BYTES_PER_KIB * 1024
const BYTES_PER_GIB = BYTES_PER_MIB * 1024
const BYTES_PER_TIB = BYTES_PER_GIB * 1024
const BYTES_PER_PIB = BYTES_PER_TIB * 1024

const USAGE_PCT_WARN = 70
const USAGE_PCT_ALERT = 85
const PCT_MULTIPLIER = 100
const CAPACITY_DECIMALS = 1

// Limit the number of CephCluster rows rendered so the card stays compact.
const CLUSTER_PAGE_SIZE = 6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0'
  if (bytes >= BYTES_PER_PIB) return `${(bytes / BYTES_PER_PIB).toFixed(CAPACITY_DECIMALS)} PiB`
  if (bytes >= BYTES_PER_TIB) return `${(bytes / BYTES_PER_TIB).toFixed(CAPACITY_DECIMALS)} TiB`
  if (bytes >= BYTES_PER_GIB) return `${(bytes / BYTES_PER_GIB).toFixed(CAPACITY_DECIMALS)} GiB`
  if (bytes >= BYTES_PER_MIB) return `${(bytes / BYTES_PER_MIB).toFixed(CAPACITY_DECIMALS)} MiB`
  return `${bytes} B`
}

function usagePct(cluster: RookCephCluster): number {
  if (cluster.capacityTotalBytes <= 0) return 0
  const pct = (cluster.capacityUsedBytes / cluster.capacityTotalBytes) * PCT_MULTIPLIER
  return Math.max(0, Math.min(PCT_MULTIPLIER, pct))
}

function usageColor(pct: number): string {
  if (pct >= USAGE_PCT_ALERT) return 'text-red-400'
  if (pct >= USAGE_PCT_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

function healthBadgeClasses(health: RookCephHealth): string {
  if (health === 'HEALTH_OK') return 'bg-green-500/20 text-green-400'
  if (health === 'HEALTH_WARN') return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-red-500/20 text-red-400'
}

function HealthIcon({ health }: { health: RookCephHealth }) {
  if (health === 'HEALTH_OK') {
    return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
  }
  if (health === 'HEALTH_WARN') {
    return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
  }
  return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RookStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedRook()

  // Rule: never show demo data while still loading.
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' still counts as "we have data" so the card isn't stuck
  // in an indefinite skeleton when Rook isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalClusters > 0

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !hasAnyData,
    isRefreshing,
    isDemoData,
    hasAnyData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  })

  if (showSkeleton) {
    return <SkeletonCardWithRefresh showStats={true} rows={CLUSTER_PAGE_SIZE} />
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          icon={<Database className="w-8 h-8 text-muted-foreground/40" />}
          title={t('rookStatus.notInstalled', 'Rook not detected')}
          description={t(
            'rookStatus.notInstalledHint',
            'No CephCluster resources found. Install Rook to monitor cloud-native storage.',
          )}
        />
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const clusters = (data.clusters ?? []).slice(0, CLUSTER_PAGE_SIZE)

  return (
    <div className="h-full flex flex-col min-h-card gap-4 overflow-hidden animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isHealthy ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400',
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('rookStatus.healthy', 'Healthy')
            : t('rookStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('rookStatus.clusters', {
              count: data.summary.totalClusters,
              defaultValue: '{{count}} clusters',
            })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('rookStatus.healthyClusters', 'Healthy')}
          value={data.summary.healthyClusters}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('rookStatus.degradedClusters', 'Degraded')}
          value={data.summary.degradedClusters}
          colorClass={data.summary.degradedClusters > 0 ? 'text-yellow-400' : 'text-green-400'}
          icon={
            data.summary.degradedClusters > 0 ? (
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
        <MetricTile
          label={t('rookStatus.osd', 'OSDs up')}
          value={`${data.summary.totalOsdUp}/${data.summary.totalOsdTotal}`}
          colorClass={
            data.summary.totalOsdUp === data.summary.totalOsdTotal
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('rookStatus.capacity', 'Capacity')}
          value={`${formatBytes(data.summary.totalUsedBytes)} / ${formatBytes(
            data.summary.totalCapacityBytes,
          )}`}
          colorClass="text-blue-400"
          icon={<HardDrive className="w-4 h-4 text-blue-400" />}
        />
      </div>

      <div className="space-y-1.5 overflow-y-auto scrollbar-thin pr-0.5">
        {clusters.length === 0 ? (
          <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
            {t('rookStatus.noClusters', 'No CephCluster resources reporting.')}
          </div>
        ) : (
          (clusters ?? []).map(cluster => {
            const pct = usagePct(cluster)
            return (
              <div
                key={`${cluster.cluster}:${cluster.namespace}:${cluster.name}`}
                className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    <HealthIcon health={cluster.cephHealth} />
                    <span className="text-xs font-medium truncate font-mono">
                      {cluster.namespace}/{cluster.name}
                    </span>
                    {cluster.cephVersion && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {cluster.cephVersion}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
                      healthBadgeClasses(cluster.cephHealth),
                    )}
                  >
                    {cluster.cephHealth}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                  <span className="truncate">
                    {t('rookStatus.osdShort', {
                      up: cluster.osdUp,
                      total: cluster.osdTotal,
                      defaultValue: 'OSD {{up}}/{{total}}',
                    })}{' '}
                    ·{' '}
                    {t('rookStatus.monShort', {
                      quorum: cluster.monQuorum,
                      expected: cluster.monExpected,
                      defaultValue: 'MON {{quorum}}/{{expected}}',
                    })}{' '}
                    ·{' '}
                    {t('rookStatus.mgrShort', {
                      active: cluster.mgrActive,
                      standby: cluster.mgrStandby,
                      defaultValue: 'MGR {{active}}+{{standby}}',
                    })}{' '}
                    ·{' '}
                    {t('rookStatus.pgShort', {
                      clean: cluster.pgActiveClean,
                      total: cluster.pgTotal,
                      defaultValue: 'PG {{clean}}/{{total}}',
                    })}
                  </span>
                  <span className={cn('flex items-center gap-1 shrink-0', usageColor(pct))}>
                    <HardDrive className="w-3 h-3" />
                    {formatBytes(cluster.capacityUsedBytes)} /{' '}
                    {formatBytes(cluster.capacityTotalBytes)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default RookStatus
