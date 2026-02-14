import { useMemo, useState } from 'react'
import {
  Server, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, Loader2, ChevronDown, ChevronRight,
  Box, Activity,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedPodIssues, useCachedDeploymentIssues } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { cn } from '../../../lib/cn'
import { useCardLoadingState } from '../CardDataContext'
import { WorkloadMonitorAlerts } from './WorkloadMonitorAlerts'
import { WorkloadMonitorDiagnose } from './WorkloadMonitorDiagnose'
import type { MonitorIssue, MonitoredResource, ResourceHealthStatus } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'

interface ClusterHealthMonitorProps {
  config?: Record<string, unknown>
}

interface ClusterHealthSummary {
  name: string
  status: ResourceHealthStatus
  nodes: number
  podIssueCount: number
  deployIssueCount: number
  totalIssues: number
}

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-green-400',
  degraded: 'bg-yellow-400',
  unhealthy: 'bg-red-400',
  unknown: 'bg-gray-400',
}

export function ClusterHealthMonitor({ config: _config }: ClusterHealthMonitorProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: allClusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { issues: allPodIssues, isLoading: podsLoading, refetch: refetchPods } = useCachedPodIssues()
  const { issues: allDeployIssues, isLoading: deploysLoading, refetch: refetchDeploys } = useCachedDeploymentIssues()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)

  const isLoading = clustersLoading || podsLoading || deploysLoading

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: allClusters.length > 0,
  })

  // Filter clusters by global filter
  const clusters = useMemo(() => {
    if (isAllClustersSelected) return allClusters
    return allClusters.filter(c => selectedClusters.includes(c.name))
  }, [allClusters, selectedClusters, isAllClustersSelected])

  // Build per-cluster health summaries
  const clusterSummaries = useMemo<ClusterHealthSummary[]>(() => {
    return clusters.map(cluster => {
      const podIssues = allPodIssues.filter(p => p.cluster === cluster.name)
      const deployIssues = allDeployIssues.filter(d => d.cluster === cluster.name)
      const totalIssues = podIssues.length + deployIssues.length

      let status: ResourceHealthStatus = 'healthy'
      if (totalIssues > 5) status = 'unhealthy'
      else if (totalIssues > 0) status = 'degraded'

      return {
        name: cluster.name,
        status,
        nodes: cluster.nodeCount || 0,
        podIssueCount: podIssues.length,
        deployIssueCount: deployIssues.length,
        totalIssues,
      }
    }).sort((a, b) => {
      const order: Record<string, number> = { unhealthy: 0, degraded: 1, unknown: 2, healthy: 3 }
      return (order[a.status] ?? 2) - (order[b.status] ?? 2)
    })
  }, [clusters, allPodIssues, allDeployIssues])

  // Overall stats
  const stats = useMemo(() => {
    const total = clusterSummaries.length
    const healthy = clusterSummaries.filter(c => c.status === 'healthy').length
    const degraded = clusterSummaries.filter(c => c.status === 'degraded').length
    const unhealthy = clusterSummaries.filter(c => c.status === 'unhealthy').length
    const totalPodIssues = allPodIssues.length
    const totalDeployIssues = allDeployIssues.length
    const totalNodes = clusterSummaries.reduce((sum, c) => sum + c.nodes, 0)
    return { total, healthy, degraded, unhealthy, totalPodIssues, totalDeployIssues, totalNodes }
  }, [clusterSummaries, allPodIssues, allDeployIssues])

  const overallHealth = useMemo<ResourceHealthStatus>(() => {
    if (stats.unhealthy > 0) return 'unhealthy'
    if (stats.degraded > 0) return 'degraded'
    if (stats.total === 0) return 'unknown'
    return 'healthy'
  }, [stats])

  // Synthesize issues
  const issues = useMemo<MonitorIssue[]>(() => {
    const result: MonitorIssue[] = []

    // Pod issues
    allPodIssues.forEach((p, idx) => {
      const clusterMatch = isAllClustersSelected || selectedClusters.includes(p.cluster || '')
      if (!clusterMatch) return
      result.push({
        id: `pod-${p.name}-${idx}`,
        resource: {
          id: `Pod/${p.namespace}/${p.name}`,
          kind: 'Pod',
          name: p.name || 'unknown',
          namespace: p.namespace || 'default',
          cluster: p.cluster || 'unknown',
          status: 'unhealthy',
          category: 'workload',
          lastChecked: new Date().toISOString(),
          optional: false,
          order: idx,
        },
        severity: p.restarts > 10 ? 'critical' : 'warning',
        title: `Pod ${p.name} issue`,
        description: p.reason || `Pod in ${p.status} state with ${p.restarts || 0} restarts`,
        detectedAt: new Date().toISOString(),
      })
    })

    // Deployment issues
    allDeployIssues.forEach((d, idx) => {
      const clusterMatch = isAllClustersSelected || selectedClusters.includes(d.cluster || '')
      if (!clusterMatch) return
      result.push({
        id: `deploy-${d.name}-${idx}`,
        resource: {
          id: `Deployment/${d.namespace}/${d.name}`,
          kind: 'Deployment',
          name: d.name || 'unknown',
          namespace: d.namespace || 'default',
          cluster: d.cluster || 'unknown',
          status: 'unhealthy',
          category: 'workload',
          lastChecked: new Date().toISOString(),
          optional: false,
          order: idx,
        },
        severity: 'warning',
        title: `Deployment ${d.name} issue`,
        description: d.reason || `Deployment has ${d.readyReplicas || 0}/${d.replicas || 0} ready replicas`,
        detectedAt: new Date().toISOString(),
      })
    })

    return result.slice(0, 50)
  }, [allPodIssues, allDeployIssues, selectedClusters, isAllClustersSelected])

  // Synthesize resources for diagnose
  const monitorResources = useMemo<MonitoredResource[]>(() => {
    return clusterSummaries.map((c, idx) => ({
      id: `Cluster/${c.name}`,
      kind: 'Cluster',
      name: c.name,
      namespace: '',
      cluster: c.name,
      status: c.status,
      category: 'workload' as const,
      lastChecked: new Date().toISOString(),
      optional: false,
      order: idx,
    }))
  }, [clusterSummaries])

  const toggleCluster = (name: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        refetchClusters?.(),
        refetchPods?.(),
        refetchDeploys?.(),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  if (isLoading && clusters.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={160} height={20} />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} />
          ))}
        </div>
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
        <Server className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">Cluster Health</span>
        <span className="text-xs text-muted-foreground">{stats.total} clusters</span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded ml-auto', STATUS_BADGE[overallHealth] || STATUS_BADGE.unknown)}>
          {overallHealth}
        </span>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-secondary transition-colors"
          title={t('common.refresh')}
        >
          {isRefreshing
            ? <Loader2 className="w-3.5 h-3.5 text-green-400 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-foreground">{stats.totalNodes}</p>
          <p className="text-[10px] text-muted-foreground">{t('common.nodes')}</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-red-400">{stats.totalPodIssues}</p>
          <p className="text-[10px] text-muted-foreground">Pod Issues</p>
        </div>
        <div className="rounded-md bg-card/50 border border-border p-2 text-center">
          <p className="text-lg font-semibold text-orange-400">{stats.totalDeployIssues}</p>
          <p className="text-[10px] text-muted-foreground">Deploy Issues</p>
        </div>
      </div>

      {/* Cluster list */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {clusterSummaries.map(cluster => {
          const isExpanded = expandedClusters.has(cluster.name)
          const clusterPodIssues = allPodIssues.filter(p => p.cluster === cluster.name)
          const clusterDeployIssues = allDeployIssues.filter(d => d.cluster === cluster.name)

          return (
            <div key={cluster.name} className="border-b border-border/30 last:border-0">
              <button
                onClick={() => toggleCluster(cluster.name)}
                className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-card/30 rounded transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[cluster.status] || 'bg-gray-400')} />
                <Server className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{cluster.name}</span>
                {cluster.nodes > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {cluster.nodes} nodes
                  </span>
                )}
                <span className={cn('text-xs px-1.5 py-0.5 rounded shrink-0', STATUS_BADGE[cluster.status])}>
                  {cluster.totalIssues > 0 ? `${cluster.totalIssues} issues` : 'healthy'}
                </span>
              </button>

              {isExpanded && (
                <div className="ml-8 mb-1.5 space-y-0.5">
                  {/* Pod issues for this cluster */}
                  {clusterPodIssues.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 py-0.5 px-1">
                        <Box className="w-3 h-3 text-orange-400" />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          Pod Issues ({clusterPodIssues.length})
                        </span>
                      </div>
                      {clusterPodIssues.slice(0, 5).map((p, i) => (
                        <div key={`pod-${i}`} className="flex items-center gap-2 py-0.5 px-1 ml-4 rounded hover:bg-card/30 transition-colors">
                          <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                          <span className="text-xs text-foreground truncate flex-1">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{p.namespace}</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
                            {p.status || 'error'}
                          </span>
                        </div>
                      ))}
                      {clusterPodIssues.length > 5 && (
                        <p className="text-[10px] text-muted-foreground ml-4 px-1">
                          +{clusterPodIssues.length - 5} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Deploy issues for this cluster */}
                  {clusterDeployIssues.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 py-0.5 px-1">
                        <Activity className="w-3 h-3 text-yellow-400" />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          Deployment Issues ({clusterDeployIssues.length})
                        </span>
                      </div>
                      {clusterDeployIssues.slice(0, 5).map((d, i) => (
                        <div key={`deploy-${i}`} className="flex items-center gap-2 py-0.5 px-1 ml-4 rounded hover:bg-card/30 transition-colors">
                          <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                          <span className="text-xs text-foreground truncate flex-1">{d.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{d.namespace}</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 shrink-0">
                            {d.readyReplicas ?? 0}/{d.replicas ?? 0}
                          </span>
                        </div>
                      ))}
                      {clusterDeployIssues.length > 5 && (
                        <p className="text-[10px] text-muted-foreground ml-4 px-1">
                          +{clusterDeployIssues.length - 5} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Healthy state */}
                  {clusterPodIssues.length === 0 && clusterDeployIssues.length === 0 && (
                    <div className="flex items-center gap-2 py-1 px-1">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      <span className="text-xs text-green-400">All workloads healthy</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {clusterSummaries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No clusters available.</p>
          </div>
        )}
      </div>

      {/* Alerts */}
      <WorkloadMonitorAlerts issues={issues.slice(0, 10)} />

      {/* AI Diagnose & Repair */}
      <WorkloadMonitorDiagnose
        resources={monitorResources}
        issues={issues.slice(0, 20)}
        monitorType="cluster-health"
        diagnosable={true}
        repairable={true}
        workloadContext={{
          totalClusters: stats.total,
          healthyClusters: stats.healthy,
          degradedClusters: stats.degraded,
          unhealthyClusters: stats.unhealthy,
          totalNodes: stats.totalNodes,
          totalPodIssues: stats.totalPodIssues,
          totalDeployIssues: stats.totalDeployIssues,
          clusterSummaries: clusterSummaries.map(c => ({
            name: c.name,
            status: c.status,
            nodes: c.nodes,
            issues: c.totalIssues,
          })),
        }}
      />
    </div>
  )
}
