import { useState, useMemo } from 'react'
import { Server, Box, HardDrive, ExternalLink, AlertCircle, ChevronRight, Search, Filter, ChevronDown } from 'lucide-react'
import { CardControls, SortDirection } from '../ui/CardControls'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'
import { useDrillDownActions } from '../../hooks/useDrillDown'

interface OpenCostOverviewProps {
  config?: {
    endpoint?: string
  }
}

type SortField = 'name' | 'cost'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'cost' as const, label: 'Cost' },
]

// Demo data for OpenCost integration
const DEMO_NAMESPACE_COSTS = [
  { namespace: 'production', cpuCost: 2450, memCost: 890, storageCost: 340, totalCost: 3680 },
  { namespace: 'ml-training', cpuCost: 1820, memCost: 1240, storageCost: 890, totalCost: 3950 },
  { namespace: 'monitoring', cpuCost: 450, memCost: 320, storageCost: 120, totalCost: 890 },
  { namespace: 'cert-manager', cpuCost: 85, memCost: 45, storageCost: 10, totalCost: 140 },
  { namespace: 'ingress-nginx', cpuCost: 120, memCost: 80, storageCost: 5, totalCost: 205 },
]

export function OpenCostOverview({ config: _config }: OpenCostOverviewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [localSearch, setLocalSearch] = useState('')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const { drillToCost } = useDrillDownActions()

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
    storageKey: 'opencost-overview',
  })

  // Filter and sort namespace costs
  const filteredCosts = useMemo(() => {
    let result = [...DEMO_NAMESPACE_COSTS]

    // Apply search
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(ns =>
        ns.namespace.toLowerCase().includes(query)
      )
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = a.namespace.localeCompare(b.namespace)
      else if (sortBy === 'cost') cmp = a.totalCost - b.totalCost
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [localSearch, sortBy, sortDirection])

  const totalCost = DEMO_NAMESPACE_COSTS.reduce((sum, ns) => sum + ns.totalCost, 0)
  const maxCost = Math.max(...DEMO_NAMESPACE_COSTS.map(ns => ns.totalCost))

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await new Promise(r => setTimeout(r, 1000))
    setIsRefreshing(false)
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {filteredCosts.length} namespaces
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
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
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
            onRefresh={handleRefresh}
            size="sm"
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search namespaces..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">OpenCost Integration</p>
          <p className="text-muted-foreground">
            Install OpenCost in your cluster to get real cost allocation data.{' '}
            <a href="https://www.opencost.io/docs/installation/install" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              Install guide →
            </a>
          </p>
        </div>
      </div>

      {/* Total cost */}
      <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 mb-3">
        <p className="text-xs text-blue-400 mb-1">Monthly Cost (Demo)</p>
        <p className="text-xl font-bold text-foreground">${totalCost.toLocaleString()}</p>
      </div>

      {/* Namespace costs */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <p className="text-xs text-muted-foreground font-medium mb-2">Cost by Namespace</p>
        {filteredCosts.map(ns => (
          <div
            key={ns.namespace}
            onClick={() => drillToCost('all', {
              namespace: ns.namespace,
              cpuCost: ns.cpuCost,
              memCost: ns.memCost,
              storageCost: ns.storageCost,
              totalCost: ns.totalCost,
              source: 'opencost',
            })}
            className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1.5">
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
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                style={{ width: `${(ns.totalCost / maxCost) * 100}%` }}
              />
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
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
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Powered by OpenCost</span>
        <a
          href="https://www.opencost.io/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span>Docs</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
