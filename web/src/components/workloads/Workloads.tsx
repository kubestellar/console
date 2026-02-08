import { useMemo, useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import { useDeploymentIssues, usePodIssues, useClusters, useDeployments } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { StatusIndicator } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'

const WORKLOADS_CARDS_KEY = 'kubestellar-workloads-cards'

// Default cards for the workloads dashboard
const DEFAULT_WORKLOAD_CARDS = getDefaultCards('workloads')

interface AppSummary {
  namespace: string
  cluster: string
  deploymentCount: number
  podIssues: number
  deploymentIssues: number
  status: 'healthy' | 'warning' | 'error'
}

export function Workloads() {
  // Data fetching
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, lastUpdated, refetch: refetchPodIssues } = usePodIssues()
  const { issues: deploymentIssues, isLoading: deploymentIssuesLoading, isRefreshing: deploymentIssuesRefreshing, refetch: refetchDeploymentIssues } = useDeploymentIssues()
  const { deployments: allDeployments, isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, refetch: refetchDeployments } = useDeployments()
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  const { drillToNamespace, drillToAllNamespaces, drillToAllDeployments, drillToAllPods } = useDrillDownActions()

  // Combined states
  const isLoading = podIssuesLoading || deploymentIssuesLoading || deploymentsLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing || deploymentIssuesRefreshing || deploymentsRefreshing
  // Show skeletons when loading with no data OR when agent is offline and demo mode is OFF OR mode switching
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline
  const showSkeletons = ((allDeployments.length === 0 && podIssues.length === 0 && deploymentIssues.length === 0) && isLoading) || forceSkeletonForOffline || isModeSwitching

  // Combined refresh
  const handleRefresh = useCallback(() => {
    refetchPodIssues()
    refetchDeploymentIssues()
    refetchDeployments()
    refetchClusters()
  }, [refetchPodIssues, refetchDeploymentIssues, refetchDeployments, refetchClusters])

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Group applications by namespace with global filter applied
  const apps = useMemo(() => {
    let filteredDeployments = allDeployments
    let filteredPodIssues = podIssues
    let filteredDeploymentIssues = deploymentIssues

    if (!isAllClustersSelected) {
      filteredDeployments = filteredDeployments.filter(d =>
        d.cluster && globalSelectedClusters.includes(d.cluster)
      )
      filteredPodIssues = filteredPodIssues.filter(issue =>
        issue.cluster && globalSelectedClusters.includes(issue.cluster)
      )
      filteredDeploymentIssues = filteredDeploymentIssues.filter(issue =>
        issue.cluster && globalSelectedClusters.includes(issue.cluster)
      )
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filteredDeployments = filteredDeployments.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.namespace.toLowerCase().includes(query) ||
        (d.cluster && d.cluster.toLowerCase().includes(query))
      )
      filteredPodIssues = filteredPodIssues.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query))
      )
      filteredDeploymentIssues = filteredDeploymentIssues.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query))
      )
    }

    const appMap = new Map<string, AppSummary>()

    filteredDeployments.forEach(deployment => {
      const key = `${deployment.cluster}/${deployment.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: deployment.namespace,
          cluster: deployment.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.deploymentCount++
    })

    filteredPodIssues.forEach(issue => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.podIssues++
      app.status = app.podIssues > 3 ? 'error' : 'warning'
    })

    filteredDeploymentIssues.forEach(issue => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.deploymentIssues++
      if (app.status !== 'error') {
        app.status = 'warning'
      }
    })

    return Array.from(appMap.values()).sort((a, b) => {
      const statusOrder: Record<string, number> = { error: 0, critical: 0, warning: 1, healthy: 2 }
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      return b.deploymentCount - a.deploymentCount
    })
  }, [allDeployments, podIssues, deploymentIssues, globalSelectedClusters, isAllClustersSelected, customFilter])

  const stats = useMemo(() => ({
    total: apps.length,
    healthy: apps.filter(a => a.status === 'healthy').length,
    warning: apps.filter(a => a.status === 'warning').length,
    critical: apps.filter(a => a.status === 'error').length,
    totalDeployments: apps.reduce((sum, a) => sum + a.deploymentCount, 0),
    totalPodIssues: podIssues.length,
    totalDeploymentIssues: deploymentIssues.length,
  }), [apps, podIssues, deploymentIssues])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'namespaces':
        return { value: stats.total, sublabel: 'active namespaces', onClick: () => drillToAllNamespaces(), isClickable: apps.length > 0 }
      case 'critical':
        return { value: stats.critical, sublabel: 'critical issues', onClick: () => drillToAllNamespaces('critical'), isClickable: stats.critical > 0 }
      case 'warning':
        return { value: stats.warning, sublabel: 'warning issues', onClick: () => drillToAllNamespaces('warning'), isClickable: stats.warning > 0 }
      case 'healthy':
        return { value: stats.healthy, sublabel: 'healthy namespaces', onClick: () => drillToAllNamespaces('healthy'), isClickable: stats.healthy > 0 }
      case 'deployments':
        return { value: stats.totalDeployments, sublabel: 'total deployments', onClick: () => drillToAllDeployments(), isClickable: stats.totalDeployments > 0 }
      case 'pod_issues':
        return { value: stats.totalPodIssues, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: stats.totalPodIssues > 0 }
      case 'deployment_issues':
        return { value: stats.totalDeploymentIssues, sublabel: 'deployment issues', onClick: () => drillToAllDeployments('issues'), isClickable: stats.totalDeploymentIssues > 0 }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, apps, drillToAllNamespaces, drillToAllDeployments, drillToAllPods])

  return (
    <DashboardPage
      title="Workloads"
      subtitle="View and manage deployed applications across clusters"
      icon="Layers"
      storageKey={WORKLOADS_CARDS_KEY}
      defaultCards={DEFAULT_WORKLOAD_CARDS}
      statsType="workloads"
      getStatValue={getDashboardStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={apps.length > 0 || !showSkeletons}
      emptyState={{
        title: 'Workloads Dashboard',
        description: 'Add cards to monitor deployments, pods, and application health across your clusters.',
      }}
    >
      {/* Workloads List */}
      {showSkeletons ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass p-4 rounded-lg border-l-4 border-l-gray-500/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton variant="circular" width={24} height={24} />
                  <div>
                    <Skeleton variant="text" width={150} height={20} className="mb-1" />
                    <Skeleton variant="rounded" width={80} height={18} />
                  </div>
                </div>
                <Skeleton variant="text" width={100} height={20} />
              </div>
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-lg text-foreground">No workloads found</p>
          <p className="text-sm text-muted-foreground">No deployments detected across your clusters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app, i) => (
            <div
              key={i}
              onClick={() => drillToNamespace(app.cluster, app.namespace)}
              className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${
                app.status === 'error' ? 'border-l-red-500' :
                app.status === 'warning' ? 'border-l-yellow-500' :
                'border-l-green-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusIndicator status={app.status} size="lg" />
                  <div>
                    <h3 className="font-semibold text-foreground">{app.namespace}</h3>
                    <ClusterBadge cluster={app.cluster.split('/').pop() || app.cluster} size="sm" />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-lg font-bold text-foreground">{app.deploymentCount}</div>
                    <div className="text-xs text-muted-foreground">Deployments</div>
                  </div>
                  {app.deploymentIssues > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-orange-400">{app.deploymentIssues}</div>
                      <div className="text-xs text-muted-foreground">Issues</div>
                    </div>
                  )}
                  {app.podIssues > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-400">{app.podIssues}</div>
                      <div className="text-xs text-muted-foreground">Pod Issues</div>
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clusters Summary */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clusters Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {forceSkeletonForOffline ? (
            // Show skeleton when agent is offline and demo mode is OFF
            [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton variant="circular" width={16} height={16} />
                  <Skeleton variant="text" width={100} height={16} />
                </div>
                <Skeleton variant="text" width={80} height={12} />
              </div>
            ))
          ) : (
            clusters
              .filter(cluster => isAllClustersSelected || globalSelectedClusters.includes(cluster.name))
              .map((cluster) => (
              <div key={cluster.name} className="glass p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <StatusIndicator
                    status={cluster.reachable === false ? 'unreachable' : cluster.healthy ? 'healthy' : 'error'}
                    size="sm"
                  />
                  <span className="font-medium text-foreground text-sm truncate">
                    {cluster.context || cluster.name.split('/').pop()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods • {cluster.reachable !== false ? (cluster.nodeCount ?? '-') : '-'} nodes
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardPage>
  )
}
