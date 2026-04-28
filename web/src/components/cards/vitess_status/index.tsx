/**
 * Vitess Status Card
 *
 * Shows the shape of a Vitess (CNCF graduated) MySQL cluster:
 *   keyspaces → shards → tablets (PRIMARY / REPLICA / RDONLY)
 *
 * Surfaces replication lag and NOT_SERVING tablets so operators can spot
 * failover / replication issues at a glance. Demo fallback is used when
 * Vitess is not installed or the user is in demo mode.
 */

import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Layers,
  RefreshCw,
  Server,
} from 'lucide-react'
import { useCachedVitess } from '../../../hooks/useCachedVitess'
import { useCardLoadingState } from '../CardDataContext'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type { VitessKeyspace, VitessTablet, VitessTabletType } from '../../../lib/demo/vitess'
import { getHealthBadgeClasses } from '../../../lib/cards/statusColors'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

// Replication lag thresholds (seconds) — mirrors typical VTOrc / Vitess
// replication-lag alerting bands.
const LAG_WARN_SECONDS = 5
const LAG_ALERT_SECONDS = 30

// How many rows to render before scrolling kicks in.
const KEYSPACE_PAGE_SIZE = 8

// Tablet-type badge ordering weight (PRIMARY first, then REPLICA, then RDONLY).
const TABLET_TYPE_ORDER: Record<VitessTabletType, number> = {
  PRIMARY: 0,
  REPLICA: 1,
  RDONLY: 2,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lagColor(seconds: number): string {
  if (seconds >= LAG_ALERT_SECONDS) return 'text-red-400'
  if (seconds >= LAG_WARN_SECONDS) return 'text-yellow-400'
  return 'text-green-400'
}

function tabletTypeClass(type: VitessTabletType): string {
  if (type === 'PRIMARY') return 'bg-blue-500/20 text-blue-400'
  if (type === 'REPLICA') return 'bg-cyan-500/20 text-cyan-400'
  return 'bg-purple-500/20 text-purple-400'
}

function countTypesForKeyspace(
  tablets: VitessTablet[],
  keyspace: string,
): Record<VitessTabletType, number> {
  const acc: Record<VitessTabletType, number> = { PRIMARY: 0, REPLICA: 0, RDONLY: 0 }
  for (const tablet of tablets) {
    if (tablet.keyspace !== keyspace) continue
    acc[tablet.type] += 1
  }
  return acc
}

function maxLagForKeyspace(tablets: VitessTablet[], keyspace: string): number {
  let max = 0
  for (const tablet of tablets) {
    if (tablet.keyspace !== keyspace) continue
    if (tablet.type === 'PRIMARY') continue
    if (tablet.replicationLagSeconds > max) max = tablet.replicationLagSeconds
  }
  return max
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VitessStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedVitess()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' still counts as "we have data" so the card isn't stuck
  // in a skeleton when Vitess isn't present.
  const hasAnyData =
    data.health === 'not-installed' ? true : data.summary.totalTablets > 0

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
    return <SkeletonCardWithRefresh showStats={true} rows={KEYSPACE_PAGE_SIZE} />
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          icon={<Database className="w-8 h-8 text-muted-foreground/40" />}
          title={t('vitessStatus.notInstalled', 'Vitess not detected')}
          description={t(
            'vitessStatus.notInstalledHint',
            'No Vitess tablets found. Deploy Vitess (VTAdmin) to monitor keyspaces, shards, and tablet health.',
          )}
        />
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const keyspaces = (data.keyspaces ?? []).slice(0, KEYSPACE_PAGE_SIZE)
  const tablets = data.tablets ?? []

  return (
    <div className="h-full flex flex-col min-h-card gap-4 overflow-hidden animate-in fade-in duration-500">
      {/* Header — health pill + freshness */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            getHealthBadgeClasses(isHealthy),
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('vitessStatus.healthy', 'Healthy')
            : t('vitessStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('vitessStatus.version', 'version')}:{' '}
            <span className="text-foreground font-mono">{data.vitessVersion}</span>
          </span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('vitessStatus.keyspaces', 'Keyspaces')}
          value={data.summary.totalKeyspaces}
          colorClass="text-cyan-400"
          icon={<Database className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('vitessStatus.shards', 'Shards')}
          value={data.summary.totalShards}
          colorClass="text-blue-400"
          icon={<Layers className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('vitessStatus.tablets', 'Tablets')}
          value={`${data.summary.servingTablets}/${data.summary.totalTablets}`}
          colorClass={
            data.summary.servingTablets === data.summary.totalTablets
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('vitessStatus.maxLag', 'Max lag')}
          value={`${data.summary.maxReplicationLagSeconds}s`}
          colorClass={lagColor(data.summary.maxReplicationLagSeconds)}
          icon={<Clock className="w-4 h-4 text-yellow-400" />}
        />
      </div>

      {/* Keyspace list — each row shows the PRIMARY/REPLICA/RDONLY breakdown */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('vitessStatus.sectionKeyspaces', 'Keyspaces')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {t('vitessStatus.primaries', { count: data.summary.primaryTablets, defaultValue: '{{count}} primaries' })}
            </span>
          </div>

          {keyspaces.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('vitessStatus.noKeyspaces', 'No keyspaces reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {keyspaces.map(keyspace => (
                <KeyspaceRow key={keyspace.name} keyspace={keyspace} tablets={tablets} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Keyspace row — compact per-keyspace summary
// ---------------------------------------------------------------------------

function KeyspaceRow({
  keyspace,
  tablets,
}: {
  keyspace: VitessKeyspace
  tablets: VitessTablet[]
}) {
  const { t } = useTranslation(['cards', 'common'])
  const typeCounts = countTypesForKeyspace(tablets, keyspace.name)
  const keyspaceLag = maxLagForKeyspace(tablets, keyspace.name)

  const shardLabel = keyspace.sharded
    ? t('vitessStatus.shardsCount', {
        count: keyspace.shards.length,
        defaultValue: '{{count}} shards',
      })
    : t('vitessStatus.unsharded', 'unsharded')

  // Show tablet-type chips in a stable order (PRIMARY → REPLICA → RDONLY).
  const typeEntries = (Object.keys(typeCounts) as VitessTabletType[])
    .filter(type => typeCounts[type] > 0)
    .sort((a, b) => TABLET_TYPE_ORDER[a] - TABLET_TYPE_ORDER[b])

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium text-foreground truncate font-mono">
            {keyspace.name}
          </span>
          <span className="text-[11px] text-muted-foreground truncate">{shardLabel}</span>
        </div>
        <span
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-1',
            lagColor(keyspaceLag),
          )}
          title={t('vitessStatus.maxLagTooltip', 'Max replication lag in keyspace')}
        >
          <Clock className="w-3 h-3" />
          {keyspaceLag}s
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        {(typeEntries ?? []).map(type => (
          <span
            key={type}
            className={cn('px-1.5 py-0.5 rounded-full font-mono', tabletTypeClass(type))}
          >
            {type} {typeCounts[type]}
          </span>
        ))}
        <span className="ml-auto text-muted-foreground">
          {t('vitessStatus.tabletsCount', {
            count: keyspace.tabletCount,
            defaultValue: '{{count}} tablets',
          })}
        </span>
      </div>
    </div>
  )
}

export default VitessStatus
