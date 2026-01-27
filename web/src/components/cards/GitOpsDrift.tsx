import { useState, useMemo, useRef, useEffect } from 'react'
import { GitBranch, AlertTriangle, Plus, Minus, RefreshCw, Loader2, Search, ChevronRight, Filter, ChevronDown, Server } from 'lucide-react'
import { useGitOpsDrifts, GitOpsDrift as GitOpsDriftType, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters, type SeverityLevel } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'

type SortByOption = 'severity' | 'type' | 'resource' | 'cluster'

const SORT_OPTIONS = [
  { value: 'severity' as const, label: 'Severity' },
  { value: 'type' as const, label: 'Type' },
  { value: 'resource' as const, label: 'Resource' },
  { value: 'cluster' as const, label: 'Cluster' },
]

interface GitOpsDriftProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

const driftTypeConfig = {
  modified: {
    icon: RefreshCw,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    label: 'Modified',
  },
  deleted: {
    icon: Minus,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    label: 'Missing in Cluster',
  },
  added: {
    icon: Plus,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    label: 'Not in Git',
  },
}

const severityColors = {
  high: 'border-l-red-500',
  medium: 'border-l-orange-500',
  low: 'border-l-yellow-500',
}

export function GitOpsDrift({ config }: GitOpsDriftProps) {
  const cluster = config?.cluster
  const namespace = config?.namespace

  const { drifts, isLoading: isLoadingHook, isRefreshing, error, refetch, isFailed, consecutiveFailures, lastRefresh } = useGitOpsDrifts(cluster, namespace)
  const { deduplicatedClusters: allClusters } = useClusters()
  const { selectedClusters, isAllClustersSelected, selectedSeverities, isAllSeveritiesSelected, customFilter } = useGlobalFilters()
  const [localSearch, setLocalSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortByOption>('severity')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kubestellar-card-filter:gitops-drift')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

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
    localStorage.setItem('kubestellar-card-filter:gitops-drift', JSON.stringify(localClusterFilter))
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

  // Get available clusters for local filter (respects global filter)
  const availableClustersForFilter = useMemo(() => {
    const reachable = allClusters.filter(c => c.reachable !== false)
    if (isAllClustersSelected) return reachable
    return reachable.filter(c => selectedClusters.includes(c.name))
  }, [allClusters, selectedClusters, isAllClustersSelected])

  // Only show skeleton when no cached data exists - prevents flickering
  const isLoading = isLoadingHook && drifts.length === 0

  // Map drift severity to global SeverityLevel
  const mapDriftSeverityToGlobal = (severity: 'high' | 'medium' | 'low'): SeverityLevel[] => {
    switch (severity) {
      case 'high': return ['critical', 'high']
      case 'medium': return ['medium']
      case 'low': return ['low', 'info']
      default: return ['info']
    }
  }

  // Filter drifts by global filters
  const filteredDrifts = useMemo(() => {
    let result = drifts

    // Apply global cluster filter (only if no config cluster specified)
    if (!cluster && !isAllClustersSelected) {
      result = result.filter(d => selectedClusters.includes(d.cluster))
    }

    // Apply global severity filter
    if (!isAllSeveritiesSelected) {
      result = result.filter(d => {
        const mappedSeverities = mapDriftSeverityToGlobal(d.severity)
        return mappedSeverities.some(s => selectedSeverities.includes(s))
      })
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(d =>
        d.resource.toLowerCase().includes(query) ||
        d.kind.toLowerCase().includes(query) ||
        d.cluster.toLowerCase().includes(query) ||
        d.namespace.toLowerCase().includes(query)
      )
    }

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(d => localClusterFilter.includes(d.cluster))
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(d =>
        d.resource.toLowerCase().includes(query) ||
        d.kind.toLowerCase().includes(query) ||
        d.cluster.toLowerCase().includes(query) ||
        d.namespace.toLowerCase().includes(query)
      )
    }

    // Sort by selected field
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const sorted = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'severity':
          cmp = severityOrder[a.severity] - severityOrder[b.severity]
          break
        case 'type':
          cmp = a.driftType.localeCompare(b.driftType)
          break
        case 'resource':
          cmp = a.resource.localeCompare(b.resource)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [drifts, cluster, selectedClusters, isAllClustersSelected, selectedSeverities, isAllSeveritiesSelected, customFilter, localSearch, localClusterFilter, sortBy, sortDirection])

  // Apply pagination using usePagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayDrifts,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredDrifts, effectivePerPage)

  if (isLoading && drifts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && drifts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    )
  }

  const highSeverityCount = filteredDrifts.filter(d => d.severity === 'high').length
  const totalDrifts = filteredDrifts.length

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
          {highSeverityCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {highSeverityCount} critical
            </span>
          )}
          {totalDrifts > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
              {totalDrifts} drift{totalDrifts !== 1 ? 's' : ''}
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

      {/* Local Search */}
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search drifts..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Drifts list */}
      {filteredDrifts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
            <GitBranch className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-sm font-medium text-green-400">No Drift Detected</p>
          <p className="text-xs text-muted-foreground mt-1">
            {drifts.length > 0 ? 'All drifts filtered out' : 'All clusters are in sync with Git'}
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {displayDrifts.map((drift, index) => (
            <DriftItem key={`${drift.cluster}-${drift.namespace}-${drift.resource}-${index}`} drift={drift} />
          ))}
        </div>
      )}

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

function DriftItem({ drift }: { drift: GitOpsDriftType }) {
  const typeConfig = driftTypeConfig[drift.driftType]
  const TypeIcon = typeConfig.icon
  const { drillToDrift } = useDrillDownActions()

  return (
    <div
      className={`group p-3 rounded-lg bg-secondary/30 border border-border/50 border-l-2 ${severityColors[drift.severity]} cursor-pointer hover:bg-secondary/50 transition-colors`}
      onClick={() => drillToDrift(drift.cluster, {
        resource: drift.resource,
        kind: drift.kind,
        namespace: drift.namespace,
        driftType: drift.driftType,
        severity: drift.severity,
        gitVersion: drift.gitVersion,
        details: drift.details,
      })}
      title={`Click to view drift details for ${drift.resource}`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`p-1 rounded ${typeConfig.bg}`}>
            <TypeIcon className={`w-3 h-3 ${typeConfig.color}`} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground truncate block" title={drift.resource}>
              {drift.resource}
            </span>
            <span className="text-xs text-muted-foreground">
              {drift.kind}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${typeConfig.bg} ${typeConfig.color}`}>
            {typeConfig.label}
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <ClusterBadge cluster={drift.cluster} />
        <span className="text-xs text-muted-foreground truncate">{drift.namespace}</span>
      </div>
      {drift.details && (
        <p className="mt-1 text-xs text-muted-foreground/80">
          {drift.details}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2 text-xs">
        <span className="text-muted-foreground">Git:</span>
        <code className="px-1.5 py-0.5 rounded bg-secondary text-purple-400 font-mono text-[10px]">
          {drift.gitVersion}
        </code>
      </div>
    </div>
  )
}
