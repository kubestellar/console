import { Globe } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { Service } from '../../hooks/useMCP'
import { useCachedServices } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardEmptyState } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useTranslation } from 'react-i18next'
import {
  SERVICES_CACHE_TTL_MS,
  SERVICES_CACHE_STALE_MS,
  MS_PER_SECOND,
} from '../../lib/constants/network'
import { useFreshnessClock } from './servicestatus/useFreshnessClock'
import {
  ServiceRow,
  ServiceStatsRow,
  SORT_OPTIONS,
  type SortByOption,
} from './servicestatus/ServiceStatus.parts'

export function ServiceStatus() {
  const { t } = useTranslation()
  const {
    services: rawServices,
    isLoading: hookLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    error,
    refetch,
  } = useCachedServices()

  const { drillToService } = useDrillDownActions()

  // Issue #6162: enforce a hard TTL on the cached payload. If the data is
  // older than SERVICES_CACHE_TTL_MS, treat it as empty so the UI does not
  // render indefinitely-stale data, AND proactively call refetch() so the
  // card recovers even if the auto-refresh tick is paused or delayed
  // (#6181). `now` is pulled from a freshness clock that schedules at most
  // two timeouts (stale + expired) instead of ticking every second, so the
  // card no longer re-renders forever while a fresh cache sits idle.
  const now = useFreshnessClock(lastRefresh)
  // `lastRefresh != null` instead of a truthy check so a `0` epoch
  // timestamp is honored — a truthy guard would have produced a `null`
  // age and silently disabled the freshness badge (#6181).
  const cacheAgeMs = useMemo(
    () => (lastRefresh != null ? now - lastRefresh : null),
    [now, lastRefresh],
  )
  const isExpired = cacheAgeMs !== null && cacheAgeMs > SERVICES_CACHE_TTL_MS
  const isStale =
    cacheAgeMs !== null &&
    cacheAgeMs > SERVICES_CACHE_STALE_MS &&
    !isExpired
  const services = useMemo(
    () => (isExpired ? [] : rawServices),
    [isExpired, rawServices],
  )

  // When the cache crosses the TTL, kick off a refetch so the card
  // recovers even if the next scheduled auto-refresh is delayed (#6181).
  // Guarded so we only refetch on the rising edge of expiry — not on
  // every render while expired.
  const wasExpiredRef = useRef(false)
  useEffect(() => {
    if (isExpired && !wasExpiredRef.current) {
      wasExpiredRef.current = true
      refetch?.()
    } else if (!isExpired) {
      wasExpiredRef.current = false
    }
  }, [isExpired, refetch])

  // Report data state to CardWrapper for failure badge rendering
  const hasData = services.length > 0
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: hookLoading && !hasData,
    isRefreshing,
    isDemoData: isDemoFallback,
    hasAnyData: hasData,
    isFailed,
    consecutiveFailures,
  })

  const typeOrder: Record<string, number> = { 'LoadBalancer': 0, 'NodePort': 1, 'ClusterIP': 2, 'ExternalName': 3 }

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: displayServices,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: searchQuery,
      setSearch: setSearchQuery,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
    containerRef,
    containerStyle,
    allFilteredItems,
  } = useCardData<Service, SortByOption>(services, {
    filter: {
      searchFields: ['name', 'namespace', 'type'],
      clusterField: 'cluster',
      storageKey: 'service-status',
    },
    sort: {
      defaultField: 'type',
      defaultDirection: 'asc',
      comparators: {
        type: (a, b) => (typeOrder[a.type || ''] ?? 4) - (typeOrder[b.type || ''] ?? 4),
        name: (a, b) => a.name.localeCompare(b.name),
        namespace: (a, b) => (a.namespace || '').localeCompare(b.namespace || ''),
        ports: (a, b) => (b.ports?.length || 0) - (a.ports?.length || 0),
      },
    },
    defaultLimit: 10,
  })

  const handleSelectService = (service: Service) => {
    drillToService(service.cluster || '', service.namespace || '', service.name, {
      type: service.type,
      ports: service.ports,
      clusterIP: service.clusterIP,
      externalIP: service.externalIP,
      endpoints: service.endpoints,
      lbStatus: service.lbStatus,
      selector: service.selector,
    })
  }

  // Stats — compute from allFilteredItems so type counts reflect all active
  // filters (global cluster, local cluster, search) and match totalItems (#5775)
  const stats = {
    total: totalItems,
    loadBalancer: allFilteredItems.filter(s => s.type === 'LoadBalancer').length,
    nodePort: allFilteredItems.filter(s => s.type === 'NodePort').length,
    clusterIP: allFilteredItems.filter(s => s.type === 'ClusterIP').length,
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-3" />
        <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </div>
        <div className="space-y-1.5">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <CardEmptyState
        icon={Globe}
        title={t('serviceStatus.emptyTitle', 'No services found')}
        message={t('serviceStatus.emptyMessage', 'Services will appear here once they are deployed to your clusters.')}
      />
    )
  }

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          {/* Cache freshness badge (#6162) */}
          {isStale && cacheAgeMs !== null && (
            <span
              className="px-1.5 py-0.5 rounded text-2xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
              title={t('serviceStatus.staleTooltip', 'Data older than the freshness threshold — refetching shortly')}
            >
              {t('serviceStatus.cachedAgo', {
                defaultValue: 'Cached • {{seconds}}s ago',
                seconds: Math.round(cacheAgeMs / MS_PER_SECOND),
              })}
            </span>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          }}
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
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={t('common.searchServices')}
        className="mb-3"
      />

      {/* Stats row */}
      <ServiceStatsRow stats={stats} />

      {/* Service List */}
      <div ref={containerRef} className="flex-1 space-y-1.5 overflow-y-auto" style={containerStyle}>
        {displayServices.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {error ? t('serviceStatus.loadError', 'Failed to load services') : searchQuery ? t('serviceStatus.noMatch', 'No matching services') : t('serviceStatus.noServices', 'No services found')}
          </div>
        ) : (
          displayServices.map(service => (
            <ServiceRow
              key={`${service.cluster}-${service.namespace}-${service.name}`}
              service={service}
              onSelect={handleSelectService}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </div>
  )
}
