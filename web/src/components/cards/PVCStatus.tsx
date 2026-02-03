import { useMemo } from 'react'
import { CheckCircle, AlertTriangle, Clock, ChevronRight } from 'lucide-react'
import { usePVCs } from '../../hooks/useMCP'
import type { PVC } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useReportCardDataState } from './CardDataContext'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { ClusterBadge } from '../ui/ClusterBadge'

type SortByOption = 'status' | 'name' | 'capacity' | 'age'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'capacity' as const, label: 'Capacity' },
  { value: 'age' as const, label: 'Age' },
]

const STATUS_ORDER: Record<string, number> = { failed: 0, lost: 0, pending: 1, bound: 2 }

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

const PVC_SORT_COMPARATORS = {
  status: (a: PVC, b: PVC) => (STATUS_ORDER[a.status.toLowerCase()] ?? 1) - (STATUS_ORDER[b.status.toLowerCase()] ?? 1),
  name: commonComparators.string<PVC>('name'),
  capacity: (a: PVC, b: PVC) => parseCapacity(b.capacity) - parseCapacity(a.capacity),
  age: (a: PVC, b: PVC) => (a.age || '').localeCompare(b.age || ''),
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
  const { pvcs, isLoading, isRefreshing, error, consecutiveFailures, isFailed } = usePVCs()
  const { drillToPVC } = useDrillDownActions()

  // Report card data state
  // hasData should be true once loading completes (even with empty data)
  const hasData = !isLoading || pvcs.length > 0
  useReportCardDataState({
    isFailed,
    consecutiveFailures,
    isLoading: isLoading && pvcs.length === 0,
    isRefreshing: isRefreshing || (isLoading && pvcs.length > 0),
    hasData,
  })

  const {
    items: displayPVCs,
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
  } = useCardData<PVC, SortByOption>(pvcs, {
    filter: {
      searchFields: ['name', 'namespace', 'cluster', 'storageClass'],
      clusterField: 'cluster',
      storageKey: 'pvc-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: PVC_SORT_COMPARATORS,
    },
    defaultLimit: 10,
  })

  // Stats based on filtered data (approximate: apply local cluster filter + search to pvcs)
  const stats = useMemo(() => {
    let result = pvcs

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(pvc => {
        const clusterName = pvc.cluster || ''
        return localClusterFilter.includes(clusterName)
      })
    }

    // Apply search filter
    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(pvc =>
        pvc.name.toLowerCase().includes(query) ||
        pvc.namespace.toLowerCase().includes(query) ||
        (pvc.cluster?.toLowerCase() || '').includes(query) ||
        (pvc.storageClass?.toLowerCase() || '').includes(query)
      )
    }

    return {
      total: result.length,
      bound: result.filter(p => p.status === 'Bound').length,
      pending: result.filter(p => p.status === 'Pending').length,
      failed: result.filter(p => !['Bound', 'Pending'].includes(p.status)).length,
    }
  }, [pvcs, localClusterFilter, search])

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
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">{totalItems} PVCs</span>
        <CardControlsRow
          clusterIndicator={localClusterFilter.length > 0 ? {
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          } : undefined}
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
            onSortChange: (value: string) => setSortBy(value as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search PVCs..."
        className="mb-4"
      />

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
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}
