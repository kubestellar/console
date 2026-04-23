import { useMemo, type ComponentType, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Gauge,
  Server,
  Timer,
  XCircle,
} from 'lucide-react'
import { Skeleton, SkeletonStats, SkeletonList } from '../../ui/Skeleton'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import {
  CardAIActions,
  CardControlsRow,
  CardPaginationFooter,
  CardSearchInput,
} from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useClusters } from '../../../hooks/useMCP'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useKServeStatus } from './useKServeStatus'
import type { KServeService, KServeServiceStatus } from './demoData'

type SortByOption = 'status' | 'name' | 'rps' | 'latency' | 'updated'

const STATUS_ORDER: Record<KServeServiceStatus, number> = {
  'not-ready': 0,
  unknown: 1,
  ready: 2,
}

const STATUS_STYLES: Record<
  KServeServiceStatus,
  {
    icon: ComponentType<{ className?: string }>
    iconClass: string
    badgeClass: string
    labelKey: string
  }
> = {
  ready: {
    icon: CheckCircle,
    iconClass: 'text-green-400',
    badgeClass: 'bg-green-500/15 text-green-400',
    labelKey: 'kserve.ready',
  },
  'not-ready': {
    icon: XCircle,
    iconClass: 'text-red-400',
    badgeClass: 'bg-red-500/15 text-red-400',
    labelKey: 'kserve.notReady',
  },
  unknown: {
    icon: AlertTriangle,
    iconClass: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/15 text-yellow-400',
    labelKey: 'kserve.unknown',
  },
}

const SORT_OPTIONS_KEYS = [
  { value: 'status' as const, labelKey: 'common:common.status' },
  { value: 'name' as const, labelKey: 'common:common.name' },
  { value: 'rps' as const, labelKey: 'kserve.requestsPerSecond' },
  { value: 'latency' as const, labelKey: 'kserve.p95Latency' },
  { value: 'updated' as const, labelKey: 'kserve.updated' },
]

function StatTile({
  icon,
  label,
  value,
  colorClass,
  borderClass,
}: {
  icon: ReactNode
  label: string
  value: string | number
  colorClass: string
  borderClass: string
}) {
  return (
    <div className={`p-3 rounded-lg bg-secondary/30 border ${borderClass}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className={`text-xs ${colorClass}`}>{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
    </div>
  )
}

export function KServeStatus() {
  const { t } = useTranslation(['cards', 'common'])
  const { isLoading: clustersLoading } = useClusters()
  const { isDemoMode } = useDemoMode()

  const {
    data,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    consecutiveFailures,
    lastRefresh,
  } = useKServeStatus()

  const isDemoData = isDemoMode || isDemoFallback

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading || isLoading,
    isRefreshing,
    hasAnyData: (data.services?.length ?? 0) > 0 || (data.controllerPods?.total ?? 0) > 0,
    isFailed,
    consecutiveFailures,
    isDemoData,
    lastRefresh,
  })

  const sortOptions = useMemo(
    () =>
      SORT_OPTIONS_KEYS.map(opt => ({
        value: opt.value,
        label: String(t(opt.labelKey as never)),
      })),
    [t],
  )

  const {
    items: services,
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
  } = useCardData<KServeService, SortByOption>(data.services ?? [], {
    filter: {
      searchFields: [
        'name',
        'namespace',
        'cluster',
        'modelName',
        'runtime',
        'url',
      ],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'kserve-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
        name: (a, b) => a.name.localeCompare(b.name),
        rps: (a, b) => b.requestsPerSecond - a.requestsPerSecond,
        latency: (a, b) => a.p95LatencyMs - b.p95LatencyMs,
        updated: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      },
    },
    defaultLimit: 5,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card gap-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={100} height={20} />
        </div>
        <SkeletonStats className="grid-cols-4" />
        <Skeleton variant="rounded" height={32} />
        <SkeletonList items={3} className="flex-1" />
      </div>
    )
  }

  if (showEmptyState && isFailed) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <AlertTriangle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-400">{t('kserve.fetchError')}</p>
      </div>
    )
  }

  if (data.health === 'not-installed') {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2">
        <Server className="w-6 h-6 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t('kserve.notInstalled')}</p>
        <p className="text-xs text-center max-w-xs">{t('kserve.notInstalledHint')}</p>
        <a
          href="https://kserve.github.io/website/latest/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('kserve.installGuide')}
        </a>
      </div>
    )
  }

  const readyServices = (data.services ?? []).filter(s => s.status === 'ready').length
  const unhealthyServices = (data.services ?? []).filter(s => s.status !== 'ready').length
  const totalRps = (data.totalRequestsPerSecond ?? 0).toFixed(1)
  const avgP95 = data.avgP95LatencyMs ?? 0
  const isHealthy = data.health === 'healthy'

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 ${
              isHealthy
                ? 'bg-green-500/15 text-green-400'
                : 'bg-yellow-500/15 text-yellow-400'
            }`}
          >
            {isHealthy ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {isHealthy ? t('kserve.healthy') : t('kserve.degraded')}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Server className="w-3 h-3" />
            {data.controllerPods.ready}/{data.controllerPods.total} {t('kserve.controllerPods')}
          </span>
        </div>
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
          size="sm"
          showLabel={true}
        />
      </div>

      <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
        <StatTile
          icon={<Server className="w-4 h-4 text-blue-400" />}
          label={t('kserve.services')}
          value={data.services.length}
          colorClass="text-blue-400"
          borderClass="border-blue-500/20"
        />
        <StatTile
          icon={<CheckCircle className="w-4 h-4 text-green-400" />}
          label={t('kserve.readyServices')}
          value={readyServices}
          colorClass="text-green-400"
          borderClass="border-green-500/20"
        />
        <StatTile
          icon={<Gauge className="w-4 h-4 text-cyan-400" />}
          label={t('kserve.requestsPerSecond')}
          value={totalRps}
          colorClass="text-cyan-400"
          borderClass="border-cyan-500/20"
        />
        <StatTile
          icon={<Timer className="w-4 h-4 text-orange-400" />}
          label={t('kserve.p95Latency')}
          value={`${avgP95}ms`}
          colorClass="text-orange-400"
          borderClass="border-orange-500/20"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
          {unhealthyServices > 0 && (
            <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
              {t('kserve.servicesWithIssues', { count: unhealthyServices })}
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
            sortOptions,
            onSortChange: value => setSortBy(value as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('kserve.searchPlaceholder')}
      />

      <div ref={containerRef} style={containerStyle} className="flex-1 space-y-2 overflow-y-auto">
        {services.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            {localSearch.trim().length > 0
              ? t('kserve.noSearchResults')
              : t('kserve.noServices')}
          </div>
        ) : (
          services.map(service => {
            const statusStyle = STATUS_STYLES[service.status]
            const StatusIcon = statusStyle.icon
            const statusLabel = String(t(statusStyle.labelKey as never))
            const updatedLabel = (() => {
              const diff = Date.now() - new Date(service.updatedAt).getTime()
              if (isNaN(diff) || diff < 0) return String(t('kserve.syncedJustNow'))
              const minute = 60_000
              const hour = 60 * minute
              const day = 24 * hour
              if (diff < minute) return String(t('kserve.syncedJustNow'))
              if (diff < hour) return String(t('kserve.syncedMinutesAgo', { count: Math.floor(diff / minute) }))
              if (diff < day) return String(t('kserve.syncedHoursAgo', { count: Math.floor(diff / hour) }))
              return String(t('kserve.syncedDaysAgo', { count: Math.floor(diff / day) }))
            })()
            return (
              <div
                key={service.id}
                className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusIcon className={`w-4 h-4 ${statusStyle.iconClass}`} />
                    <span className="text-sm font-medium truncate">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {service.status !== 'ready' && (
                      <CardAIActions
                        resource={{
                          kind: 'InferenceService',
                          name: service.name,
                          namespace: service.namespace,
                          cluster: service.cluster,
                          status: service.status,
                        }}
                        issues={[
                          {
                            name: t('kserve.issueName', { name: service.name }),
                            message: t('kserve.issueMessage', { status: statusLabel }),
                          },
                        ]}
                      />
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded ${statusStyle.badgeClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <ClusterBadge cluster={service.cluster} size="sm" />
                  <span>{service.namespace}</span>
                  <span className="text-muted-foreground/60">•</span>
                  <span>{service.runtime}</span>
                  <span className="text-muted-foreground/60">•</span>
                  <span className="truncate">{service.modelName}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{t('kserve.replicas')}: {service.readyReplicas}/{service.desiredReplicas}</span>
                    <span>{t('kserve.requestsPerSecondShort')}: {service.requestsPerSecond.toFixed(1)}</span>
                    <span>{t('kserve.p95LatencyShort')}: {service.p95LatencyMs}ms</span>
                    {service.trafficPercent > 0 && (
                      <span>{t('kserve.traffic')}: {service.trafficPercent}%</span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {updatedLabel}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {t('kserve.footer', { count: totalItems })}
        </span>
        <a
          href="https://kserve.github.io/website/latest/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          {t('kserve.docs')}
        </a>
      </div>
    </div>
  )
}
