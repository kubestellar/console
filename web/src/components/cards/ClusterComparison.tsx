import { useState, useMemo, useEffect } from 'react'
import { Server, Activity, Box, Cpu, ChevronRight } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface ClusterComparisonProps {
  config?: {
    clusters?: string[]
  }
}

export function ClusterComparison({ config }: ClusterComparisonProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: rawClusters, isLoading: clustersLoading } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const [selectedClusters, setSelectedClusters] = useState<string[]>(config?.clusters || [])

  // Report loading state to CardWrapper for skeleton/refresh behavior
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: clustersLoading,
    hasAnyData: rawClusters.length > 0,
  })
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

  if (showSkeleton) {
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

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('clusterComparison.noClustersSelected')}</p>
        <p className="text-xs mt-1">{t('clusterComparison.addClustersHint')}</p>
      </div>
    )
  }

  const metrics = [
    { key: 'nodes', label: t('clusterComparison.nodes'), icon: Activity, color: 'text-blue-400', getValue: (c: typeof allClusters[0]) => c.nodeCount || 0 },
    { key: 'pods', label: t('clusterComparison.pods'), icon: Box, color: 'text-green-400', getValue: (c: typeof allClusters[0]) => c.podCount || 0 },
    { key: 'cpus', label: t('clusterComparison.cpus'), icon: Cpu, color: 'text-purple-400', getValue: (c: typeof allClusters[0]) => c.cpuCores || 0 },
    { key: 'gpus', label: t('clusterComparison.gpus'), icon: Cpu, color: 'text-cyan-400', getValue: (c: typeof allClusters[0]) => gpuByCluster[c.name] || 0 },
  ]

  const maxValues = metrics.reduce((acc, m) => {
    acc[m.key] = Math.max(...clustersToCompare.map(c => m.getValue(c)))
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-end mb-4">
      </div>

      {/* Cluster selector */}
      <div className="flex flex-wrap gap-1 mb-4 overflow-hidden">
        {allClusters.map(c => (
          <button
            key={c.name}
            onClick={() => toggleCluster(c.name)}
            className={`px-2 py-1 text-xs rounded-full transition-colors max-w-[120px] truncate ${
              selectedClusters.includes(c.name) || (selectedClusters.length === 0 && clustersToCompare.includes(c))
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
            title={c.name}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Comparison table */}
      <div className="flex-1 overflow-auto min-w-0">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 text-muted-foreground font-medium w-20">{t('clusterComparison.metric')}</th>
              {clustersToCompare.map(c => (
                <th key={c.name} className="text-right py-2 px-2 max-w-[100px]">
                  <button
                    onClick={() => drillToCluster(c.name, {
                      nodeCount: c.nodeCount,
                      podCount: c.podCount,
                      cpuCores: c.cpuCores,
                      gpuCount: gpuByCluster[c.name] || 0,
                      healthy: c.healthy,
                    })}
                    className="flex items-center justify-end gap-1 w-full hover:text-purple-400 transition-colors group min-w-0"
                    title={c.name}
                  >
                    <Server className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-foreground font-medium group-hover:text-purple-400 truncate">{c.name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
