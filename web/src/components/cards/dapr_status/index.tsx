/**
 * Dapr Status Card
 *
 * Displays Dapr (Distributed Application Runtime, CNCF graduated) control
 * plane pod health, Dapr-enabled application count, and configured
 * components grouped by building block (state store / pubsub / binding).
 *
 * Follows the envoy_status / contour_status pattern for structure and
 * styling.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Dapr control plane bridge lands, the hook's fetcher will pick up
 * live data automatically with no component changes.
 */

import {
  AlertTriangle,
  Boxes,
  CheckCircle,
  Database,
  Layers,
  Link2,
  Radio,
  RefreshCw,
  Server,
  Shield,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { Skeleton, SkeletonList, SkeletonStats } from '../../ui/Skeleton'
import { useCachedDapr } from '../../../hooks/useCachedDapr'
import type {
  DaprComponent,
  DaprComponentType,
  DaprControlPlanePod,
} from './demoData'
import { formatTimeAgo } from '../../../lib/formatters'

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

const SKELETON_TITLE_WIDTH = 140
const SKELETON_TITLE_HEIGHT = 28
const SKELETON_BADGE_WIDTH = 90
const SKELETON_BADGE_HEIGHT = 20
const SKELETON_LIST_ITEMS = 5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function componentTypeLabel(
  type: DaprComponentType,
  t: TFunction<'cards'>,
): string {
  if (type === 'state-store') return t('daprStatus.componentStateStore', 'State store')
  if (type === 'pubsub') return t('daprStatus.componentPubSub', 'Pub/sub')
  return t('daprStatus.componentBinding', 'Binding')
}

function componentTypeColor(type: DaprComponentType): string {
  if (type === 'state-store') return 'text-emerald-400'
  if (type === 'pubsub') return 'text-violet-400'
  return 'text-cyan-400'
}

function ComponentIcon({ type }: { type: DaprComponentType }) {
  const color = componentTypeColor(type)
  const className = `w-3.5 h-3.5 shrink-0 ${color}`
  if (type === 'state-store') return <Database className={className} />
  if (type === 'pubsub') return <Radio className={className} />
  return <Link2 className={className} />
}

// ---------------------------------------------------------------------------
// Subsections
// ---------------------------------------------------------------------------

function ControlPlaneRow({ pod }: { pod: DaprControlPlanePod }) {
  const isRunning = pod.status === 'running' && pod.replicasReady === pod.replicasDesired
  const statusClass = isRunning
    ? 'bg-green-500/20 text-green-400'
    : pod.status === 'pending'
      ? 'bg-yellow-500/20 text-yellow-400'
      : 'bg-red-500/20 text-red-400'

  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        {isRunning ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground truncate">{pod.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{pod.namespace}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-mono text-muted-foreground">
          {pod.replicasReady}/{pod.replicasDesired}
        </span>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${statusClass}`}>
          {pod.status}
        </span>
      </div>
    </div>
  )
}

function ComponentRow({
  component,
  t,
}: {
  component: DaprComponent
  t: TFunction<'cards'>
}) {
  return (
    <div className="rounded-md bg-secondary/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-1.5">
        <ComponentIcon type={component.type} />
        <span className="text-xs font-medium text-foreground truncate">{component.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{component.namespace}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[9rem]">
          {component.componentImpl}
        </span>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded-full bg-secondary/50 ${componentTypeColor(component.type)}`}
        >
          {componentTypeLabel(component.type, t)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DaprStatus() {
  const { t } = useTranslation('cards')
  const { data, isRefreshing, error, showSkeleton, showEmptyState } = useCachedDapr()

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
        <p className="text-sm text-red-400">
          {t('daprStatus.fetchError', 'Unable to fetch Dapr status')}
        </p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Shield className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">
          {t('daprStatus.notInstalled', 'Dapr not detected')}
        </p>
        <p className="text-xs text-center max-w-xs">
          {t(
            'daprStatus.notInstalledHint',
            'No Dapr control plane reachable from the connected clusters.',
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
            ? t('daprStatus.healthy', 'Healthy')
            : t('daprStatus.degraded', 'Degraded')}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{formatTimeAgo(data.lastCheckTime)}</span>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <MetricTile
          label={t('daprStatus.controlPlane', 'Control plane')}
          value={`${data.summary.runningControlPlanePods}/${data.summary.totalControlPlanePods}`}
          colorClass={
            data.summary.runningControlPlanePods === data.summary.totalControlPlanePods
              ? 'text-green-400'
              : 'text-yellow-400'
          }
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        <MetricTile
          label={t('daprStatus.apps', 'Dapr apps')}
          value={data.summary.totalDaprApps}
          colorClass="text-cyan-400"
          icon={<Boxes className="w-4 h-4 text-cyan-400" />}
        />
        <MetricTile
          label={t('daprStatus.components', 'Components')}
          value={data.summary.totalComponents}
          colorClass="text-foreground"
          icon={<Layers className="w-4 h-4 text-violet-400" />}
        />
        <MetricTile
          label={t('daprStatus.namespaces', 'Namespaces')}
          value={data.apps.namespaces}
          colorClass="text-foreground"
          icon={<Layers className="w-4 h-4 text-emerald-400" />}
        />
      </div>

      {/* Building block breakdown */}
      <div className="grid grid-cols-2 @sm:grid-cols-3 gap-2">
        <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('daprStatus.stateStores', 'State stores')}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {data.buildingBlocks.stateStores}
            </div>
          </div>
        </div>
        <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center gap-2">
          <Radio className="w-4 h-4 text-violet-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('daprStatus.pubsubs', 'Pub/sub')}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {data.buildingBlocks.pubsubs}
            </div>
          </div>
        </div>
        <div className="rounded-md bg-secondary/30 px-3 py-2 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              {t('daprStatus.bindings', 'Bindings')}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {data.buildingBlocks.bindings}
            </div>
          </div>
        </div>
      </div>

      {/* Control plane + component lists */}
      <div className="space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('daprStatus.sectionControlPlane', 'Control plane')}
            </h4>
          </div>

          {data.controlPlane.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('daprStatus.noControlPlane', 'No Dapr control plane pods detected')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.controlPlane ?? []).map(pod => (
                <ControlPlaneRow key={`${pod.cluster}:${pod.namespace}:${pod.name}`} pod={pod} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('daprStatus.sectionComponents', 'Components')}
            </h4>
          </div>

          {data.components.length === 0 ? (
            <div className="rounded-md bg-secondary/20 border border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {t('daprStatus.noComponents', 'No Dapr components configured')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data.components ?? []).map(component => (
                <ComponentRow
                  key={`${component.cluster}:${component.namespace}:${component.name}`}
                  component={component}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default DaprStatus
