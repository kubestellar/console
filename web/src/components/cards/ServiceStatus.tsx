import { useMemo, useState } from 'react'
import { Layers, Globe, Server, ExternalLink, Search, ChevronRight } from 'lucide-react'
import { useServices } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'

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

export function ServiceStatus() {
  const {
    services,
    isLoading: hookLoading,
    isRefreshing,
    error,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useServices()

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && services.length === 0
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToService } = useDrillDownActions()
  const [sortBy, setSortBy] = useState<SortByOption>('type')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(10)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter by selected clusters
  const filteredServices = useMemo(() => {
    let filtered = isAllClustersSelected
      ? services
      : services.filter(s => s.cluster && selectedClusters.includes(s.cluster))

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.namespace?.toLowerCase().includes(query) ||
        s.type?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [services, selectedClusters, isAllClustersSelected, searchQuery])

  // Sort services
  const sortedServices = useMemo(() => {
    const sorted = [...filteredServices].sort((a, b) => {
      let result = 0
      switch (sortBy) {
        case 'type':
          // Order: LoadBalancer, NodePort, ClusterIP, ExternalName
          const typeOrder: Record<string, number> = { 'LoadBalancer': 0, 'NodePort': 1, 'ClusterIP': 2, 'ExternalName': 3 }
          result = (typeOrder[a.type || ''] ?? 4) - (typeOrder[b.type || ''] ?? 4)
          break
        case 'name':
          result = a.name.localeCompare(b.name)
          break
        case 'namespace':
          result = (a.namespace || '').localeCompare(b.namespace || '')
          break
        case 'ports':
          result = (b.ports?.length || 0) - (a.ports?.length || 0)
          break
      }
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [filteredServices, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayServices,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedServices, effectivePerPage)

  // Stats
  const stats = useMemo(() => ({
    total: filteredServices.length,
    loadBalancer: filteredServices.filter(s => s.type === 'LoadBalancer').length,
    nodePort: filteredServices.filter(s => s.type === 'NodePort').length,
    clusterIP: filteredServices.filter(s => s.type === 'ClusterIP').length,
  }), [filteredServices])

  const hasRealData = !isLoading && filteredServices.length > 0

  if (isLoading) {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-foreground">Service Status</span>
          {hasRealData && (
            <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              Live
            </span>
          )}
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

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search services..."
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-secondary/50 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-secondary/50 text-center">
          <div className="text-sm font-bold text-foreground">{stats.total}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
        <div className="p-1.5 rounded-lg bg-blue-500/10 text-center">
          <div className="text-sm font-bold text-blue-400">{stats.loadBalancer}</div>
          <div className="text-[10px] text-muted-foreground">LB</div>
        </div>
        <div className="p-1.5 rounded-lg bg-purple-500/10 text-center">
          <div className="text-sm font-bold text-purple-400">{stats.nodePort}</div>
          <div className="text-[10px] text-muted-foreground">NodePort</div>
        </div>
        <div className="p-1.5 rounded-lg bg-green-500/10 text-center">
          <div className="text-sm font-bold text-green-400">{stats.clusterIP}</div>
          <div className="text-[10px] text-muted-foreground">ClusterIP</div>
        </div>
      </div>

      {/* Service List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {displayServices.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {error ? 'Failed to load services' : searchQuery ? 'No matching services' : 'No services found'}
          </div>
        ) : (
          displayServices.map(service => (
            <div
              key={`${service.cluster}-${service.namespace}-${service.name}`}
              onClick={() => drillToService(service.cluster || '', service.namespace || '', service.name, {
                type: service.type,
                ports: service.ports,
                clusterIP: service.clusterIP,
              })}
              className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getTypeIcon(service.type || 'ClusterIP')}
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate group-hover:text-cyan-400">{service.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {service.namespace} • {service.cluster}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {service.ports && service.ports.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {service.ports.join(', ')}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-xs ${getTypeColor(service.type || 'ClusterIP')}`}>
                  {service.type || 'ClusterIP'}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
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
