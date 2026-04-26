/**
 * Containerd Status Card
 *
 * Surfaces containerd container-runtime telemetry across connected clusters:
 * running containers (id, image, namespace, state, uptime, node).
 *
 * Follows the contour_status / jaeger_status card pattern:
 *   - Data via useCachedContainerd (useCache under the hood).
 *   - isDemoData + isRefreshing wired into useCardLoadingState (CLAUDE.md rule).
 *   - Skeleton during first load only (isLoading && !hasAnyData).
 *
 * Marketplace preset: cncf-containerd — kubestellar/console-marketplace#4
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Box, CheckCircle, PauseCircle, RefreshCw, Server, StopCircle } from 'lucide-react'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedContainerd } from '../../../hooks/useCachedContainerd'
import { useCardLoadingState } from '../CardDataContext'
import type { ContainerdContainer, ContainerdContainerState } from '../../../lib/demo/containerd'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_ROW_COUNT = 6

const STATE_ICON: Record<ContainerdContainerState, React.ReactNode> = {
  running: <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />,
  paused: <PauseCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
  stopped: <StopCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />,
}

const STATE_BADGE: Record<ContainerdContainerState, string> = {
  running: 'bg-green-500/20 text-green-400',
  paused: 'bg-yellow-500/20 text-yellow-400',
  stopped: 'bg-red-500/20 text-red-400',
}

function ContainerRow({ item }: { item: ContainerdContainer }) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          {STATE_ICON[item.state]}
          <span className="text-xs font-mono truncate">{item.id}</span>
        </div>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${STATE_BADGE[item.state]}`}
        >
          {item.state}
        </span>
      </div>

      <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
        <span className="truncate">{item.image || '-'}</span>
        <span className="truncate shrink-0 ml-2">{item.uptime}</span>
      </div>

      <div className="text-[11px] text-muted-foreground/80 flex items-center justify-between gap-2">
        <span className="truncate">{item.namespace}</span>
        <span className="truncate shrink-0 ml-2">{item.node}</span>
      </div>
    </div>
  )
}

export function ContainerdStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
    lastRefresh,
  } = useCachedContainerd()

  const hasAnyData = data.containers.length > 0

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
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={SKELETON_TITLE_WIDTH} height={SKELETON_TITLE_HEIGHT} />
          <Skeleton variant="rounded" width={SKELETON_BADGE_WIDTH} height={SKELETON_BADGE_HEIGHT} />
        </div>
        <SkeletonStats className="grid-cols-4" />
        <SkeletonList items={SKELETON_ROW_COUNT} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('containerdStatus.fetchFailed', 'Failed to fetch containerd status')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed' && !hasAnyData) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Box className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('containerdStatus.notDetected', 'containerd not detected')}</p>
        <p className="text-xs text-center max-w-xs">
          {t('containerdStatus.notDetectedHint', 'No nodes on connected clusters report containerd as their runtime.')}
        </p>
      </div>
    )
  }

  const isHealthy = data.health === 'healthy'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isHealthy ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {isHealthy ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {isHealthy
            ? t('containerdStatus.healthy', 'Healthy')
            : t('containerdStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('containerdStatus.total', 'Total')}
          value={data.summary.totalContainers}
          colorClass="text-cyan-400"
          icon={<Box className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('containerdStatus.running', 'Running')}
          value={data.summary.running}
          colorClass="text-green-400"
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
        />
        <MetricTile
          label={t('containerdStatus.paused', 'Paused')}
          value={data.summary.paused}
          colorClass={data.summary.paused > 0 ? 'text-yellow-400' : 'text-muted-foreground'}
          icon={<PauseCircle className="w-4 h-4 text-yellow-400" />}
        />
        <MetricTile
          label={t('containerdStatus.stopped', 'Stopped')}
          value={data.summary.stopped}
          colorClass={data.summary.stopped > 0 ? 'text-red-400' : 'text-muted-foreground'}
          icon={<StopCircle className="w-4 h-4 text-red-400" />}
        />
      </div>

      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('containerdStatus.containers', 'Containers')}
            </h4>
          </div>

          {data.containers.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('containerdStatus.noContainers', 'No containers reported')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.containers ?? []).map(c => (
                <ContainerRow key={`${c.node}:${c.id}:${c.namespace}`} item={c} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default ContainerdStatus
