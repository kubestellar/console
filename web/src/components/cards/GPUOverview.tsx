import { useState, useMemo } from 'react'
import { useGPUNodes, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardControlsRow } from '../../lib/cards/CardComponents'

interface GPUOverviewProps {
  config?: Record<string, unknown>
}

type SortByOption = 'count' | 'name'

const SORT_OPTIONS = [
  { value: 'count' as const, label: 'Count' },
  { value: 'name' as const, label: 'Name' },
]

export function GPUOverview({ config: _config }: GPUOverviewProps) {
  const {
    nodes: rawNodes,
    isLoading: hookLoading,
  } = useGPUNodes()
  const { deduplicatedClusters: clusters } = useClusters()

  // Only show skeleton when no cached data exists
  const isLoading = hookLoading && rawNodes.length === 0
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToResources } = useDrillDownActions()

  const [selectedGpuType, setSelectedGpuType] = useState<string>('all')

  // Use useCardData for filtering and sort state management
  const {
    items: filteredNodes,
    filters,
    sorting,
  } = useCardData(rawNodes, {
    filter: {
      searchFields: ['gpuType' as keyof typeof rawNodes[number]],
      clusterField: 'cluster' as keyof typeof rawNodes[number],
      storageKey: 'gpu-overview',
    },
    sort: {
      defaultField: 'count' as SortByOption,
      defaultDirection: 'desc',
      comparators: {
        count: commonComparators.number('gpuCount' as keyof typeof rawNodes[number]),
        name: commonComparators.string('gpuType' as keyof typeof rawNodes[number]),
      } as Record<SortByOption, (a: typeof rawNodes[number], b: typeof rawNodes[number]) => number>,
    },
    defaultLimit: 'unlimited',
  })

  // Apply GPU type filter on top of useCardData filtered nodes
  const nodes = useMemo(() => {
    if (selectedGpuType === 'all') return filteredNodes
    return filteredNodes.filter(n => n.gpuType === selectedGpuType)
  }, [filteredNodes, selectedGpuType])

  // Get all unique GPU types for filter dropdown (from raw data)
  const allGpuTypes = useMemo(() => {
    const types = new Set<string>()
    rawNodes.forEach(n => types.add(n.gpuType))
    return Array.from(types).sort()
  }, [rawNodes])

  // Check if any selected clusters are reachable
  const filteredClusters = useMemo(() => {
    if (isAllClustersSelected) return clusters
    return clusters.filter(c => selectedClusters.includes(c.name))
  }, [clusters, selectedClusters, isAllClustersSelected])

  const hasReachableClusters = filteredClusters.some(c => c.reachable !== false && c.nodeCount !== undefined && c.nodeCount > 0)

  if (isLoading && hasReachableClusters) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={100} height={16} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="flex justify-center mb-4">
          <Skeleton variant="circular" width={128} height={128} />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={50} />
          ))}
        </div>
      </div>
    )
  }

  // No reachable clusters
  if (!hasReachableClusters) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No reachable clusters
        </div>
      </div>
    )
  }

  const totalGPUs = nodes.reduce((sum, n) => sum + n.gpuCount, 0)
  const allocatedGPUs = nodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
  const gpuUtilization = totalGPUs > 0 ? (allocatedGPUs / totalGPUs) * 100 : 0

  // Group by type and sort
  const gpuTypesMap = nodes.reduce((acc, n) => {
    if (!acc[n.gpuType]) acc[n.gpuType] = 0
    acc[n.gpuType] += n.gpuCount
    return acc
  }, {} as Record<string, number>)

  const sortedGpuTypes = Object.entries(gpuTypesMap).sort((a, b) => {
    let compare = 0
    if (sorting.sortBy === 'count') {
      compare = a[1] - b[1]
    } else {
      compare = a[0].localeCompare(b[0])
    }
    return sorting.sortDirection === 'asc' ? compare : -compare
  })

  const clusterCount = new Set(nodes.map(n => n.cluster)).size

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header */}
      <div className="flex items-center justify-end mb-4">
        <CardControlsRow
          clusterIndicator={
            filters.localClusterFilter.length > 0
              ? { selectedCount: filters.localClusterFilter.length, totalCount: filters.availableClusters.length }
              : undefined
          }
          clusterFilter={
            filters.availableClusters.length >= 1
              ? {
                  availableClusters: filters.availableClusters,
                  selectedClusters: filters.localClusterFilter,
                  onToggle: filters.toggleClusterFilter,
                  onClear: filters.clearClusterFilter,
                  isOpen: filters.showClusterFilter,
                  setIsOpen: filters.setShowClusterFilter,
                  containerRef: filters.clusterFilterRef,
                  minClusters: 1,
                }
              : undefined
          }
          cardControls={{
            limit: 'unlimited',
            onLimitChange: () => {},
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          className="mb-0"
        />
      </div>

      {/* GPU Type Filter */}
      {allGpuTypes.length > 1 && (
        <select
          value={selectedGpuType}
          onChange={(e) => setSelectedGpuType(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground mb-3"
        >
          <option value="all">All GPU Types</option>
          {allGpuTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      )}

      {/* Main gauge */}
      <div className="flex justify-center mb-4" title={`GPU Utilization: ${allocatedGPUs} of ${totalGPUs} GPUs allocated (${gpuUtilization.toFixed(0)}%)`}>
        <div className="relative w-32 h-32 cursor-default">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-secondary"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${gpuUtilization * 3.52} 352`}
              className={`${
                gpuUtilization > 80 ? 'text-red-500' :
                gpuUtilization > 50 ? 'text-yellow-500' :
                'text-green-500'
              }`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{gpuUtilization.toFixed(0)}%</span>
            <span className="text-xs text-muted-foreground">Utilized</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div
          className={`text-center ${totalGPUs > 0 ? 'cursor-pointer hover:bg-secondary/50 rounded-lg' : 'cursor-default'} transition-colors p-1`}
          onClick={() => totalGPUs > 0 && drillToResources()}
          title={totalGPUs > 0 ? `${totalGPUs} total GPUs - Click for details` : 'No GPUs available'}
        >
          <p className="text-lg font-bold text-foreground">{totalGPUs}</p>
          <p className="text-xs text-muted-foreground">Total GPUs</p>
        </div>
        <div
          className={`text-center ${allocatedGPUs > 0 ? 'cursor-pointer hover:bg-secondary/50 rounded-lg' : 'cursor-default'} transition-colors p-1`}
          onClick={() => allocatedGPUs > 0 && drillToResources()}
          title={allocatedGPUs > 0 ? `${allocatedGPUs} GPUs allocated - Click for details` : 'No GPUs allocated'}
        >
          <p className="text-lg font-bold text-purple-400">{allocatedGPUs}</p>
          <p className="text-xs text-muted-foreground">Allocated</p>
        </div>
        <div
          className={`text-center ${clusterCount > 0 ? 'cursor-pointer hover:bg-secondary/50 rounded-lg' : 'cursor-default'} transition-colors p-1`}
          onClick={() => clusterCount > 0 && drillToResources()}
          title={clusterCount > 0 ? `${clusterCount} cluster${clusterCount !== 1 ? 's' : ''} with GPUs - Click for details` : 'No clusters with GPUs'}
        >
          <p className="text-lg font-bold text-green-400">{clusterCount}</p>
          <p className="text-xs text-muted-foreground">Clusters</p>
        </div>
      </div>

      {/* GPU Types */}
      {sortedGpuTypes.length > 0 && (
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-2">GPU Types</p>
          <div className="space-y-1">
            {sortedGpuTypes.map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between text-sm cursor-pointer hover:bg-secondary/50 rounded px-1 transition-colors"
                onClick={() => drillToResources()}
                title={`${count} ${type} GPU${count !== 1 ? 's' : ''} - Click to view nodes with this GPU type`}
              >
                <span className="text-foreground">{type}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
