import { useMemo, useState } from 'react'
import { CheckCircle, AlertTriangle, Clock, Search, ChevronRight, Filter, ChevronDown, Server } from 'lucide-react'
import { usePVCs } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useChartFilters } from '../../lib/cards'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'

type SortByOption = 'status' | 'name' | 'capacity' | 'age'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'capacity' as const, label: 'Capacity' },
  { value: 'age' as const, label: 'Age' },
]

// Parse capacity string to bytes for sorting
function parseCapacity(capacity?: string): number {
  if (!capacity) return 0
  const match = capacity.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|Pi)?$/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = (match[2] || '').toLowerCase()
  const multipliers: Record<string, number> = {
    '': 1,
    'ki': 1024,
    'mi': 1024 * 1024,
    'gi': 1024 * 1024 * 1024,
    'ti': 1024 * 1024 * 1024 * 1024,
    'pi': 1024 * 1024 * 1024 * 1024 * 1024,
  }
  return value * (multipliers[unit] || 1)
}

function getStatusIcon(status: string) {
  switch (status.toLowerCase()) {
    case 'bound':
      return <CheckCircle className="w-3 h-3 text-green-400" />
    case 'pending':
      return <Clock className="w-3 h-3 text-yellow-400" />
    default:
      return <AlertTriangle className="w-3 h-3 text-red-400" />
  }
}

function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'bound':
      return 'text-green-400'
    case 'pending':
      return 'text-yellow-400'
    default:
      return 'text-red-400'
  }
}

export function PVCStatus() {
  const { pvcs, isLoading, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh } = usePVCs()
  const { drillToPVC } = useDrillDownActions()

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'pvc-status',
  })

  const [localSearch, setLocalSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(10)

  // Filter PVCs
  const filteredPVCs = useMemo(() => {
    let result = pvcs

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(pvc => {
        const clusterName = pvc.cluster || ''
        return localClusterFilter.includes(clusterName)
      })
    }

    // Apply search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(pvc =>
        pvc.name.toLowerCase().includes(query) ||
        pvc.namespace.toLowerCase().includes(query) ||
        (pvc.cluster?.toLowerCase() || '').includes(query) ||
        (pvc.storageClass?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [pvcs, localClusterFilter, localSearch])

  // Sort PVCs
  const sortedPVCs = useMemo(() => {
    const sorted = [...filteredPVCs].sort((a, b) => {
      let result = 0
      switch (sortBy) {
        case 'status':
          // Order: Failed, Pending, Bound
          const statusOrder: Record<string, number> = { 'failed': 0, 'lost': 0, 'pending': 1, 'bound': 2 }
          result = (statusOrder[a.status.toLowerCase()] ?? 1) - (statusOrder[b.status.toLowerCase()] ?? 1)
          break
        case 'name':
          result = a.name.localeCompare(b.name)
          break
        case 'capacity':
          result = parseCapacity(b.capacity) - parseCapacity(a.capacity)
          break
        case 'age':
          result = (a.age || '').localeCompare(b.age || '')
          break
      }
      return sortDirection === 'asc' ? result : -result
    })
    return sorted
  }, [filteredPVCs, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayPVCs,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(sortedPVCs, effectivePerPage)

  // Stats
  const stats = useMemo(() => ({
    total: filteredPVCs.length,
    bound: filteredPVCs.filter(p => p.status === 'Bound').length,
    pending: filteredPVCs.filter(p => p.status === 'Pending').length,
    failed: filteredPVCs.filter(p => !['Bound', 'Pending'].includes(p.status)).length,
  }), [filteredPVCs])

  const showSkeleton = isLoading && pvcs.length === 0

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading PVCs...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}
          {/* Cluster Filter */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search PVCs..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-secondary/50 text-center">
          <div className="text-lg font-bold text-foreground">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 text-center">
          <div className="text-lg font-bold text-green-400">{stats.bound}</div>
          <div className="text-xs text-muted-foreground">Bound</div>
        </div>
        <div className="p-2 rounded-lg bg-yellow-500/10 text-center">
          <div className="text-lg font-bold text-yellow-400">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 text-center">
          <div className="text-lg font-bold text-red-400">{stats.failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </div>
      </div>

      {/* PVC List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {displayPVCs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {error ? 'Failed to load PVCs' : 'No PVCs found'}
          </div>
        ) : (
          displayPVCs.map(pvc => (
            <div
              key={`${pvc.cluster}-${pvc.namespace}-${pvc.name}`}
              onClick={() => drillToPVC(pvc.cluster || '', pvc.namespace || '', pvc.name, {
                status: pvc.status,
                capacity: pvc.capacity,
                storageClass: pvc.storageClass,
                age: pvc.age,
              })}
              className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getStatusIcon(pvc.status)}
                {pvc.cluster && <ClusterBadge cluster={pvc.cluster} size="sm" />}
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate group-hover:text-purple-400">{pvc.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {pvc.namespace}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {pvc.capacity && <span>{pvc.capacity}</span>}
                {pvc.storageClass && (
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-foreground">
                    {pvc.storageClass}
                  </span>
                )}
                <span className={getStatusColor(pvc.status)}>{pvc.status}</span>
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
