import { useState, useMemo } from 'react'
import { ExternalLink, Layers, Server } from 'lucide-react'
import { useClusters } from '../../../hooks/useMCP'
import { Skeleton } from '../../ui/Skeleton'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../../lib/cards/CardComponents'
import { useCardData } from '../../../lib/cards/cardHooks'
import { useCardLoadingState } from '../CardDataContext'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useTranslation } from 'react-i18next'
import { useOpenKruiseStatus } from './useOpenKruiseStatus'
import {
  buildDisplayItems,
  STATUS_ORDER,
  SORT_OPTIONS_KEYS,
  type CategoryOption,
  type OpenKruiseDisplayItem,
  type SortByOption,
} from './helpers'
import {
  OpenKruiseCategorySelect,
  OpenKruiseClusterScopeBadge,
  OpenKruiseFooter,
  OpenKruiseResourceItem,
  OpenKruiseSummaryBadges,
} from './sections'

interface OpenKruiseStatusProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

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
  const allItems = useMemo<OpenKruiseDisplayItem[]>(
    () => buildDisplayItems(rawData, t),
    [rawData, t],
  )

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
        <OpenKruiseCategorySelect
          value={selectedCategory}
          onChange={setSelectedCategory}
          t={t}
        />
      </div>

      {availableClusters.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {t('openkruiseStatus.noClusters')}
        </div>
      ) : (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            <OpenKruiseClusterScopeBadge
              localClusterFilter={localClusterFilter}
              t={t}
            />
          </div>

          {/* Search */}
          <CardSearchInput
            value={localSearch}
            onChange={setLocalSearch}
            placeholder={t('openkruiseStatus.searchPlaceholder')}
            className="mb-4"
          />

          {/* Summary badges */}
          <OpenKruiseSummaryBadges
            healthyCount={healthyCount}
            failedCount={failedCount}
            sidecarInjectedCount={sidecarInjectedCount}
            t={t}
          />

          {/* Resource list */}
          <div
            ref={containerRef}
            className="flex-1 space-y-2 overflow-y-auto"
            style={containerStyle}
          >
            {displayItems.map(item => (
              <OpenKruiseResourceItem key={item.id} item={item} t={t} />
            ))}
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
          <OpenKruiseFooter
            totalItems={totalItems}
            controllerVersion={rawData.controllerVersion}
            localClusterFilter={localClusterFilter}
            availableClustersCount={availableClusters.length}
            t={t}
          />
        </>
      )}
    </div>
  )
}
