import { useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Server, Cpu, MemoryStick, Box, Activity, AlertCircle, GitBranch } from 'lucide-react'
import { useClusters, ClusterInfo } from '../../hooks/useMCP'
import { Skeleton } from '../ui/Skeleton'

interface ClusterMetrics {
  cluster: ClusterInfo
  cpuUtilization: number
  memoryUtilization: number
}

export function ClusterComparisonPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { deduplicatedClusters: clusters, isLoading } = useClusters()

  // Get cluster names from URL
  const clusterNames = useMemo(() => {
    const names = searchParams.get('clusters')?.split(',').filter(Boolean) || []
    return names
  }, [searchParams])

  // Filter to only the clusters we're comparing
  const clustersToCompare = useMemo(() => {
    return clusters.filter(c => clusterNames.includes(c.name))
  }, [clusters, clusterNames])

  // Calculate metrics for each cluster
  const clusterMetrics: ClusterMetrics[] = useMemo(() => {
    return clustersToCompare.map(cluster => {
      const cpuUtilization = cluster.cpuCores && cluster.cpuRequestsCores
        ? Math.round((cluster.cpuRequestsCores / cluster.cpuCores) * 100)
        : 0
      
      const memoryUtilization = cluster.memoryGB && cluster.memoryRequestsGB
        ? Math.round((cluster.memoryRequestsGB / cluster.memoryGB) * 100)
        : 0

      return {
        cluster,
        cpuUtilization,
        memoryUtilization,
      }
    })
  }, [clustersToCompare])

  // Find differences (values that vary across clusters)
  const hasDifference = (getValue: (m: ClusterMetrics) => number | string | undefined) => {
    const values = clusterMetrics.map(getValue)
    return new Set(values).size > 1
  }

  // Get Kubernetes version from cluster
  const getK8sVersion = (_cluster: ClusterInfo) => {
    // ClusterInfo interface would need to be extended with a 'version' field containing K8s version
    // Version can be obtained from K8s API server /version endpoint during cluster discovery
    return 'N/A'
  }

  const handleBack = () => {
    navigate('/compute')
  }

  if (isLoading && clusters.length === 0) {
    return (
      <div className="pt-16">
        <div className="mb-6">
          <Skeleton variant="text" width={200} height={32} />
        </div>
        <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.max(clusterNames.length, 2)}, 1fr)` }}>
          {Array.from({ length: Math.max(clusterNames.length, 2) }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={400} />
          ))}
        </div>
      </div>
    )
  }

  if (clustersToCompare.length < 2) {
    return (
      <div className="pt-16">
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Compute
          </button>
        </div>
        <div className="glass p-8 rounded-lg text-center">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Clusters to Compare</h2>
          <p className="text-muted-foreground mb-4">
            Please select at least 2 clusters to compare.
          </p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Compute
        </button>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Server className="w-6 h-6 text-purple-400" />
          Cluster Comparison
        </h1>
        <p className="text-muted-foreground">
          Comparing {clustersToCompare.length} clusters side by side
        </p>
      </div>

      {/* Split-pane comparison view */}
      <div className={`grid gap-4 mb-6`} style={{ gridTemplateColumns: `repeat(${Math.min(clustersToCompare.length, 4)}, 1fr)` }}>
        {clusterMetrics.map(({ cluster, cpuUtilization, memoryUtilization }) => (
          <div key={cluster.name} className="glass p-5 rounded-lg">
            {/* Cluster name and status */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${cluster.healthy ? 'bg-green-400' : 'bg-red-400'}`} />
                <h3 className="text-lg font-semibold text-foreground truncate" title={cluster.name}>
                  {cluster.context || cluster.name}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground truncate" title={cluster.server}>
                {cluster.server?.replace(/^https?:\/\//, '')}
              </p>
            </div>

            {/* Kubernetes Version */}
            <div className={`mb-4 pb-4 border-b border-border/50 ${hasDifference(m => getK8sVersion(m.cluster)) ? 'bg-amber-500/20 -mx-2 px-2 rounded' : ''}`}>
              <div className="flex items-center gap-2 text-sm mb-1">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Kubernetes</span>
              </div>
              <div className="text-base font-medium text-foreground">
                {getK8sVersion(cluster)}
              </div>
            </div>

            {/* Node Count */}
            <div className={`mb-4 ${hasDifference(m => m.cluster.nodeCount) ? 'bg-amber-500/20 -mx-2 px-2 py-2 rounded' : ''}`}>
              <div className="flex items-center gap-2 text-sm mb-1">
                <Server className="w-4 h-4 text-blue-400" />
                <span className="text-muted-foreground">Nodes</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {cluster.nodeCount || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {cluster.healthy ? 'All healthy' : 'Issues detected'}
              </div>
            </div>

            {/* CPU Usage */}
            <div className={`mb-4 ${hasDifference(m => m.cpuUtilization) ? 'bg-amber-500/20 -mx-2 px-2 py-2 rounded' : ''}`}>
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span className="text-muted-foreground">CPU Usage</span>
                </div>
                <span className="text-foreground font-medium">{cpuUtilization}%</span>
              </div>
              <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-all"
                  style={{ width: `${Math.min(cpuUtilization, 100)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {cluster.cpuRequestsCores?.toFixed(1) || 0} / {cluster.cpuCores || 0} cores
              </div>
            </div>

            {/* Memory Usage */}
            <div className={`mb-4 ${hasDifference(m => m.memoryUtilization) ? 'bg-amber-500/20 -mx-2 px-2 py-2 rounded' : ''}`}>
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-green-400" />
                  <span className="text-muted-foreground">Memory Usage</span>
                </div>
                <span className="text-foreground font-medium">{memoryUtilization}%</span>
              </div>
              <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all"
                  style={{ width: `${Math.min(memoryUtilization, 100)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {cluster.memoryRequestsGB?.toFixed(1) || 0} / {cluster.memoryGB?.toFixed(1) || 0} GB
              </div>
            </div>

            {/* Pod Count */}
            <div className={`mb-4 ${hasDifference(m => m.cluster.podCount) ? 'bg-amber-500/20 -mx-2 px-2 py-2 rounded' : ''}`}>
              <div className="flex items-center gap-2 text-sm mb-1">
                <Box className="w-4 h-4 text-cyan-400" />
                <span className="text-muted-foreground">Pods</span>
              </div>
              <div className="text-2xl font-bold text-foreground">
                {cluster.podCount || 0}
              </div>
              <div className="text-xs text-muted-foreground">Running pods</div>
            </div>

            {/* Storage */}
            <div className={`pt-4 border-t border-border/50 ${hasDifference(m => m.cluster.storageGB) ? 'bg-amber-500/20 -mx-2 px-2 py-2 rounded' : ''}`}>
              <div className="flex items-center gap-2 text-sm mb-1">
                <Activity className="w-4 h-4 text-amber-400" />
                <span className="text-muted-foreground">Storage</span>
              </div>
              <div className="text-lg font-bold text-foreground">
                {cluster.storageGB ? `${cluster.storageGB.toFixed(1)} GB` : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {cluster.pvcCount || 0} PVCs ({cluster.pvcBoundCount || 0} bound)
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="glass p-4 rounded-lg">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500/20 rounded" />
            <span className="text-muted-foreground">Highlighted sections indicate differences between clusters</span>
          </div>
        </div>
      </div>
    </div>
  )
}
