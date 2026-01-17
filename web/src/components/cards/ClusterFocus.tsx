import { useState, useMemo } from 'react'
import { Server, Activity, Box, Cpu, HardDrive, Network, RefreshCw, AlertTriangle } from 'lucide-react'
import { useClusters, useGPUNodes, usePodIssues, useDeploymentIssues } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'

interface ClusterFocusProps {
  config?: {
    cluster?: string
  }
}

export function ClusterFocus({ config }: ClusterFocusProps) {
  const selectedCluster = config?.cluster
  const { clusters, isLoading: clustersLoading, refetch } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { issues: podIssues } = usePodIssues(selectedCluster)
  const { issues: deploymentIssues } = useDeploymentIssues(selectedCluster)
  const { drillToCluster } = useDrillDownActions()
  const [internalCluster, setInternalCluster] = useState<string>('')

  const clusterName = selectedCluster || internalCluster

  const cluster = useMemo(() => {
    return clusters.find(c => c.name === clusterName)
  }, [clusters, clusterName])

  const clusterGPUs = useMemo(() => {
    return gpuNodes
      .filter(n => n.cluster.split('/')[0] === clusterName)
      .reduce((sum, n) => sum + n.gpuCount, 0)
  }, [gpuNodes, clusterName])

  const clusterPodIssues = podIssues.length
  const clusterDeploymentIssues = deploymentIssues.length

  if (clustersLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={150} height={20} />
          <Skeleton variant="rounded" width={120} height={32} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
          <Skeleton variant="rounded" height={80} />
        </div>
      </div>
    )
  }

  if (!clusterName) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-muted-foreground">Cluster Focus</span>
          </div>
          <select
            value={internalCluster}
            onChange={(e) => setInternalCluster(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-white"
          >
            <option value="">Select cluster...</option>
            {clusters.map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Select a cluster to view details
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-white">{clusterName}</span>
          <div className={`w-2 h-2 rounded-full ${cluster?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-2">
          {!selectedCluster && (
            <select
              value={internalCluster}
              onChange={(e) => setInternalCluster(e.target.value)}
              className="px-2 py-1 rounded bg-secondary border border-border text-xs text-white"
            >
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => refetch()}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors"
          onClick={() => cluster && drillToCluster(cluster.name, {
            healthy: cluster.healthy,
            nodeCount: cluster.nodeCount,
            podCount: cluster.podCount,
            cpuCores: cluster.cpuCores,
            server: cluster.server,
          })}
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Nodes</span>
          </div>
          <span className="text-xl font-bold text-white">{cluster?.nodeCount || 0}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Pods</span>
          </div>
          <span className="text-xl font-bold text-white">{cluster?.podCount || 0}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-muted-foreground">GPUs</span>
          </div>
          <span className="text-xl font-bold text-white">{clusterGPUs}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-muted-foreground">CPU Cores</span>
          </div>
          <span className="text-xl font-bold text-white">{cluster?.cpuCores || 0}</span>
        </div>
      </div>

      {/* Issues Summary */}
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300">Pod Issues</span>
          </div>
          <span className="text-sm font-medium text-orange-400">{clusterPodIssues}</span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">Deployment Issues</span>
          </div>
          <span className="text-sm font-medium text-red-400">{clusterDeploymentIssues}</span>
        </div>
      </div>

      {/* Server info */}
      {cluster?.server && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Network className="w-3 h-3" />
            <span className="truncate">{cluster.server}</span>
          </div>
        </div>
      )}
    </div>
  )
}
