import { useMemo, useState } from 'react'
import { HardDrive, CheckCircle, AlertTriangle, Clock, Search, ChevronRight, AlertCircle } from 'lucide-react'
import { usePVCs, type PVC } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useSingleSelectCluster } from '../../lib/cards'
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

  // Use shared single-select cluster hook
  const {
    selectedCluster,
    setSelectedCluster,
    availableClusters: filteredClusters,
    isOutsideGlobalFilter,
    filtered: filteredPVCs,
    search: localSearch,
    setSearch: setLocalSearch,
  } = useSingleSelectCluster<PVC>(pvcs, {
    storageKey: 'pvc-status',
    clusterField: 'cluster',
    searchFields: ['name', 'namespace', 'cluster', 'storageClass'],
  })

  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(10)

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

  const hasRealData = !isLoading && filteredPVCs.length > 0
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">PVC Status</span>
          {hasRealData && (
            <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              Live
            </span>
          )}
        </div>
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

      {/* Cluster Filter */}
      <div className="mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => setSelectedCluster(e.target.value)}
          className={`w-full px-3 py-1.5 rounded-lg bg-secondary border text-sm text-foreground ${
            isOutsideGlobalFilter ? 'border-orange-500/50' : 'border-border'
          }`}
        >
          <option value="">All clusters</option>
          {filteredClusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
          {/* Show the selected cluster even if outside global filter */}
          {isOutsideGlobalFilter && selectedCluster && (
            <option value={selectedCluster}>{selectedCluster} (filtered out)</option>
          )}
        </select>
        {isOutsideGlobalFilter && (
          <div className="flex items-center gap-1 mt-1 text-xs text-orange-400">
            <AlertCircle className="w-3 h-3" />
            <span>Selection outside global filter</span>
          </div>
        )}
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
