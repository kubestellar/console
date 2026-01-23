import { useState, useMemo, useEffect } from 'react'
import { GitCompare, Server, Activity, Box, Cpu, ChevronRight } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { RefreshButton } from '../ui/RefreshIndicator'

interface ClusterComparisonProps {
  config?: {
    clusters?: string[]
  }
}

export function ClusterComparison({ config }: ClusterComparisonProps) {
  const { clusters: rawClusters, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const [selectedClusters, setSelectedClusters] = useState<string[]>(config?.clusters || [])
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()
  const { drillToCluster } = useDrillDownActions()

  // Apply global filters
  const allClusters = useMemo(() => {
    let result = rawClusters

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
  }, [rawClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Reset local cluster selection when global filters change
  useEffect(() => {
    // Filter out any locally selected clusters that are no longer in the filtered set
    const availableNames = new Set(allClusters.map(c => c.name))
    setSelectedClusters(prev => prev.filter(name => availableNames.has(name)))
  }, [allClusters])

  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  const clustersToCompare = useMemo(() => {
    if (selectedClusters.length >= 2) {
      return allClusters.filter(c => selectedClusters.includes(c.name))
    }
    // Default to first 2-3 clusters
    return allClusters.slice(0, 3)
  }, [allClusters, selectedClusters])

  const toggleCluster = (name: string) => {
    setSelectedClusters(prev => {
      if (prev.includes(name)) {
        return prev.filter(c => c !== name)
      }
      if (prev.length >= 4) return prev // Max 4 clusters
      return [...prev, name]
    })
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton variant="rounded" height={150} />
          <Skeleton variant="rounded" height={150} />
          <Skeleton variant="rounded" height={150} />
        </div>
      </div>
    )
  }

  const metrics = [
    { key: 'nodes', label: 'Nodes', icon: Activity, color: 'text-blue-400', getValue: (c: typeof allClusters[0]) => c.nodeCount || 0 },
    { key: 'pods', label: 'Pods', icon: Box, color: 'text-green-400', getValue: (c: typeof allClusters[0]) => c.podCount || 0 },
    { key: 'cpus', label: 'CPUs', icon: Cpu, color: 'text-purple-400', getValue: (c: typeof allClusters[0]) => c.cpuCores || 0 },
    { key: 'gpus', label: 'GPUs', icon: Cpu, color: 'text-cyan-400', getValue: (c: typeof allClusters[0]) => gpuByCluster[c.name] || 0 },
  ]

  const maxValues = metrics.reduce((acc, m) => {
    acc[m.key] = Math.max(...clustersToCompare.map(c => m.getValue(c)))
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-muted-foreground">Cluster Comparison</span>
        </div>
        <RefreshButton
          isRefreshing={isRefreshing}
          isFailed={isFailed}
          consecutiveFailures={consecutiveFailures}
          lastRefresh={lastRefresh}
          onRefresh={refetch}
          size="sm"
        />
      </div>

      {/* Cluster selector */}
      <div className="flex flex-wrap gap-1 mb-4">
        {allClusters.map(c => (
          <button
            key={c.name}
            onClick={() => toggleCluster(c.name)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${
              selectedClusters.includes(c.name) || (selectedClusters.length === 0 && clustersToCompare.includes(c))
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Comparison table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 text-muted-foreground font-medium">Metric</th>
              {clustersToCompare.map(c => (
                <th key={c.name} className="text-right py-2 px-2">
                  <button
                    onClick={() => drillToCluster(c.name, {
                      nodeCount: c.nodeCount,
                      podCount: c.podCount,
                      cpuCores: c.cpuCores,
                      gpuCount: gpuByCluster[c.name] || 0,
                      healthy: c.healthy,
                    })}
                    className="flex items-center justify-end gap-1 w-full hover:text-purple-400 transition-colors group"
                  >
                    <Server className="w-3 h-3 text-muted-foreground" />
                    <span className="text-foreground font-medium group-hover:text-purple-400">{c.name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${c.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key} className="border-b border-border/30">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <m.icon className={`w-4 h-4 ${m.color}`} />
                    <span className="text-muted-foreground">{m.label}</span>
                  </div>
                </td>
                {clustersToCompare.map(c => {
                  const value = m.getValue(c)
                  const isMax = value === maxValues[m.key] && value > 0
                  return (
                    <td key={c.name} className="text-right py-2 px-2">
                      <span className={`font-medium ${isMax ? 'text-green-400' : 'text-foreground'}`}>
                        {value.toLocaleString()}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visual bars */}
      <div className="mt-4 pt-3 border-t border-border/50 space-y-2">
        {metrics.slice(0, 2).map(m => (
          <div key={m.key}>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{m.label}</span>
            </div>
            <div className="flex gap-1">
              {clustersToCompare.map(c => {
                const value = m.getValue(c)
                const percent = maxValues[m.key] > 0 ? (value / maxValues[m.key]) * 100 : 0
                return (
                  <div key={c.name} className="flex-1">
                    <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.color.replace('text-', 'bg-')}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
