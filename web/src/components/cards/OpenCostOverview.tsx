import { Server, Box, HardDrive, ExternalLink, AlertCircle, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards/CardComponents'
import { useReportCardDataState } from './CardDataContext'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'

interface OpenCostOverviewProps {
  config?: {
    endpoint?: string
  }
}

interface NamespaceCost {
  namespace: string
  cpuCost: number
  memCost: number
  storageCost: number
  totalCost: number
}

type SortByOption = 'name' | 'cost'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'cost' as const, label: 'Cost' },
]

const COST_SORT_COMPARATORS = {
  name: commonComparators.string<NamespaceCost>('namespace'),
  cost: commonComparators.number<NamespaceCost>('totalCost'),
}

// Demo data for OpenCost integration
const DEMO_NAMESPACE_COSTS: NamespaceCost[] = [
  { namespace: 'production', cpuCost: 2450, memCost: 890, storageCost: 340, totalCost: 3680 },
  { namespace: 'ml-training', cpuCost: 1820, memCost: 1240, storageCost: 890, totalCost: 3950 },
  { namespace: 'monitoring', cpuCost: 450, memCost: 320, storageCost: 120, totalCost: 890 },
  { namespace: 'cert-manager', cpuCost: 85, memCost: 45, storageCost: 10, totalCost: 140 },
  { namespace: 'ingress-nginx', cpuCost: 120, memCost: 80, storageCost: 5, totalCost: 205 },
]

function OpenCostOverviewInternal({ config: _config }: OpenCostOverviewProps) {
  const { t } = useTranslation('common')
  const { drillToCost } = useDrillDownActions()
  // No live OpenCost integration yet — the card always renders DEMO_NAMESPACE_COSTS,
  // so flag it as demo data to get the yellow outline + Demo badge (#8012).
  useReportCardDataState({ hasData: true, isFailed: false, consecutiveFailures: 0, isDemoData: true, isRefreshing: false })

  const {
    items: filteredCosts,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
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
  } = useCardData<NamespaceCost, SortByOption>(DEMO_NAMESPACE_COSTS, {
    filter: {
      searchFields: ['namespace'],
      storageKey: 'opencost-overview',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: COST_SORT_COMPARATORS,
    },
    defaultLimit: 5,
  })

  const totalCost = DEMO_NAMESPACE_COSTS.reduce((sum, ns) => sum + ns.totalCost, 0)
  const maxCost = Math.max(...DEMO_NAMESPACE_COSTS.map(ns => ns.totalCost))

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {totalItems} namespaces
          </span>
          <a
            href="https://www.opencost.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
            title="OpenCost Documentation"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="flex items-center gap-2">
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
            className="mb-0!"
          />
        </div>
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common.searchNamespaces')}
        className="mb-3"
      />

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">OpenCost Integration</p>
          <p className="text-muted-foreground">
            Install OpenCost in your cluster to get real cost allocation data.{' '}
            <a href="https://www.opencost.io/docs/installation/install" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline inline-block py-2">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Total cost */}
      <div className="p-3 rounded-lg bg-linear-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 mb-3">
        <p className="text-xs text-blue-400 mb-1">Monthly Cost (Demo)</p>
        <p className="text-xl font-bold text-foreground">${totalCost.toLocaleString()}</p>
      </div>

      {/* Namespace costs.
        * Issue 8883: roving-tabindex list — Enter/Space activate; ArrowUp/Down
        * traverse siblings; Home/End jump. Container gets role="list" so
        * AT exposes the list semantics.
        */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2" style={containerStyle}>
        <p className="text-xs text-muted-foreground font-medium mb-2">Cost by Namespace</p>
        <div role="group" aria-label="Namespace costs" className="space-y-2">
        {filteredCosts.map((ns, idx, arr) => {
          const activate = () => drillToCost('all', {
            namespace: ns.namespace,
            cpuCost: ns.cpuCost,
            memCost: ns.memCost,
            storageCost: ns.storageCost,
            totalCost: ns.totalCost,
            source: 'opencost',
          })
          const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            const list = e.currentTarget.parentElement
            const items = list ? Array.from(list.querySelectorAll<HTMLDivElement>('[data-keynav-item="opencost-ns"]')) : []
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              activate()
            } else if (e.key === 'ArrowDown' && idx < arr.length - 1) {
              e.preventDefault()
              items[idx + 1]?.focus()
            } else if (e.key === 'ArrowUp' && idx > 0) {
              e.preventDefault()
              items[idx - 1]?.focus()
            } else if (e.key === 'Home') {
              e.preventDefault()
              items[0]?.focus()
            } else if (e.key === 'End') {
              e.preventDefault()
              items[items.length - 1]?.focus()
            }
          }
          return (
          <div
            key={ns.namespace}
            data-keynav-item="opencost-ns"
            role="button"
            aria-label={t('actions.viewNamespaceCostAria', { namespace: ns.namespace })}
            tabIndex={0}
            onClick={activate}
            onKeyDown={handleKeyDown}
            className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Box className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground group-hover:text-blue-400">{ns.namespace}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-400">${ns.totalCost.toLocaleString()}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-linear-to-r from-blue-500 to-cyan-500 rounded-full"
                style={{ width: `${(ns.totalCost / maxCost) * 100}%` }}
              />
            </div>
            <div className="flex gap-3 text-2xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Server className="w-2.5 h-2.5" />
                CPU: ${ns.cpuCost}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-2.5 h-2.5" />
                Mem: ${ns.memCost}
              </span>
              <span>Storage: ${ns.storageCost}</span>
            </div>
          </div>
          )
        })}
        </div>
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

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-y-2 text-xs text-muted-foreground">
        <span>{t('costs.poweredByOpenCost')}</span>
        <a
          href="https://www.opencost.io/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span>{t('costs.docs')}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

export function OpenCostOverview({ config: _config }: OpenCostOverviewProps) {
  return (
    <DynamicCardErrorBoundary cardId="OpenCostOverview">
      <OpenCostOverviewInternal config={_config} />
    </DynamicCardErrorBoundary>
  )
}
