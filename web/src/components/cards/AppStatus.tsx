import { useMemo } from 'react'
import { Box, CheckCircle, AlertTriangle, Clock, ChevronRight, Loader2 } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCachedDeployments } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useCardLoadingState } from './CardDataContext'
import {
  useCardData,
  commonComparators,
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards'

type SortByOption = 'status' | 'name' | 'clusters'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'clusters' as const, label: 'Clusters' },
]

const APP_SORT_COMPARATORS = {
  status: (a: AppData, b: AppData) => {
    const aScore = a.status.warning * 10 + a.status.pending
    const bScore = b.status.warning * 10 + b.status.pending
    return bScore - aScore
  },
  name: commonComparators.string<AppData>('name'),
  clusters: (a: AppData, b: AppData) => b.clusters.length - a.clusters.length,
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppStatusConfig {
  // Configuration options for AppStatus card
  // Future: Could add options for filtering, sorting, etc.
}

interface AppStatusProps {
  config?: AppStatusConfig
}

interface AppData {
  name: string
  namespace: string
  clusters: string[]
  status: { healthy: number; warning: number; pending: number }
}

export function AppStatus(_props: AppStatusProps) {
  const { drillToDeployment } = useDrillDownActions()
  const { deployments, isLoading, isFailed, consecutiveFailures } = useCachedDeployments()

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: deployments.length > 0,
    isFailed,
    consecutiveFailures,
  })

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Transform deployments into app data grouped by name
  const rawApps = useMemo((): AppData[] => {
    const appMap = new Map<string, AppData>()

    deployments.forEach(dep => {
      const key = dep.name
      if (!appMap.has(key)) {
        appMap.set(key, {
          name: dep.name,
          namespace: dep.namespace,
          clusters: [],
          status: { healthy: 0, warning: 0, pending: 0 },
        })
      }
      const app = appMap.get(key)!
      const clusterName = dep.cluster?.split('/').pop() || dep.cluster || 'unknown'
      if (!app.clusters.includes(clusterName)) {
        app.clusters.push(clusterName)
      }
      // Determine status based on deployment state
      if (dep.status === 'running' && dep.readyReplicas === dep.replicas) {
        app.status.healthy++
      } else if (dep.status === 'deploying' || dep.readyReplicas < dep.replicas) {
        app.status.pending++
      } else if (dep.status === 'failed') {
        app.status.warning++
      } else {
        app.status.healthy++
      }
    })

    return Array.from(appMap.values())
  }, [deployments])

  // Pre-filter by global cluster filter and custom text filter
  // (useCardData's clusterField doesn't support array fields, so we handle it here)
  const preFilteredApps = useMemo(() => {
    let filtered = rawApps

    // Filter by global selected clusters (clusters is an array field)
    if (!isAllClustersSelected) {
      filtered = filtered.map(app => ({
        ...app,
        clusters: app.clusters.filter(c =>
          globalSelectedClusters.some(gc => gc.includes(c) || c.includes(gc.split('/').pop() || gc))
        ),
      })).filter(app => app.clusters.length > 0)
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(app =>
        app.name.toLowerCase().includes(query) ||
        app.clusters.some(c => c.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [rawApps, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Use shared card data hook for search, cluster filter, sorting, and pagination
  const {
    items: apps,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
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
  } = useCardData<AppData, SortByOption>(preFilteredApps, {
    filter: {
      searchFields: ['name', 'namespace'],
      // No clusterField -- array cluster filtering is handled in preFilteredApps
      storageKey: 'app-status',
      customPredicate: (item, query) =>
        item.clusters.some(c => c.toLowerCase().includes(query)),
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'desc',
      comparators: APP_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  const handleAppClick = (app: AppData, cluster: string) => {
    // Drill down to the deployment in the specified cluster
    drillToDeployment(cluster, app.namespace, app.name)
  }

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">No applications found</p>
        <p className="text-xs mt-1">Deploy applications to see their status</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
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
          onSortChange: setSortBy as (sortBy: string) => void,
          sortDirection,
          onSortDirectionChange: setSortDirection,
        }}
      />

      {/* Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search workloads..."
        className="mb-3"
      />

      <div className="flex-1 space-y-3 overflow-y-auto">
      {apps.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No workloads found
        </div>
      ) : apps.map((app) => {
        const total = app.status.healthy + app.status.warning + app.status.pending

        return (
          <div
            key={`${app.name}-${app.namespace}`}
            onClick={() => handleAppClick(app, app.clusters[0])}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
            title={`Click to view details for ${app.name}`}
          >
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span title="Workload"><Box className="w-4 h-4 text-purple-400 shrink-0" /></span>
                <span className="text-sm font-medium text-foreground truncate" title={app.name}>{app.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground" title={`Deployed to ${total} cluster${total !== 1 ? 's' : ''}`}>
                  {total} cluster{total !== 1 ? 's' : ''}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-4">
              {app.status.healthy > 0 && (
                <div className="flex items-center gap-1" title={`${app.status.healthy} healthy instance${app.status.healthy !== 1 ? 's' : ''}`}>
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-green-400">{app.status.healthy}</span>
                </div>
              )}
              {app.status.warning > 0 && (
                <div className="flex items-center gap-1" title={`${app.status.warning} instance${app.status.warning !== 1 ? 's' : ''} with warnings`}>
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs text-yellow-400">{app.status.warning}</span>
                </div>
              )}
              {app.status.pending > 0 && (
                <div className="flex items-center gap-1" title={`${app.status.pending} pending instance${app.status.pending !== 1 ? 's' : ''}`}>
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-blue-400">{app.status.pending}</span>
                </div>
              )}
            </div>

            {/* Cluster badges */}
            <div className="flex flex-wrap gap-1 mt-2 overflow-hidden">
              {app.clusters.map((cluster) => (
                <ClusterBadge key={cluster} cluster={cluster} showIcon={false} />
              ))}
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
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />
    </div>
  )
}
