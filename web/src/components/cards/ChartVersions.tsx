import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Package, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters, useHelmReleases } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

interface ChartVersionsProps {
  config?: {
    cluster?: string
  }
}

interface ChartInfo {
  name: string
  chart: string
  version: string
  namespace: string
  cluster?: string
}

type SortByOption = 'name' | 'chart' | 'namespace'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'chart' as const, label: 'Chart' },
  { value: 'namespace' as const, label: 'Namespace' },
]

export function ChartVersions({ config: _config }: ChartVersionsProps) {
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [sortBy, setSortBy] = useState<SortByOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>(() => {
    // Load from localStorage
    try {
      const saved = localStorage.getItem('kubestellar-card-filter:chart-versions')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Save cluster filter to localStorage
  useEffect(() => {
    localStorage.setItem('kubestellar-card-filter:chart-versions', JSON.stringify(localClusterFilter))
  }, [localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => {
      if (prev.includes(clusterName)) {
        return prev.filter(c => c !== clusterName)
      }
      return [...prev, clusterName]
    })
  }

  const clearClusterFilter = () => {
    setLocalClusterFilter([])
  }

  // Fetch ALL Helm releases once - filter locally
  const {
    releases: allHelmReleases,
    isLoading: releasesLoading,
    isRefreshing,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useHelmReleases()

  // Only show skeleton when no cached data exists
  const isLoading = (clustersLoading || releasesLoading) && allHelmReleases.length === 0

  // Filter by selected clusters locally (no API call)
  const helmReleases = useMemo(() => {
    if (localClusterFilter.length === 0) return allHelmReleases
    return allHelmReleases.filter(r => r.cluster && localClusterFilter.includes(r.cluster))
  }, [allHelmReleases, localClusterFilter])

  // Get reachable clusters
  const reachableClusters = useMemo(() => {
    return allClusters.filter(c => c.reachable !== false)
  }, [allClusters])

  // Apply global filters to get available clusters
  const availableClustersForFilter = useMemo(() => {
    let result = reachableClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [reachableClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Transform Helm releases to chart info
  const allCharts: ChartInfo[] = useMemo(() => {
    return helmReleases.map(r => {
      // Parse chart name and version (e.g., "prometheus-25.8.0" -> chart: "prometheus", version: "25.8.0")
      const chartParts = r.chart.match(/^(.+)-(\d+\.\d+\.\d+.*)$/)
      const chartName = chartParts ? chartParts[1] : r.chart
      const chartVersion = chartParts ? chartParts[2] : ''

      return {
        name: r.name,
        chart: chartName,
        version: chartVersion,
        namespace: r.namespace,
        cluster: r.cluster,
      }
    })
  }, [helmReleases])

  // Filter and sort
  const filteredAndSorted = useMemo(() => {
    let result = [...allCharts]

    // Apply custom text filter (global)
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.chart.toLowerCase().includes(query) ||
        c.namespace.toLowerCase().includes(query) ||
        c.version.toLowerCase().includes(query)
      )
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.chart.toLowerCase().includes(query) ||
        c.namespace.toLowerCase().includes(query) ||
        c.version.toLowerCase().includes(query)
      )
    }

    // Sort
    result.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'chart':
          compare = a.chart.localeCompare(b.chart)
          break
        case 'namespace':
          compare = a.namespace.localeCompare(b.namespace)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })

    return result
  }, [allCharts, customFilter, localSearch, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: charts,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  // Count unique charts
  const uniqueCharts = new Set(allCharts.map(c => c.chart)).size

  if (isLoading) {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster Filter */}
          {availableClustersForFilter.length >= 1 && (
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
                    {availableClustersForFilter.map(cluster => (
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

      {availableClustersForFilter.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No clusters available
        </div>
      ) : (
        <>
          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search charts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 p-2 rounded-lg bg-emerald-500/10 text-center">
              <span className="text-lg font-bold text-emerald-400">{allCharts.length}</span>
              <p className="text-xs text-muted-foreground">Releases</p>
            </div>
            <div className="flex-1 p-2 rounded-lg bg-blue-500/10 text-center">
              <span className="text-lg font-bold text-blue-400">{uniqueCharts}</span>
              <p className="text-xs text-muted-foreground">Unique Charts</p>
            </div>
          </div>

          {/* Charts list */}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {charts.length === 0 ? (
              <div className="flex items-center justify-center text-muted-foreground text-sm py-4">
                No Helm releases found
              </div>
            ) : (
              charts.map((chart, idx) => (
                <div
                  key={`${chart.cluster}-${chart.namespace}-${chart.name}-${idx}`}
                  className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1 gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Package className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-sm text-foreground font-medium truncate">{chart.name}</span>
                    </div>
                    {chart.cluster && <ClusterBadge cluster={chart.cluster} size="sm" />}
                  </div>
                  <div className="flex items-center gap-4 ml-6 text-xs text-muted-foreground min-w-0 overflow-hidden">
                    <span className="truncate" title={`Chart: ${chart.chart}`}>{chart.chart}</span>
                    {chart.version && <span className="shrink-0" title={`Version: ${chart.version}`}>v{chart.version}</span>}
                    <span className="truncate" title={`Namespace: ${chart.namespace}`}>{chart.namespace}</span>
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

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            {totalItems} releases{localClusterFilter.length > 0 ? ` in ${localClusterFilter.length} cluster${localClusterFilter.length > 1 ? 's' : ''}` : ' across all clusters'}
          </div>
        </>
      )}
    </div>
  )
}
