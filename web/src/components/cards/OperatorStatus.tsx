import { useMemo } from 'react'
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, ArrowUpCircle, ChevronRight } from 'lucide-react'
import { useClusters, useOperators, Operator } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import {
  useCardData,
  useCardFilters,
  commonComparators,
  type SortDirection,
} from '../../lib/cards'
import {
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards/CardComponents'

interface OperatorStatusProps {
  config?: {
    cluster?: string
  }
}

type SortByOption = 'status' | 'name' | 'namespace' | 'version'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'version' as const, label: 'Version' },
]

const STATUS_ORDER: Record<string, number> = { Failed: 0, Installing: 1, Upgrading: 2, Succeeded: 3 }

const OPERATOR_SORT_COMPARATORS = {
  status: (a: Operator, b: Operator) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5),
  name: commonComparators.string<Operator>('name'),
  namespace: commonComparators.string<Operator>('namespace'),
  version: commonComparators.string<Operator>('version'),
}

// Shared filter config for counting and display
const FILTER_CONFIG = {
  searchFields: ['name', 'namespace', 'version'] as (keyof Operator)[],
  clusterField: 'cluster' as keyof Operator,
  statusField: 'status' as keyof Operator,
  storageKey: 'operator-status',
}

export function OperatorStatus({ config: _config }: OperatorStatusProps) {
  const { isLoading: clustersLoading } = useClusters()
  const { drillToOperator } = useDrillDownActions()

  // Fetch operators - pass undefined to get all clusters
  const { operators: rawOperators, isLoading: operatorsLoading } = useOperators(undefined)

  // Use useCardFilters for status counts (globally filtered, before local search/pagination)
  const { filtered: globalFilteredOperators } = useCardFilters(rawOperators, FILTER_CONFIG)

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: operators,
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
  } = useCardData<Operator, SortByOption>(rawOperators, {
    filter: {
      searchFields: ['name', 'namespace', 'version'] as (keyof Operator)[],
      clusterField: 'cluster',
      statusField: 'status',
      storageKey: 'operator-status',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc' as SortDirection,
      comparators: OPERATOR_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  const isLoading = clustersLoading || operatorsLoading
  const showSkeleton = isLoading && rawOperators.length === 0

  const getStatusIcon = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return CheckCircle
      case 'Failed': return XCircle
      case 'Installing': return RefreshCw
      case 'Upgrading': return ArrowUpCircle
      default: return AlertTriangle
    }
  }

  const getStatusColor = (status: Operator['status']) => {
    switch (status) {
      case 'Succeeded': return 'green'
      case 'Failed': return 'red'
      case 'Installing': return 'blue'
      case 'Upgrading': return 'purple'
      default: return 'orange'
    }
  }

  // Status counts from globally filtered data (before local search/pagination)
  const statusCounts = useMemo(() => ({
    succeeded: globalFilteredOperators.filter(o => o.status === 'Succeeded').length,
    failed: globalFilteredOperators.filter(o => o.status === 'Failed').length,
    other: globalFilteredOperators.filter(o => !['Succeeded', 'Failed'].includes(o.status)).length,
  }), [globalFilteredOperators])

  if (showSkeleton) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Controls row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
              {totalItems} operators
            </span>
          )}
        </div>
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
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
        />
      </div>

      {availableClusters.length > 0 && (
        <>
          {/* Scope badge */}
          <div className="flex items-center gap-2 mb-4">
            {localClusterFilter.length === 1 ? (
              <ClusterBadge cluster={localClusterFilter[0]} />
            ) : localClusterFilter.length > 1 ? (
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                {localClusterFilter.length} clusters selected
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                All Clusters ({availableClusters.length})
              </span>
            )}
          </div>

          {/* Local Search */}
          <CardSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search operators..."
            className="mb-4"
          />

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-green-500/10 text-center">
              <span className="text-lg font-bold text-green-400">{statusCounts.succeeded}</span>
              <p className="text-xs text-muted-foreground">Running</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-red-500/10 text-center">
              <span className="text-lg font-bold text-red-400">{statusCounts.failed}</span>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{statusCounts.other}</span>
              <p className="text-xs text-muted-foreground">Other</p>
            </div>
          </div>

          {/* Operators list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {operators.map((op) => {
              const StatusIcon = getStatusIcon(op.status)
              const color = getStatusColor(op.status)

              return (
                <div
                  key={`${op.cluster || 'default'}-${op.namespace}-${op.name}`}
                  onClick={() => drillToOperator(op.cluster || '', op.namespace, op.name, {
                    status: op.status,
                    version: op.version,
                    upgradeAvailable: op.upgradeAvailable,
                  })}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-4 h-4 text-${color}-400 ${op.status === 'Installing' ? 'animate-spin' : ''}`} />
                      {op.cluster && (
                        <ClusterBadge cluster={op.cluster} size="sm" />
                      )}
                      <span className="text-sm text-foreground group-hover:text-purple-400">{op.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded bg-${color}-500/20 text-${color}-400`}>
                        {op.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1 ml-6 text-xs text-muted-foreground">
                    <span>{op.namespace}</span>
                    <span>{op.version}</span>
                    {op.upgradeAvailable && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <ArrowUpCircle className="w-3 h-3" />
                        {op.upgradeAvailable}
                      </span>
                    )}
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

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} operator{totalItems !== 1 ? 's' : ''} {localClusterFilter.length === 1 ? `on ${localClusterFilter[0]}` : `across ${availableClusters.length} cluster${availableClusters.length !== 1 ? 's' : ''}`}
          </div>
        </>
      )}
    </div>
  )
}
