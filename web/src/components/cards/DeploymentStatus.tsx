import { useState, useMemo } from 'react'
import { CheckCircle, Clock, XCircle, ChevronRight, Search, Filter } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDeployments } from '../../hooks/useMCP'
import { usePagination, Pagination } from '../ui/Pagination'
import { CardControls, SortDirection } from '../ui/CardControls'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { useStatusFilter } from '../../lib/cards'

type StatusFilter = 'all' | 'running' | 'deploying' | 'failed'
type SortByOption = 'status' | 'name' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'cluster' as const, label: 'Cluster' },
]

const statusOrder: Record<string, number> = { failed: 0, deploying: 1, running: 2 }

const statusConfig = {
  running: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    barColor: 'bg-green-500',
    label: 'Running',
  },
  deploying: {
    icon: Clock,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    barColor: 'bg-yellow-500',
    label: 'Deploying',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    barColor: 'bg-red-500',
    label: 'Failed',
  },
}

// Extract version from container image
function extractVersion(image?: string): string {
  if (!image) return 'unknown'
  const parts = image.split(':')
  if (parts.length > 1) {
    const tag = parts[parts.length - 1]
    if (tag.length > 20) return tag.substring(0, 12)
    return tag
  }
  return 'latest'
}

export function DeploymentStatus() {
  const { drillToDeployment } = useDrillDownActions()
  const {
    deployments: allDeployments,
    isLoading: hookLoading,
    refetch,
    isRefreshing,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useDeployments()

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && allDeployments.length === 0
  const { selectedClusters, isAllClustersSelected, filterByStatus: globalFilterByStatus, customFilter: globalCustomFilter } = useGlobalFilters()

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState('')
  const { statusFilter, setStatusFilter } = useStatusFilter({
    statuses: ['all', 'running', 'deploying', 'failed'] as const,
    defaultStatus: 'all',
    storageKey: 'deployment-status',
  })
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Apply global filters first
  const globalFilteredDeployments = useMemo(() => {
    let result = allDeployments

    // Filter by cluster selection
    if (!isAllClustersSelected) {
      result = result.filter(d => {
        const clusterName = d.cluster?.split('/').pop() || d.cluster || ''
        return selectedClusters.some(sc => sc.includes(clusterName) || clusterName.includes(sc.split('/').pop() || sc))
      })
    }

    // Apply global status filter
    result = globalFilterByStatus(result)

    // Apply global custom text filter
    if (globalCustomFilter.trim()) {
      const query = globalCustomFilter.toLowerCase()
      result = result.filter(d =>
        d.name.toLowerCase().includes(query) ||
        (d.cluster?.toLowerCase() || '').includes(query) ||
        (d.namespace?.toLowerCase() || '').includes(query) ||
        (d.image?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allDeployments, selectedClusters, isAllClustersSelected, globalFilterByStatus, globalCustomFilter])

  // Status counts (for all deployments)
  const statusCounts = useMemo(() => ({
    all: globalFilteredDeployments.length,
    running: globalFilteredDeployments.filter((d) => d.status === 'running').length,
    deploying: globalFilteredDeployments.filter((d) => d.status === 'deploying').length,
    failed: globalFilteredDeployments.filter((d) => d.status === 'failed').length,
  }), [globalFilteredDeployments])

  // Filtered and sorted deployments
  const filteredDeployments = useMemo(() => {
    let result = globalFilteredDeployments

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((d) => d.status === statusFilter)
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((d) =>
        d.name.toLowerCase().includes(query) ||
        d.namespace.toLowerCase().includes(query) ||
        (d.cluster && d.cluster.toLowerCase().includes(query))
      )
    }

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'status') cmp = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortBy === 'cluster') cmp = (a.cluster || '').localeCompare(b.cluster || '')
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [globalFilteredDeployments, statusFilter, searchQuery, sortBy, sortDirection])

  // Use shared pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: paginatedDeployments,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredDeployments, effectivePerPage)

  // Handle filter changes (reset page)
  const handleFilterChange = (newFilter: StatusFilter) => {
    setStatusFilter(newFilter)
    goToPage(1)
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    goToPage(1)
  }

  const handleDeploymentClick = (deployment: typeof allDeployments[0]) => {
    const clusterName = deployment.cluster?.split('/').pop() || deployment.cluster || 'unknown'
    drillToDeployment(clusterName, deployment.namespace, deployment.name, {
      status: deployment.status,
      version: extractVersion(deployment.image),
      replicas: { ready: deployment.readyReplicas, desired: deployment.replicas },
      progress: deployment.progress,
    })
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-2">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-2" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={70} />
        </div>
      </div>
    )
  }

  if (globalFilteredDeployments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No deployments found
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0 content-loaded">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {statusCounts.all} deployments
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={() => refetch()}
          />
        </div>
      </div>

      {/* Search and Status Filter Pills */}
      <div className="flex flex-col gap-2 mb-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search deployments..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
          {(['all', 'running', 'deploying', 'failed'] as StatusFilter[]).map((status) => {
            const count = statusCounts[status]
            const isActive = statusFilter === status
            const statusStyle = status === 'all' ? null : statusConfig[status]

            return (
              <button
                key={status}
                onClick={() => handleFilterChange(status)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${
                  isActive
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {statusStyle && <statusStyle.icon className={`w-3 h-3 ${isActive ? statusStyle.color : ''}`} />}
                <span className="capitalize">{status}</span>
                <span className={`px-1 rounded text-[10px] ${isActive ? 'bg-purple-500/30' : 'bg-secondary'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Deployments list */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-card-content">
        {paginatedDeployments.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No deployments match the current filters
          </div>
        ) : (
          paginatedDeployments.map((deployment) => {
            const config = statusConfig[deployment.status as keyof typeof statusConfig] || statusConfig.running
            const StatusIcon = config.icon
            const clusterName = deployment.cluster?.split('/').pop() || deployment.cluster || 'unknown'
            const version = extractVersion(deployment.image)

            return (
              <div
                key={`${deployment.cluster}-${deployment.namespace}-${deployment.name}`}
                onClick={() => handleDeploymentClick(deployment)}
                className="p-2.5 rounded-lg bg-secondary/30 border border-border/50 cursor-pointer hover:bg-secondary/50 hover:border-border transition-colors group"
                title={`Click to view details for ${deployment.name}`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <ClusterBadge cluster={clusterName} />
                      <span className="text-xs text-muted-foreground">{deployment.namespace}</span>
                      <StatusIcon className={`w-3.5 h-3.5 ${config.color}`} />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {deployment.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-foreground">{version}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {deployment.readyReplicas}/{deployment.replicas} ready
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full ${config.barColor} transition-all duration-500`}
                    style={{ width: `${deployment.progress}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2 flex-shrink-0">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
