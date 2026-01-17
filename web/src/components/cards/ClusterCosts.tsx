import { useMemo } from 'react'
import { DollarSign, Server, Cpu, HardDrive, TrendingUp, RefreshCw } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'

interface ClusterCostsProps {
  config?: {
    cpuCostPerHour?: number
    memoryCostPerGBHour?: number
    gpuCostPerHour?: number
  }
}

// Default cost estimates (can be overridden via config)
const DEFAULT_CPU_COST = 0.05 // per core per hour
const DEFAULT_MEMORY_COST = 0.01 // per GB per hour
const DEFAULT_GPU_COST = 2.50 // per GPU per hour

export function ClusterCosts({ config }: ClusterCostsProps) {
  const { clusters, isLoading, refetch } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()

  const cpuCost = config?.cpuCostPerHour ?? DEFAULT_CPU_COST
  const memoryCost = config?.memoryCostPerGBHour ?? DEFAULT_MEMORY_COST
  const gpuCost = config?.gpuCostPerHour ?? DEFAULT_GPU_COST

  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  const clusterCosts = useMemo(() => {
    return clusters.map(cluster => {
      const cpus = cluster.cpuCores || 0
      const memory = 32 * (cluster.nodeCount || 0) // Estimate 32GB per node
      const gpus = gpuByCluster[cluster.name] || 0

      const hourly = (cpus * cpuCost) + (memory * memoryCost) + (gpus * gpuCost)
      const daily = hourly * 24
      const monthly = daily * 30

      return {
        name: cluster.name,
        healthy: cluster.healthy,
        cpus,
        memory,
        gpus,
        hourly,
        daily,
        monthly,
      }
    }).sort((a, b) => b.monthly - a.monthly)
  }, [clusters, gpuByCluster, cpuCost, memoryCost, gpuCost])

  const totalMonthly = clusterCosts.reduce((sum, c) => sum + c.monthly, 0)
  const totalDaily = clusterCosts.reduce((sum, c) => sum + c.daily, 0)

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={120} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={60} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-muted-foreground">Cluster Costs</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-secondary rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Total costs */}
      <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-green-400 mb-1">Estimated Monthly</p>
            <p className="text-2xl font-bold text-white">${totalMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Daily</p>
            <p className="text-lg font-medium text-white">${totalDaily.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Per-cluster breakdown */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {clusterCosts.map((cluster) => {
          const percent = totalMonthly > 0 ? (cluster.monthly / totalMonthly) * 100 : 0
          return (
            <div
              key={cluster.name}
              className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-white">{cluster.name}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${cluster.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
                <span className="text-sm font-medium text-green-400">
                  ${cluster.monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                </span>
              </div>

              {/* Cost bar */}
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* Resource breakdown */}
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {cluster.cpus} CPUs
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {cluster.memory}GB
                </span>
                {cluster.gpus > 0 && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <Cpu className="w-3 h-3" />
                    {cluster.gpus} GPUs
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Based on estimated rates</span>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {clusters.length} clusters
        </span>
      </div>
    </div>
  )
}
