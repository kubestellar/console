/**
 * Longhorn Status Card
 *
 * Surfaces Longhorn (CNCF Incubating) distributed block storage state —
 * volume list, node status, replica health, and storage capacity. Falls
 * back to demo data when Longhorn isn't installed or the user is in
 * demo mode.
 *
 * Mirrors the rook_status / tikv_status / spiffe_status pattern.
 */

import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle,
  HardDrive,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react'
import { useCachedLonghorn } from '../../../hooks/useCachedLonghorn'
import { formatBytes } from '../../../lib/formatters'
import { useCardLoadingState } from '../CardDataContext'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type {
  LonghornNode,
  LonghornVolume,
  LonghornVolumeRobustness,
} from '../../../lib/demo/longhorn'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const PCT_MULTIPLIER = 100
const USAGE_PCT_WARN = 70
const USAGE_PCT_ALERT = 85

const BINARY_ZERO_LABEL = '0'
const BINARY_FORMAT = { binary: true, zeroLabel: BINARY_ZERO_LABEL } as const

// Keep the card compact — cap visible rows.
const VOLUME_PAGE_SIZE = 6
const NODE_PAGE_SIZE = 4

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usagePct(used: number, total: number): number {
  if (total <= 0) return 0
  const pct = (used / total) * PCT_MULTIPLIER
  return Math.max(0, Math.min(PCT_MULTIPLIER, pct))
}

function usageColor(pct: number): string {
  if (pct >= USAGE_PCT_ALERT) return 'text-red-400'
  if (pct >= USAGE_PCT_WARN) return 'text-yellow-400'
  return 'text-green-400'
}

const ROBUSTNESS_BADGE_CLASSES: Record<LonghornVolumeRobustness, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  faulted: 'bg-red-500/20 text-red-400',
  unknown: 'bg-secondary/40 text-muted-foreground',
}

function RobustnessIcon({ robustness }: { robustness: LonghornVolumeRobustness }) {
  if (robustness === 'healthy') {
    return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
  }
  if (robustness === 'degraded') {
    return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
  }
  if (robustness === 'faulted') {
    return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
  }
  return <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function VolumeRow({ volume }: { volume: LonghornVolume }) {
  const { t } = useTranslation('cards')
  const replicasMissing = volume.replicasDesired - volume.replicasHealthy
  const pct = usagePct(volume.actualSizeBytes, volume.sizeBytes)

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <RobustnessIcon robustness={volume.robustness} />
          <span className="text-xs font-medium truncate font-mono">
            {volume.namespace}/{volume.name}
          </span>
        </div>
        <span
          className={cn(
            'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
            ROBUSTNESS_BADGE_CLASSES[volume.robustness],
          )}
        >
          {volume.robustness}
        </span>
      </div>

      <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <span className="truncate">
          {t('longhornStatus.replicasShort', {
            healthy: volume.replicasHealthy,
            desired: volume.replicasDesired,
            defaultValue: 'replicas {{healthy}}/{{desired}}',
          })}
          {replicasMissing > 0 && (
            <span className="text-yellow-400"> · -{replicasMissing}</span>
          )}
          {' · '}
          {volume.state}
          {volume.nodeAttached && ` · ${volume.nodeAttached}`}
        </span>
        <span className={cn('flex items-center gap-1 shrink-0', usageColor(pct))}>
          <HardDrive className="w-3 h-3" />
          {formatBytes(volume.actualSizeBytes, BINARY_FORMAT)} / {formatBytes(volume.sizeBytes, BINARY_FORMAT)}
        </span>
      </div>
    </div>
  )
}

function NodeRow({ node }: { node: LonghornNode }) {
  const { t } = useTranslation('cards')
  const pct = usagePct(node.storageUsedBytes, node.storageTotalBytes)

  let statusClass: string
  let statusLabel: string
  if (!node.ready) {
    statusClass = 'bg-red-500/20 text-red-400'
    statusLabel = t('longhornStatus.nodeNotReady', 'Not ready')
  } else if (!node.schedulable) {
    statusClass = 'bg-yellow-500/20 text-yellow-400'
    statusLabel = t('longhornStatus.nodeCordoned', 'Cordoned')
  } else {
    statusClass = 'bg-green-500/20 text-green-400'
    statusLabel = t('longhornStatus.nodeReady', 'Ready')
  }

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium truncate font-mono">
            {node.name}
          </span>
          {node.cluster && (
            <span className="text-[11px] text-muted-foreground truncate">
              {node.cluster}
            </span>
          )}
        </div>
        <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full shrink-0', statusClass)}>
          {statusLabel}
        </span>
      </div>

      <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <span className="truncate">
          {t('longhornStatus.replicaCount', {
            count: node.replicaCount,
            defaultValue: '{{count}} replicas',
          })}
        </span>
        <span className={cn('flex items-center gap-1 shrink-0', usageColor(pct))}>
          <HardDrive className="w-3 h-3" />
          {formatBytes(node.storageUsedBytes, BINARY_FORMAT)} / {formatBytes(node.storageTotalBytes, BINARY_FORMAT)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LonghornStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedLonghorn()

  // Rule: never show demo data while still loading.
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' still counts as "we have data" so the card shows the
  // empty state rather than being stuck in an indefinite skeleton.
  const hasAnyData =
    data.health === 'not-installed'
      ? true
      : data.summary.totalVolumes > 0 || data.summary.totalNodes > 0

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
    return <SkeletonCardWithRefresh showStats={true} rows={VOLUME_PAGE_SIZE} />
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          icon={<HardDrive className="w-8 h-8 text-muted-foreground/40" />}
          title={t('longhornStatus.notInstalled', 'Longhorn not detected')}
          description={t(
            'longhornStatus.notInstalledHint',
            'No Longhorn volumes or nodes found. Install Longhorn to monitor distributed block storage.',
          )}
        />
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const volumes = (data.volumes ?? []).slice(0, VOLUME_PAGE_SIZE)
  const nodes = (data.nodes ?? []).slice(0, NODE_PAGE_SIZE)

  return (
    <div className="h-full flex flex-col min-h-card gap-4 overflow-hidden animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            isHealthy
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400',
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('longhornStatus.healthy', 'Healthy')
            : t('longhornStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>
            {t('longhornStatus.volumeCount', {
              count: data.summary.totalVolumes,
              defaultValue: '{{count}} volumes',
            })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('longhornStatus.healthyVolumes', 'Healthy')}
          value={data.summary.healthyVolumes}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('longhornStatus.degradedVolumes', 'Degraded')}
          value={data.summary.degradedVolumes + data.summary.faultedVolumes}
          colorClass={
            data.summary.degradedVolumes + data.summary.faultedVolumes > 0
              ? 'text-yellow-400'
              : 'text-green-400'
          }
          icon={
            data.summary.degradedVolumes + data.summary.faultedVolumes > 0 ? (
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )
          }
        />
        <MetricTile
          label={t('longhornStatus.nodesReady', 'Nodes ready')}
          value={`${data.summary.readyNodes}/${data.summary.totalNodes}`}
          colorClass={
            data.summary.readyNodes === data.summary.totalNodes
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('longhornStatus.capacity', 'Capacity')}
          value={`${formatBytes(data.summary.totalUsedBytes, BINARY_FORMAT)} / ${formatBytes(
            data.summary.totalCapacityBytes, BINARY_FORMAT,
          )}`}
          colorClass="text-blue-400"
          icon={<HardDrive className="w-4 h-4 text-blue-400" />}
        />
      </div>

      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-1.5">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('longhornStatus.sectionVolumes', 'Volumes')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {data.summary.totalVolumes}
            </span>
          </div>
          {volumes.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('longhornStatus.noVolumes', 'No Longhorn volumes reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(volumes ?? []).map(volume => (
                <VolumeRow
                  key={`${volume.cluster}:${volume.namespace}:${volume.name}`}
                  volume={volume}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('longhornStatus.sectionNodes', 'Storage nodes')}
            </h4>
            <span className="text-[11px] text-muted-foreground ml-auto">
              {data.summary.totalNodes}
            </span>
          </div>
          {nodes.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('longhornStatus.noNodes', 'No Longhorn storage nodes reporting.')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(nodes ?? []).map(node => (
                <NodeRow key={`${node.cluster}:${node.name}`} node={node} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default LonghornStatus
