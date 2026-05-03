/**
 * Dragonfly Status Card
 *
 * Surfaces telemetry for Dragonfly (CNCF graduated), a P2P image and
 * file distribution system for container registries. Shows manager and
 * scheduler replica counts, seed-peer count, per-node dfdaemon
 * readiness, active P2P tasks, and peer-cache hit rate across
 * connected clusters.
 *
 * Follows the containerd_status / tikv_status card pattern:
 *   - Data via useCachedDragonfly (useCache under the hood)
 *   - isDemoData + isRefreshing wired into useCardLoadingState (CLAUDE.md rule)
 *   - Skeleton during first load only (isLoading && !hasAnyData)
 *
 * Marketplace preset: cncf-dragonfly — kubestellar/console-marketplace#22
 */

import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle,
  Layers,
  Network,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react'
import { useCachedDragonfly } from '../../../hooks/useCachedDragonfly'
import { formatBytes, formatTimeAgo } from '../../../lib/formatters'
import { useCardLoadingState } from '../CardDataContext'
import { SkeletonCardWithRefresh } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { cn } from '../../../lib/cn'
import type {
  DragonflyComponent,
  DragonflyComponentRow,
} from '../../../lib/demo/dragonfly'
import { getHealthBadgeClasses } from '../../../lib/cards/statusColors'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const COMPONENT_PAGE_SIZE = 4

const CACHE_HIT_WARN_PERCENT = 50
const CACHE_HIT_ALERT_PERCENT = 25

const BINARY_DASH_FORMAT = { binary: true, zeroLabel: '—' } as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cacheHitColor(pct: number): string {
  if (pct >= CACHE_HIT_WARN_PERCENT) return 'text-green-400'
  if (pct >= CACHE_HIT_ALERT_PERCENT) return 'text-yellow-400'
  return 'text-red-400'
}

// Lightweight lookup — labels go through t() so names remain i18n-safe.
const COMPONENT_BADGE: Record<DragonflyComponent, string> = {
  manager: 'bg-purple-500/20 text-purple-400',
  scheduler: 'bg-cyan-500/20 text-cyan-400',
  'seed-peer': 'bg-blue-500/20 text-blue-400',
  dfdaemon: 'bg-orange-500/20 text-orange-400',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DragonflyStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedDragonfly()

  // Rule: never show demo data while still loading
  const isDemoData = isDemoFallback && !isLoading

  // 'not-installed' still counts as "we have data" so the card isn't stuck in skeleton
  const hasAnyData =
    data.health === 'not-installed' ? true : (data.components ?? []).length > 0

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
    return <SkeletonCardWithRefresh showStats={true} rows={COMPONENT_PAGE_SIZE} />
  }

  if (showEmptyState || (data.health === 'not-installed' && !isDemoData)) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <EmptyState
          icon={<Zap className="w-8 h-8 text-muted-foreground/40" />}
          title={t('dragonflyStatus.notInstalled', 'Dragonfly not detected')}
          description={t(
            'dragonflyStatus.notInstalledHint',
            'No Dragonfly manager, scheduler, seed-peer, or dfdaemon pods found. Deploy Dragonfly to accelerate container image pulls via P2P.',
          )}
        />
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'
  const components = (data.components ?? []).slice(0, COMPONENT_PAGE_SIZE)
  const { summary } = data

  const componentLabels: Record<DragonflyComponent, string> = {
    manager: t('dragonflyStatus.componentManager', 'manager'),
    scheduler: t('dragonflyStatus.componentScheduler', 'scheduler'),
    'seed-peer': t('dragonflyStatus.componentSeedPeer', 'seed-peer'),
    dfdaemon: t('dragonflyStatus.componentDfdaemon', 'dfdaemon'),
  }

  return (
    <div className="h-full flex flex-col min-h-card gap-4 overflow-hidden animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
            getHealthBadgeClasses(isHealthy),
          )}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('dragonflyStatus.healthy', 'Healthy')
            : t('dragonflyStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={cn('w-3 h-3', isRefreshing ? 'animate-spin' : '')} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('dragonflyStatus.managers', 'Managers')}
          value={summary.managerReplicas}
          colorClass="text-purple-400"
          icon={<Layers className="w-4 h-4 text-purple-400" />}
        />
        <MetricTile
          label={t('dragonflyStatus.schedulers', 'Schedulers')}
          value={summary.schedulerReplicas}
          colorClass="text-cyan-400"
          icon={<Server className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('dragonflyStatus.seedPeers', 'Seed Peers')}
          value={summary.seedPeers}
          colorClass="text-blue-400"
          icon={<Network className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('dragonflyStatus.dfdaemonNodes', 'Nodes Up')}
          value={`${summary.dfdaemonNodesUp}/${summary.dfdaemonNodesTotal}`}
          colorClass={
            summary.dfdaemonNodesUp < summary.dfdaemonNodesTotal
              ? 'text-yellow-400'
              : 'text-green-400'
          }
          icon={<Zap className="w-4 h-4 text-orange-400" />}
        />
      </div>

      <div className="grid grid-cols-1 @md:grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-secondary/30 px-3 py-2">
          <div className="text-muted-foreground">
            {t('dragonflyStatus.activeTasks', 'Active tasks')}
          </div>
          <div className="text-lg font-semibold text-foreground">
            {summary.activeTasks.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md bg-secondary/30 px-3 py-2">
          <div className="text-muted-foreground">
            {t('dragonflyStatus.cacheHit', 'Cache hit')}
          </div>
          <div className={cn('text-lg font-semibold', cacheHitColor(summary.cacheHitPercent))}>
            {summary.cacheHitPercent}%
          </div>
        </div>
        <div className="rounded-md bg-secondary/30 px-3 py-2">
          <div className="text-muted-foreground">
            {t('dragonflyStatus.p2pUpstream', 'P2P / upstream')}
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {formatBytes(summary.p2pBytesServed, BINARY_DASH_FORMAT)} / {formatBytes(summary.upstreamBytes, BINARY_DASH_FORMAT)}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 overflow-y-auto scrollbar-thin pr-0.5">
        {components.length === 0 ? (
          <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
            {t('dragonflyStatus.noComponents', 'No Dragonfly components reporting.')}
          </div>
        ) : (
          components.map((row: DragonflyComponentRow) => {
            const readyAll = row.ready >= row.desired && row.desired > 0
            return (
              <div
                key={`${row.cluster}:${row.namespace}:${row.name}`}
                className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5">
                    {readyAll ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate font-mono">{row.name}</span>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] px-1.5 py-0.5 rounded-full shrink-0',
                      COMPONENT_BADGE[row.component],
                    )}
                  >
                    {componentLabels[row.component]}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate">
                    {row.namespace || '—'}
                    {row.cluster ? ` · ${row.cluster}` : ''}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 ml-2 tabular-nums',
                      readyAll ? 'text-green-400' : 'text-yellow-400',
                    )}
                  >
                    {t('dragonflyStatus.readyCount', {
                      ready: row.ready,
                      desired: row.desired,
                      defaultValue: '{{ready}}/{{desired}} ready',
                    })}
                  </span>
                </div>

                {row.version && (
                  <div className="text-[11px] text-muted-foreground/80">v{row.version}</div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default DragonflyStatus
