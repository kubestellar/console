import { useState, useMemo } from 'react'
import { Activity, Box, Cpu, HardDrive, Network, AlertTriangle } from 'lucide-react'
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../hooks/useCachedData'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { Skeleton } from '../ui/Skeleton'
import { RefreshButton } from '../ui/RefreshIndicator'

interface ClusterFocusProps {
  config?: {
    cluster?: string
  }
}

export function ClusterFocus({ config }: ClusterFocusProps) {
  const selectedCluster = config?.cluster
  const { clusters: allClusters, isLoading: clustersLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()
  const { issues: podIssues } = useCachedPodIssues(selectedCluster)
  const { issues: deploymentIssues } = useCachedDeploymentIssues(selectedCluster)
  const { drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()
  const [internalCluster, setInternalCluster] = useState<string>('')
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Apply global filters
  const clusters = useMemo(() => {
    let result = allClusters

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
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

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
      <div className="h-full flex flex-col min-h-card overflow-hidden">
        <div className="flex items-center justify-end mb-4">
          <select
            value={internalCluster}
            onChange={(e) => setInternalCluster(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground max-w-full truncate"
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
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">{clusterName}</span>
          <div className={`w-2 h-2 rounded-full shrink-0 ${cluster?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="flex items-center gap-2">
          {!selectedCluster && (
            <select
              value={internalCluster}
              onChange={(e) => setInternalCluster(e.target.value)}
              className="px-2 py-1 rounded bg-secondary border border-border text-xs text-foreground max-w-[150px] truncate"
            >
              {clusters.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
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
          <span className="text-xl font-bold text-foreground">{cluster?.nodeCount || 0}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Pods</span>
          </div>
          <span className="text-xl font-bold text-foreground">{cluster?.podCount || 0}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-muted-foreground">GPUs</span>
          </div>
          <span className="text-xl font-bold text-foreground">{clusterGPUs}</span>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-muted-foreground">CPU Cores</span>
          </div>
          <span className="text-xl font-bold text-foreground">{cluster?.cpuCores || 0}</span>
        </div>
      </div>

      {/* Issues Summary */}
      <div className="space-y-2">
        <div
          className="flex items-center justify-between p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
          onClick={() => {
            if (podIssues.length > 0) {
              const issue = podIssues[0]
              drillToPod(clusterName, issue.namespace, issue.name, {
                status: issue.status,
                reason: issue.reason,
                issues: issue.issues,
                restarts: issue.restarts,
              })
            }
          }}
          title={podIssues.length > 0 ? `Click to view ${podIssues[0].name}` : 'No pod issues'}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-300">Pod Issues</span>
          </div>
          <span className="text-sm font-medium text-orange-400">{clusterPodIssues}</span>
        </div>

        <div
          className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
          onClick={() => {
            if (deploymentIssues.length > 0) {
              const issue = deploymentIssues[0]
              drillToDeployment(clusterName, issue.namespace, issue.name, {
                replicas: issue.replicas,
                readyReplicas: issue.readyReplicas,
                reason: issue.reason,
                message: issue.message,
              })
            }
          }}
          title={deploymentIssues.length > 0 ? `Click to view ${deploymentIssues[0].name}` : 'No deployment issues'}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-300">Deployment Issues</span>
          </div>
          <span className="text-sm font-medium text-red-400">{clusterDeploymentIssues}</span>
        </div>
      </div>

      {/* Server info */}
      {cluster?.server && (
        <div className="mt-4 pt-3 border-t border-border/50 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <Network className="w-3 h-3 shrink-0" />
            <span className="truncate min-w-0">{cluster.server}</span>
          </div>
        </div>
      )}
    </div>
  )
}
