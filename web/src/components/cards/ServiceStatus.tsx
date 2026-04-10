import { Globe, Server, ExternalLink, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Service } from '../../hooks/useMCP'
import { useCachedServices } from '../../hooks/useCachedData'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardLoadingState } from './CardDataContext'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useCardData } from '../../lib/cards/cardHooks'
import { useTranslation } from 'react-i18next'
import {
  deriveServiceHealth,
  formatServicePorts,
  SERVICE_HEALTH_DOT_CLASSES,
  SERVICE_HEALTH_LABELS,
  type ServiceHealthStatus,
} from '../../lib/services/serviceHealth'
import {
  SERVICES_CACHE_TTL_MS,
  SERVICES_CACHE_STALE_MS,
  MS_PER_SECOND,
} from '../../lib/constants/network'

type SortByOption = 'type' | 'name' | 'namespace' | 'ports'

const SORT_OPTIONS = [
  { value: 'type' as const, label: 'Type' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'ports' as const, label: 'Ports' },
]

function getTypeIcon(type: string) {
  switch (type) {
    case 'LoadBalancer':
      return <Globe className="w-3 h-3 text-blue-400" />
    case 'NodePort':
      return <Server className="w-3 h-3 text-purple-400" />
    case 'ExternalName':
      return <ExternalLink className="w-3 h-3 text-orange-400" />
    default:
      return <Server className="w-3 h-3 text-green-400" />
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'LoadBalancer':
      return 'bg-blue-500/10 text-blue-400'
    case 'NodePort':
      return 'bg-purple-500/10 text-purple-400'
    case 'ExternalName':
      return 'bg-orange-500/10 text-orange-400'
    default:
      return 'bg-green-500/10 text-green-400'
  }
}

/**
 * Schedules at most two timeouts off `lastRefresh` — one for the
 * stale-threshold transition and one for the TTL/expired transition —
 * and re-renders the card only at those moments. Replaces the previous
 * 1-second interval that re-rendered indefinitely while `lastRefresh`
 * was truthy, even when the freshness badge was hidden (#6181).
 *
 * Returns the current wall-clock `Date.now()` snapshot, captured inside
 * the effect so the component stays pure per react-hooks rules.
 *
 * Note: `lastRefresh` is checked with `!= null` (NOT a truthy check) so
 * a `0` epoch timestamp would still be honored — the previous truthy
 * guard would have wrongly treated `0` as "no refresh" (#6181).
 */
function useFreshnessClock(lastRefresh: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  // Re-render the card immediately when `lastRefresh` changes so the
  // memoized cacheAgeMs reflects the new origin without waiting for a
  // scheduled timeout.
  const lastRefreshRef = useRef(lastRefresh)
  useEffect(() => {
    if (lastRefreshRef.current !== lastRefresh) {
      lastRefreshRef.current = lastRefresh
      setNow(Date.now())
    }
    if (lastRefresh == null) return
    const elapsed = Date.now() - lastRefresh
    const msUntilStale = SERVICES_CACHE_STALE_MS - elapsed
    const msUntilExpired = SERVICES_CACHE_TTL_MS - elapsed
    const timers: number[] = []
    if (msUntilStale > 0) {
      timers.push(window.setTimeout(() => setNow(Date.now()), msUntilStale))
    }
    if (msUntilExpired > 0) {
      timers.push(window.setTimeout(() => setNow(Date.now()), msUntilExpired))
    }
    return () => {
      for (const id of timers) window.clearTimeout(id)
    }
  }, [lastRefresh])
  return now
}

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
  const { showSkeleton } = useCardLoadingState({
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
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-3" />
        <div className="grid grid-cols-4 gap-2 mb-3">
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

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
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
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-secondary/50 text-center">
          <div className="text-sm font-bold text-foreground">{stats.total}</div>
          <div className="text-2xs text-muted-foreground">{t('common.total')}</div>
        </div>
        <div className="p-1.5 rounded-lg bg-blue-500/10 text-center">
          <div className="text-sm font-bold text-blue-400">{stats.loadBalancer}</div>
          <div className="text-2xs text-muted-foreground">LB</div>
        </div>
        <div className="p-1.5 rounded-lg bg-purple-500/10 text-center">
          <div className="text-sm font-bold text-purple-400">{stats.nodePort}</div>
          <div className="text-2xs text-muted-foreground">NodePort</div>
        </div>
        <div className="p-1.5 rounded-lg bg-green-500/10 text-center">
          <div className="text-sm font-bold text-green-400">{stats.clusterIP}</div>
          <div className="text-2xs text-muted-foreground">ClusterIP</div>
        </div>
      </div>

      {/* Service List */}
      <div ref={containerRef} className="flex-1 space-y-1.5 overflow-y-auto" style={containerStyle}>
        {displayServices.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {error ? t('serviceStatus.loadError', 'Failed to load services') : searchQuery ? t('serviceStatus.noMatch', 'No matching services') : t('serviceStatus.noServices', 'No services found')}
          </div>
        ) : (
          displayServices.map(service => {
            // Centralized health derivation (#6164, #6165, #6166, #6167)
            const health: ServiceHealthStatus = deriveServiceHealth(service)
            const formattedPorts = formatServicePorts(service)
            // When the backend did not report endpoint counts the card
            // should say so explicitly rather than rendering a misleading
            // "0 endpoints" that contradicts the unknown-status dot
            // (#6181). `endpointsKnown` gates the count vs. unknown label.
            const endpointsKnown = service.endpoints !== undefined
            const endpointCount = service.endpoints ?? 0
            return (
            <div
              key={`${service.cluster}-${service.namespace}-${service.name}`}
              onClick={() => drillToService(service.cluster || '', service.namespace || '', service.name, {
                type: service.type,
                ports: service.ports,
                clusterIP: service.clusterIP,
              })}
              className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group gap-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Connectivity dot — single source of truth via deriveServiceHealth (#6167) */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${SERVICE_HEALTH_DOT_CLASSES[health]}`}
                  role="status"
                  aria-label={SERVICE_HEALTH_LABELS[health]}
                  title={SERVICE_HEALTH_LABELS[health]}
                />
                {getTypeIcon(service.type || 'ClusterIP')}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground truncate group-hover:text-cyan-400">{service.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{service.namespace}</span>
                    <ClusterBadge cluster={service.cluster || ''} size="sm" />
                    {endpointsKnown ? (
                      <span className="truncate" title={t('serviceStatus.endpointsTooltip', '{{count}} ready endpoint(s)', { count: endpointCount })}>
                        {t('serviceStatus.endpointsCount', {
                          defaultValue: '{{count}} endpoints',
                          count: endpointCount,
                        })}
                      </span>
                    ) : (
                      <span
                        className="truncate text-muted-foreground/70"
                        title={t('serviceStatus.endpointsUnknownTooltip', 'Endpoint count unavailable')}
                      >
                        {t('serviceStatus.endpointsUnknown', 'Endpoints unknown')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {formattedPorts.length > 0 && (
                  <span
                    className="text-xs text-muted-foreground truncate max-w-[140px]"
                    title={formattedPorts.join(', ')}
                  >
                    {formattedPorts.join(', ')}
                  </span>
                )}
                {/* Orphaned badge (#6164/#6165) */}
                {health === 'orphaned' && (
                  <span
                    className="px-1.5 py-0.5 rounded text-2xs shrink-0 bg-red-500/10 text-red-400 border border-red-500/20"
                    title={SERVICE_HEALTH_LABELS.orphaned}
                  >
                    {t('serviceStatus.orphanedBadge', 'Orphaned')}
                  </span>
                )}
                {/* Provisioning badge (#6167) */}
                {health === 'provisioning' && (
                  <span
                    className="px-1.5 py-0.5 rounded text-2xs shrink-0 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                    title={SERVICE_HEALTH_LABELS.provisioning}
                  >
                    {t('serviceStatus.provisioningBadge', 'Provisioning')}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${getTypeColor(service.type || 'ClusterIP')}`}>
                  {service.type || 'ClusterIP'}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
            </div>
            )
          })
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
