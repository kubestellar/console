import { Server, Info } from 'lucide-react'
import { CardControlsRow } from '../../../lib/cards/CardComponents'

type SortByOption = 'cost' | 'name' | 'cpus'

interface SortOption {
  value: SortByOption
  label: string
}

interface FilterBarProps {
  t: (key: string, options?: Record<string, unknown>) => string
  totalItems: number
  localClusterFilter: string[]
  availableClustersForFilter: string[]
  toggleClusterFilter: (cluster: string) => void
  clearClusterFilter: () => void
  showClusterFilter: boolean
  setShowClusterFilter: (show: boolean) => void
  clusterFilterRef: React.RefObject<HTMLDivElement | null>
  itemsPerPage: number | 'unlimited'
  setItemsPerPage: (value: number | 'unlimited') => void
  sorting: {
    sortBy: SortByOption
    setSortBy: (value: SortByOption) => void
    sortDirection: 'asc' | 'desc'
    setSortDirection: (value: 'asc' | 'desc') => void
  }
  sortOptions: SortOption[]
  showRatesInfo: boolean
  setShowRatesInfo: (show: boolean) => void
}

export function FilterBar({
  t,
  totalItems,
  localClusterFilter,
  availableClustersForFilter,
  toggleClusterFilter,
  clearClusterFilter,
  showClusterFilter,
  setShowClusterFilter,
  clusterFilterRef,
  itemsPerPage,
  setItemsPerPage,
  sorting,
  sortOptions,
  showRatesInfo,
  setShowRatesInfo,
}: FilterBarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t('cards:clusterCosts.clusterCount', { count: totalItems })}
          </span>
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CardControlsRow
            clusterFilter={{
              availableClusters: availableClustersForFilter,
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
              sortBy: sorting.sortBy,
              sortOptions: sortOptions,
              onSortChange: (v) => sorting.setSortBy(v as SortByOption),
              sortDirection: sorting.sortDirection,
              onSortDirectionChange: sorting.setSortDirection,
            }}
          />
          <button
            onClick={() => setShowRatesInfo(!showRatesInfo)}
            className={`p-1 rounded transition-colors ${showRatesInfo ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-muted-foreground'}`}
            title={t('cards:clusterCosts.viewPricingRates')}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}
