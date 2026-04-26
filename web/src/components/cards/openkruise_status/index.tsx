import { useState, useMemo } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Server,
  Play,
  Layers,
  Database,
  HardDrive,
  Boxes,
  Radio,
  CalendarClock,
  ExternalLink,
  PauseCircle,
} from 'lucide-react'
import { useClusters } from '../../../hooks/useMCP'
import { Skeleton } from '../../ui/Skeleton'
import { Select } from '../../ui/Select'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
  CardAIActions,
} from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import { useOpenKruiseStatus } from './useOpenKruiseStatus'
import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'

interface OpenKruiseStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

/** Unified display item that all OpenKruise resource types map into. */
interface OpenKruiseDisplayItem {
  id: string
  name: string
  namespace: string
  cluster: string
  category:
    | 'cloneset'
    | 'statefulset'
    | 'daemonset'
    | 'sidecarset'
    | 'broadcastjob'
    | 'cronjob'
  status: string
  primaryDetail: string
  secondaryDetail: string
  timestamp: string
}

type CategoryOption =
  | ''
  | 'cloneset'
  | 'statefulset'
  | 'daemonset'
  | 'sidecarset'
  | 'broadcastjob'
  | 'cronjob'

type SortByOption = 'status' | 'name' | 'category' | 'timestamp'
type SortTranslationKey =
  | 'common:common.status'
  | 'common:common.name'
  | 'cards:openkruiseStatus.category'
  | 'cards:openkruiseStatus.updated'

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  error: 0,
  degraded: 1,
  pending: 2,
  paused: 2,
  suspended: 3,
  updating: 3,
  running: 4,
  active: 4,
  succeeded: 5,
  healthy: 5,
}

// Static Tailwind class maps so the JIT can statically detect the classes.
const ICON_COLOR_CLASS: Record<string, string> = {
  green: 'text-green-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  yellow: 'text-yellow-400',
  gray: 'text-gray-400',
  orange: 'text-orange-400',
}

// Issue 9071: `gray` entry uses semantic tokens so the neutral badge adapts to light/dark.
const BADGE_COLOR_CLASS: Record<string, string> = {
  green: 'bg-green-500/20 text-green-400',
  red: 'bg-red-500/20 text-red-400',
  blue: 'bg-blue-500/20 text-blue-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  gray: 'bg-muted text-muted-foreground',
  orange: 'bg-orange-500/20 text-orange-400',
}

// Named constants for relative-time formatting (previously magic numbers).

const SORT_OPTIONS_KEYS: ReadonlyArray<{
  value: SortByOption
  labelKey: SortTranslationKey
}> = [
  { value: 'status', labelKey: 'common:common.status' },
  { value: 'name', labelKey: 'common:common.name' },
  { value: 'category', labelKey: 'cards:openkruiseStatus.category' },
  { value: 'timestamp', labelKey: 'cards:openkruiseStatus.updated' },
]

export function OpenKruiseStatus({ config: _config }: OpenKruiseStatusProps) {
  const { t } = useTranslation(['cards', 'common'])
  const SORT_OPTIONS = useMemo(
    () =>
      SORT_OPTIONS_KEYS.map(opt => ({
        value: opt.value,
        label: String(t(opt.labelKey)),
      })),
    [t],
  )

  // --- Required hooks ---
  const { isLoading: clustersLoading } = useClusters()
  const { isDemoMode } = useDemoMode()
  const { selectedClusters } = useGlobalFilters()

  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>(
    '' as CategoryOption,
  )

  // Live data comes from useOpenKruiseStatus (backed by useCache). It falls
  // back to OPENKRUISE_DEMO_DATA via useCache's demoWhenEmpty path when the
  // fetcher fails or returns nothing, so the card always has something to
  // render.
  const {
    data: rawData,
    isLoading: dataLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
  } = useOpenKruiseStatus()

  // isDemoData is true whenever we're showing demo-sourced data — explicit
  // demo mode or the live fetcher fell back.
  const isDemoData = isDemoMode || isDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || dataLoading,
    isRefreshing,
    hasAnyData:
      rawData.cloneSets.length > 0 ||
      rawData.advancedStatefulSets.length > 0 ||
      rawData.advancedDaemonSets.length > 0 ||
      rawData.sidecarSets.length > 0 ||
      rawData.broadcastJobs.length > 0 ||
      rawData.advancedCronJobs.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData,
    lastRefresh,
  })

  // Transform every OpenKruise resource into a unified display item -----
  const allItems = useMemo<OpenKruiseDisplayItem[]>(() => {
    const items: OpenKruiseDisplayItem[] = []

    for (const cs of rawData.cloneSets) {
      const partitionStr =
        cs.partition > 0
          ? `, ${t('openkruiseStatus.partition')} ${cs.partition}`
          : ''
      items.push({
        id: `cs-${cs.cluster}-${cs.namespace}-${cs.name}`,
        name: cs.name,
        namespace: cs.namespace,
        cluster: cs.cluster,
        category: 'cloneset',
        status: cs.status,
        primaryDetail: `${cs.readyReplicas}/${cs.replicas} ${t('openkruiseStatus.ready')} \u2022 ${cs.updateStrategy}${partitionStr}`,
        secondaryDetail: cs.image.split('/').pop() || cs.image,
        timestamp: cs.updatedAt,
      })
    }

    for (const ss of rawData.advancedStatefulSets) {
      items.push({
        id: `ss-${ss.cluster}-${ss.namespace}-${ss.name}`,
        name: ss.name,
        namespace: ss.namespace,
        cluster: ss.cluster,
        category: 'statefulset',
        status: ss.status,
        primaryDetail: `${ss.readyReplicas}/${ss.replicas} ${t('openkruiseStatus.ready')} \u2022 ${ss.podManagementPolicy} \u2022 ${ss.updateStrategy}`,
        secondaryDetail: ss.image.split('/').pop() || ss.image,
        timestamp: ss.updatedAt,
      })
    }

    for (const ds of rawData.advancedDaemonSets) {
      items.push({
        id: `ds-${ds.cluster}-${ds.namespace}-${ds.name}`,
        name: ds.name,
        namespace: ds.namespace,
        cluster: ds.cluster,
        category: 'daemonset',
        status: ds.status,
        primaryDetail: `${ds.numberReady}/${ds.desiredScheduled} ${t('openkruiseStatus.nodes')} \u2022 ${ds.rollingUpdateType}`,
        secondaryDetail: ds.image.split('/').pop() || ds.image,
        timestamp: ds.updatedAt,
      })
    }

    for (const sc of rawData.sidecarSets) {
      const containers = (sc.sidecarContainers || []).join(', ')
      items.push({
        id: `sc-${sc.cluster}-${sc.name}`,
        name: sc.name,
        namespace: '-',
        cluster: sc.cluster,
        category: 'sidecarset',
        status: sc.status,
        primaryDetail: `${sc.injectedPods}/${sc.matchedPods} ${t('openkruiseStatus.injected')} \u2022 ${sc.readyPods} ${t('openkruiseStatus.ready')}`,
        secondaryDetail: `${t('openkruiseStatus.containers')}: ${containers}`,
        timestamp: sc.updatedAt,
      })
    }

    for (const bj of rawData.broadcastJobs) {
      items.push({
        id: `bj-${bj.cluster}-${bj.namespace}-${bj.name}`,
        name: bj.name,
        namespace: bj.namespace,
        cluster: bj.cluster,
        category: 'broadcastjob',
        status: bj.status,
        primaryDetail: `${bj.succeeded}/${bj.desired} ${t('openkruiseStatus.succeeded')} \u2022 ${bj.active} ${t('openkruiseStatus.active')} \u2022 ${bj.failed} ${t('common:common.failed')}`,
        secondaryDetail: `${t('openkruiseStatus.completionPolicy')}: ${bj.completionPolicyType}`,
        timestamp: bj.completedAt ?? bj.startedAt,
      })
    }

    for (const cj of rawData.advancedCronJobs) {
      items.push({
        id: `cj-${cj.cluster}-${cj.namespace}-${cj.name}`,
        name: cj.name,
        namespace: cj.namespace,
        cluster: cj.cluster,
        category: 'cronjob',
        status: cj.status,
        primaryDetail: `${cj.schedule} \u2022 ${cj.templateKind} \u2022 ${cj.active} ${t('openkruiseStatus.active')}`,
        secondaryDetail: `${cj.successfulRuns} ${t('openkruiseStatus.runs')}, ${cj.failedRuns} ${t('common:common.failed')}`,
        timestamp: cj.lastScheduleTime ?? rawData.lastCheckTime,
      })
    }

    return items
  }, [rawData, t])

  // Respect global cluster filters
  const globalFiltered = useMemo(() => {
    if (!selectedClusters || selectedClusters.length === 0) return allItems
    return allItems.filter(item => selectedClusters.includes(item.cluster))
  }, [allItems, selectedClusters])

  // Pre-filter by the resource-type selector
  const categoryFiltered = useMemo(() => {
    if (!selectedCategory) return globalFiltered
    return globalFiltered.filter(item => item.category === selectedCategory)
  }, [globalFiltered, selectedCategory])

  // Shared card data hook (filter, sort, paginate)
  const {
    items: displayItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useCardData<OpenKruiseDisplayItem, SortByOption>(categoryFiltered, {
    filter: {
      searchFields: [
        'name',
        'namespace',
        'primaryDetail',
        'secondaryDetail',
      ] as (keyof OpenKruiseDisplayItem)[],
      clusterField: 'cluster' as keyof OpenKruiseDisplayItem,
      statusField: 'status' as keyof OpenKruiseDisplayItem,
      storageKey: 'openkruise-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) =>
          (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
        name: (a, b) => a.name.localeCompare(b.name),
        category: (a, b) => a.category.localeCompare(b.category),
        timestamp: (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      },
    },
    defaultLimit: 5,
  })

  // Helpers ---------------------------------------------------------
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'healthy':
        return CheckCircle
      case 'failed':
      case 'error':
        return XCircle
      case 'running':
      case 'active':
        return Play
      case 'updating':
      case 'pending':
        return Clock
      case 'suspended':
      case 'paused':
        return PauseCircle
      default:
        return AlertTriangle
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'healthy':
        return 'green'
      case 'failed':
      case 'error':
        return 'red'
      case 'running':
      case 'active':
        return 'blue'
      case 'updating':
      case 'pending':
        return 'yellow'
      case 'suspended':
      case 'paused':
        return 'gray'
      default:
        return 'orange'
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'cloneset':
        return Layers
      case 'statefulset':
        return Database
      case 'daemonset':
        return HardDrive
      case 'sidecarset':
        return Boxes
      case 'broadcastjob':
        return Radio
      case 'cronjob':
        return CalendarClock
      default:
        return Server
    }
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'cloneset':
        return t('openkruiseStatus.cloneSet')
      case 'statefulset':
        return t('openkruiseStatus.advancedStatefulSet')
      case 'daemonset':
        return t('openkruiseStatus.advancedDaemonSet')
      case 'sidecarset':
        return t('openkruiseStatus.sidecarSet')
      case 'broadcastjob':
        return t('openkruiseStatus.broadcastJob')
      case 'cronjob':
        return t('openkruiseStatus.advancedCronJob')
      default:
        return category
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < MS_PER_MINUTE) return `<1m ${t('openkruiseStatus.ago')}`
    if (diff < MS_PER_HOUR)
      return `${Math.max(1, Math.floor(diff / MS_PER_MINUTE))}m ${t('openkruiseStatus.ago')}`
    if (diff < MS_PER_DAY)
      return `${Math.floor(diff / MS_PER_HOUR)}h ${t('openkruiseStatus.ago')}`
    return `${Math.floor(diff / MS_PER_DAY)}d ${t('openkruiseStatus.ago')}`
  }

  // Summary counts (from global+category filtered set, before search)
  const healthyCount = globalFiltered.filter(
    i => i.status === 'healthy' || i.status === 'succeeded',
  ).length
  const failedCount = globalFiltered.filter(
    i => i.status === 'failed' || i.status === 'error' || i.status === 'degraded',
  ).length
  const sidecarInjectedCount = rawData.totalInjectedPods

  // --- Skeleton state ----------------------------------------------
  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={140} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="flex gap-2 mb-4">
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
          <Skeleton variant="rounded" height={52} className="flex-1" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
      </div>
    )
  }

  // --- Empty state -------------------------------------------------
  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <Layers className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">{t('openkruiseStatus.noResources')}</p>
        <p className="text-xs mt-1">{t('openkruiseStatus.connectCluster')}</p>
        <a
          href="https://openkruise.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-xs text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('openkruiseStatus.installGuide')}
        </a>
      </div>
    )
  }

  // --- Main render -------------------------------------------------
  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2 mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
        </div>
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: v => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Resource type selector */}
      <div className="mb-4">
        <Select
          value={selectedCategory}
          onChange={e =>
            setSelectedCategory(e.target.value as CategoryOption)
          }
          className="w-full"
          title={t('openkruiseStatus.filterByResource')}
          aria-label={t('openkruiseStatus.filterByResource')}
        >
          <option value="">{t('openkruiseStatus.allResources')}</option>
          <option value="cloneset">
            {t('openkruiseStatus.cloneSets')}
          </option>
          <option value="statefulset">
            {t('openkruiseStatus.advancedStatefulSets')}
          </option>
          <option value="daemonset">
            {t('openkruiseStatus.advancedDaemonSets')}
          </option>
          <option value="sidecarset">
            {t('openkruiseStatus.sidecarSets')}
          </option>
          <option value="broadcastjob">
            {t('openkruiseStatus.broadcastJobs')}
          </option>
          <option value="cronjob">
            {t('openkruiseStatus.advancedCronJobs')}
          </option>
        </Select>
      </div>

      {availableClusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {t('openkruiseStatus.noClusters')}
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                {t('common:common.nClusters', {
                  count: localClusterFilter.length,
                })}
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                {t('common:common.allClusters')}
              </span>
            )}
          </div>

          {/* Search */}
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder={t('openkruiseStatus.searchPlaceholder')}
            className="mb-4"
          />

          {/* Summary badges */}
          <div className="flex gap-2 mb-4">
            <div
              className="flex-1 p-2 rounded-lg bg-green-500/10 text-center cursor-default"
              title={`${healthyCount} ${t('openkruiseStatus.healthyResources')}`}
            >
              <span className="text-lg font-bold text-green-400">
                {healthyCount}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('openkruiseStatus.healthy')}
              </p>
            </div>
            <div
              className="flex-1 p-2 rounded-lg bg-red-500/10 text-center cursor-default"
              title={`${failedCount} ${t('openkruiseStatus.failedResources')}`}
            >
              <span className="text-lg font-bold text-red-400">
                {failedCount}
              </span>
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

          {/* Resource list */}
          <div
            ref={containerRef}
            className="flex-1 space-y-2 overflow-y-auto"
            style={containerStyle}
          >
            {displayItems.map(item => {
              const StatusIcon = getStatusIcon(item.status)
              const CategoryIcon = getCategoryIcon(item.category)
              const color = getStatusColor(item.status)
              const isFailedLike =
                item.status === 'failed' ||
                item.status === 'error' ||
                item.status === 'degraded'

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg ${
                    isFailedLike
                      ? 'bg-red-500/10 border border-red-500/20'
                      : 'bg-secondary/30'
                  } hover:bg-secondary/50 transition-colors cursor-pointer group`}
                  title={`${item.name} \u2014 ${getCategoryLabel(item.category)}`}
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
                            kind: getCategoryLabel(item.category),
                            name: item.name,
                            namespace: item.namespace,
                            cluster: item.cluster,
                            status: item.status,
                          }}
                          issues={[
                            {
                              name: t('openkruiseStatus.issueName', {
                                category: getCategoryLabel(item.category),
                                status: item.status,
                              }),
                              message: t('openkruiseStatus.issueMessage', {
                                category: getCategoryLabel(
                                  item.category,
                                ).toLowerCase(),
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
                    <span
                      className="shrink-0"
                      title={getCategoryLabel(item.category)}
                    >
                      <CategoryIcon className="w-3 h-3 inline mr-1" />
                      {getCategoryLabel(item.category)}
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
                      {formatTime(item.timestamp)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <CardPaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={
              typeof itemsPerPage === 'number' ? itemsPerPage : 10
            }
            onPageChange={goToPage}
            needsPagination={
              needsPagination && itemsPerPage !== 'unlimited'
            }
          />

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-1.5">
            <Server className="w-3 h-3" />
            {t('openkruiseStatus.footer', {
              count: totalItems,
              version: rawData.controllerVersion,
              scope:
                localClusterFilter.length === 1
                  ? localClusterFilter[0]
                  : t('openkruiseStatus.nClustersScope', {
                      count:
                        localClusterFilter.length > 1
                          ? localClusterFilter.length
                          : availableClusters.length,
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
        </>
      )}
    </div>
  )
}
