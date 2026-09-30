/**
 * Presentational sub-components for the OpenKruise Status card.
 *
 * Extracted from index.tsx: the resource-type selector, the summary badge
 * strip, and the per-resource list row all live here so the main card
 * component can focus on data wiring.
 */
import type { TFunction } from 'i18next'
import { ChevronRight, ExternalLink, Server } from 'lucide-react'
import { Select } from '../../ui/Select'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import {
  BADGE_COLOR_CLASS,
  ICON_COLOR_CLASS,
  formatTime,
  getCategoryIcon,
  getCategoryLabel,
  getStatusColor,
  getStatusIcon,
  type CategoryOption,
  type OpenKruiseDisplayItem,
} from './helpers'

export function OpenKruiseCategorySelect({
  value,
  onChange,
  t,
}: {
  value: CategoryOption
  onChange: (value: CategoryOption) => void
  t: TFunction
}) {
  return (
    <Select
      value={value}
      onChange={e => onChange(e.target.value as CategoryOption)}
      className="w-full"
      title={t('openkruiseStatus.filterByResource')}
      aria-label={t('openkruiseStatus.filterByResource')}
    >
      <option value="">{t('openkruiseStatus.allResources')}</option>
      <option value="cloneset">{t('openkruiseStatus.cloneSets')}</option>
      <option value="statefulset">
        {t('openkruiseStatus.advancedStatefulSets')}
      </option>
      <option value="daemonset">
        {t('openkruiseStatus.advancedDaemonSets')}
      </option>
      <option value="sidecarset">{t('openkruiseStatus.sidecarSets')}</option>
      <option value="broadcastjob">
        {t('openkruiseStatus.broadcastJobs')}
      </option>
      <option value="cronjob">
        {t('openkruiseStatus.advancedCronJobs')}
      </option>
    </Select>
  )
}

export function OpenKruiseSummaryBadges({
  healthyCount,
  failedCount,
  sidecarInjectedCount,
  t,
}: {
  healthyCount: number
  failedCount: number
  sidecarInjectedCount: number
  t: TFunction
}) {
  return (
    <div className="flex gap-2 mb-4">
      <div
        className="flex-1 p-2 rounded-lg bg-green-500/10 text-center cursor-default"
        title={`${healthyCount} ${t('openkruiseStatus.healthyResources')}`}
      >
        <span className="text-lg font-bold text-green-400">{healthyCount}</span>
        <p className="text-xs text-muted-foreground">
          {t('openkruiseStatus.healthy')}
        </p>
      </div>
      <div
        className="flex-1 p-2 rounded-lg bg-red-500/10 text-center cursor-default"
        title={`${failedCount} ${t('openkruiseStatus.failedResources')}`}
      >
        <span className="text-lg font-bold text-red-400">{failedCount}</span>
        <p className="text-xs text-muted-foreground">
          {t('common:common.failed')}
        </p>
      </div>
      <div
        className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center cursor-default"
        title={t('openkruiseStatus.injectedPodsTooltip', {
          count: sidecarInjectedCount,
        })}
      >
        <span className="text-lg font-bold text-blue-400">
          {sidecarInjectedCount}
        </span>
        <p className="text-xs text-muted-foreground">
          {t('openkruiseStatus.sidecarPods')}
        </p>
      </div>
    </div>
  )
}

export function OpenKruiseResourceItem({ item, t }: { item: OpenKruiseDisplayItem; t: TFunction }) {
  const StatusIcon = getStatusIcon(item.status)
  const CategoryIcon = getCategoryIcon(item.category)
  const color = getStatusColor(item.status)
  const isFailedLike =
    item.status === 'failed' ||
    item.status === 'error' ||
    item.status === 'degraded'

  return (
    <div
      className={`p-3 rounded-lg ${
        isFailedLike
          ? 'bg-red-500/10 border border-red-500/20'
          : 'bg-secondary/30'
      } hover:bg-secondary/50 transition-colors cursor-pointer group`}
      title={`${item.name} \u2014 ${getCategoryLabel(item.category, t)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
        <div className="flex items-center gap-2">
          <span title={`${t('common:common.status')}: ${item.status}`}>
            <StatusIcon
              className={`w-4 h-4 ${ICON_COLOR_CLASS[color] ?? ICON_COLOR_CLASS.orange}`}
            />
          </span>
          <span
            className="text-sm text-foreground font-medium group-hover:text-purple-400"
            title={item.name}
          >
            {item.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isFailedLike && (
            <CardAIActions
              resource={{
                kind: getCategoryLabel(item.category, t),
                name: item.name,
                namespace: item.namespace,
                cluster: item.cluster,
                status: item.status,
              }}
              issues={[
                {
                  name: t('openkruiseStatus.issueName', {
                    category: getCategoryLabel(item.category, t),
                    status: item.status,
                  }),
                  message: t('openkruiseStatus.issueMessage', {
                    category: getCategoryLabel(item.category, t).toLowerCase(),
                    name: item.name,
                    status: item.status,
                  }),
                },
              ]}
            />
          )}
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${BADGE_COLOR_CLASS[color] ?? BADGE_COLOR_CLASS.orange}`}
            title={`${t('common:common.status')}: ${item.status}`}
          >
            {item.status}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground min-w-0">
        {item.cluster && (
          <div className="shrink-0">
            <ClusterBadge cluster={item.cluster} size="sm" />
          </div>
        )}
        <span className="shrink-0" title={getCategoryLabel(item.category, t)}>
          <CategoryIcon className="w-3 h-3 inline mr-1" />
          {getCategoryLabel(item.category, t)}
        </span>
        <span className="truncate" title={item.primaryDetail}>
          {item.primaryDetail}
        </span>
        {item.secondaryDetail && (
          <span
            className="truncate text-muted-foreground/70"
            title={item.secondaryDetail}
          >
            {item.secondaryDetail}
          </span>
        )}
        <span
          className="ml-auto shrink-0 whitespace-nowrap"
          title={new Date(item.timestamp).toLocaleString()}
        >
          {formatTime(item.timestamp, t)}
        </span>
      </div>
    </div>
  )
}

export function OpenKruiseClusterScopeBadge({
  localClusterFilter,
  t,
}: {
  localClusterFilter: string[]
  t: TFunction
}) {
  if (localClusterFilter.length === 1) {
    return <ClusterBadge cluster={localClusterFilter[0]} />
  }
  if (localClusterFilter.length > 1) {
    return (
      <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
        {t('common:common.nClusters', { count: localClusterFilter.length })}
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
      {t('common:common.allClusters')}
    </span>
  )
}

export function OpenKruiseFooter({
  totalItems,
  controllerVersion,
  localClusterFilter,
  availableClustersCount,
  t,
}: {
  totalItems: number
  controllerVersion: string
  localClusterFilter: string[]
  availableClustersCount: number
  t: TFunction
}) {
  return (
    <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-1.5">
      <Server className="w-3 h-3" />
      {t('openkruiseStatus.footer', {
        count: totalItems,
        version: controllerVersion,
        scope:
          localClusterFilter.length === 1
            ? localClusterFilter[0]
            : t('openkruiseStatus.nClustersScope', {
                count:
                  localClusterFilter.length > 1
                    ? localClusterFilter.length
                    : availableClustersCount,
              }),
      })}
      <a
        href="https://openkruise.io/docs/"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-blue-400 hover:underline flex items-center gap-1"
      >
        <ExternalLink className="w-3 h-3" />
        {t('openkruiseStatus.docs')}
      </a>
    </div>
  )
}
