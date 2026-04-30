import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Rocket, RefreshCw, Trash2, Terminal } from 'lucide-react'
import { useDeploymentIssues, usePodIssues, useClusters, useDeployments } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { StatusIndicator, type Status } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { ROUTES } from '../../config/routes'
import { useTranslation } from 'react-i18next'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useToast } from '../ui/Toast'
import { PortalTooltip } from '../cards/llmd/shared/PortalTooltip'
import { ConfirmDialog } from '../../lib/modals'

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
  type: 'namespace'
}

interface DeploymentSummary {
  name: string
  namespace: string
  cluster: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  type: 'deployment'
  image?: string
}

type WorkloadItem = AppSummary | DeploymentSummary

export function Workloads() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // Data fetching
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, lastUpdated, refetch: refetchPodIssues } = usePodIssues()
  const { issues: deploymentIssues, isLoading: deploymentIssuesLoading, isRefreshing: deploymentIssuesRefreshing, refetch: refetchDeploymentIssues } = useDeploymentIssues()
  const { deployments: allDeployments, isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, refetch: refetchDeployments } = useDeployments()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  const { drillToNamespace, drillToAllNamespaces, drillToAllDeployments, drillToAllPods, drillToDeployment } = useDrillDownActions()
  const { showToast } = useToast()
  const [pendingDelete, setPendingDelete] = useState<{ cluster: string; namespace: string; name: string } | null>(null)

  // Combined states
  const isLoading = podIssuesLoading || deploymentIssuesLoading || deploymentsLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing || deploymentIssuesRefreshing || deploymentsRefreshing
  // Show skeletons when loading with no data OR when agent is offline and demo mode is OFF OR mode switching
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode()
  const showSkeletons = ((allDeployments.length === 0 && podIssues.length === 0 && deploymentIssues.length === 0) && isLoading) || forceSkeletonForOffline || isModeSwitching

  // Combined refresh
  const handleRefresh = () => {
    refetchPodIssues()
    refetchDeploymentIssues()
    refetchDeployments()
    refetchClusters()
  }

  const handleRestartDeployment = async (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    try {
      showToast(t('workloads.restarting', 'Restarting deployment...'), 'info')
      await kubectlProxy.exec(['rollout', 'restart', 'deployment', name, '-n', namespace], { context: cluster })
      showToast(t('workloads.restartSuccess', 'Restart triggered'), 'success')
      refetchDeployments()
    } catch (err: unknown) {
      showToast(t('workloads.restartError', 'Failed to restart deployment'), 'error')
    }
  }

  const handleDeleteDeployment = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    setPendingDelete({ cluster, namespace, name })
  }

  const confirmDeleteDeployment = async () => {
    if (!pendingDelete) return
    const { cluster, namespace, name } = pendingDelete
    setPendingDelete(null)
    try {
      showToast(t('workloads.deleting', 'Deleting deployment...'), 'info')
      await kubectlProxy.exec(['delete', 'deployment', name, '-n', namespace], { context: cluster })
      showToast(t('workloads.deleteSuccess', 'Deployment deleted'), 'success')
      refetchDeployments()
    } catch (err: unknown) {
      showToast(t('workloads.deleteError', 'Failed to delete deployment'), 'error')
    }
  }

  const handleShowLogs = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    drillToDeployment(cluster, namespace, name, { tab: 'pods' })
  }

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter } = useGlobalFilters()

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

    // If we have a filter, show individual deployments that match
    if (customFilter.trim() || !isAllClustersSelected) {
      return (filteredDeployments.map(d => ({
        ...d,
        type: 'deployment' as const
      })) as WorkloadItem[]).sort((a, b) => {
        const aName = a.type === 'deployment' ? a.name : a.namespace
        const bName = b.type === 'deployment' ? b.name : b.namespace
        return aName.localeCompare(bName)
      })
    }

    const appMap = new Map<string, AppSummary>()
    // ... (rest of namespace grouping logic)
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
          type: 'namespace'
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
          type: 'namespace'
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
          type: 'namespace'
        })
      }
      const app = appMap.get(key)!
      app.deploymentIssues++
      if (app.status !== 'error') {
        app.status = 'warning'
      }
    })

    return (Array.from(appMap.values()) as WorkloadItem[]).sort((a, b) => {
      const aStats = a as AppSummary
      const bStats = b as AppSummary
      const statusOrder: Record<string, number> = { error: 0, critical: 0, warning: 1, healthy: 2 }
      if (statusOrder[aStats.status] !== statusOrder[bStats.status]) {
        return statusOrder[aStats.status] - statusOrder[bStats.status]
      }
      return bStats.deploymentCount - aStats.deploymentCount
    })
  }, [allDeployments, podIssues, deploymentIssues, globalSelectedClusters, isAllClustersSelected, customFilter])

  const stats = useMemo(() => {
    const namespaceApps = apps.filter(a => a.type === 'namespace') as AppSummary[]
    return {
      total: namespaceApps.length || apps.length,
      healthy: namespaceApps.filter(a => a.status === 'healthy').length,
      warning: namespaceApps.filter(a => a.status === 'warning').length,
      critical: namespaceApps.filter(a => a.status === 'error').length,
      totalDeployments: allDeployments.length,
      totalPodIssues: podIssues.length,
      totalDeploymentIssues: deploymentIssues.length
    }
  }, [apps, allDeployments, podIssues, deploymentIssues])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
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
  }

  return (
    <DashboardPage
      title="Workloads"
      subtitle="View and manage deployed applications across clusters"
      icon="Layers"
      rightExtra={
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(ROUTES.DEPLOY)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            title={t('workloads.addWorkload', 'Deploy a new workload')}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('workloads.addWorkload', 'Add Workload')}
          </button>
          <RotatingTip page="workloads" />
        </div>
      }
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
        description: 'Add cards to monitor deployments, pods, and application health across your clusters.'
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
          <p className="text-lg text-foreground">{t('workloads.noWorkloadsTitle', 'No workloads found')}</p>
          <p className="text-sm text-muted-foreground mb-6">{t('workloads.noWorkloadsDesc', 'No deployments detected across your clusters')}</p>
          <button
            onClick={() => navigate(ROUTES.DEPLOY)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            <Rocket className="w-4 h-4" />
            {t('workloads.deployWorkload', 'Deploy a Workload')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((item, i) => {
            const isDeployment = item.type === 'deployment'
            const app = item as AppSummary
            const deploy = item as DeploymentSummary

            const status = isDeployment
              ? (deploy.status === 'failed' ? 'error' : deploy.status === 'deploying' ? 'warning' : 'healthy')
              : app.status

            return (
              <div
                key={i}
                onClick={() => isDeployment
                  ? drillToDeployment(deploy.cluster, deploy.namespace, deploy.name)
                  : drillToNamespace(app.cluster, app.namespace)
                }
                className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${status === 'error' ? 'border-l-red-500' :
                  status === 'warning' ? 'border-l-yellow-500' :
                    'border-l-green-500'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <StatusIndicator status={status as Status} size="lg" />
                    <div>
                      <h3 className="font-semibold text-foreground">{isDeployment ? deploy.name : app.namespace}</h3>
                      <div className="flex items-center gap-2">
                        <ClusterBadge cluster={item.cluster.split('/').pop() || item.cluster} size="sm" />
                        {isDeployment && <span className="text-xs text-muted-foreground">{deploy.namespace}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {isDeployment ? (
                      <>
                        <div className="text-center">
                          <div className="text-lg font-bold text-foreground">{deploy.readyReplicas}/{deploy.replicas}</div>
                          <div className="text-xs text-muted-foreground">{t('common.ready')}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <PortalTooltip content={t('common.restart', 'Restart')}>
                            <button
                              onClick={(e) => handleRestartDeployment(e, deploy.cluster, deploy.namespace, deploy.name)}
                              className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-blue-400 transition-colors"
                              aria-label="Restart deployment"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </PortalTooltip>

                          <PortalTooltip content={t('common.logs', 'Logs')}>
                            <button
                              onClick={(e) => handleShowLogs(e, deploy.cluster, deploy.namespace, deploy.name)}
                              className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-purple-400 transition-colors"
                              aria-label="View logs"
                            >
                              <Terminal className="w-4 h-4" />
                            </button>
                          </PortalTooltip>

                          <PortalTooltip content={t('common.delete', 'Delete')}>
                            <button
                              onClick={(e) => handleDeleteDeployment(e, deploy.cluster, deploy.namespace, deploy.name)}
                              className="p-1.5 hover:bg-white/10 rounded-md text-muted-foreground hover:text-red-400 transition-colors"
                              aria-label="Delete deployment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </PortalTooltip>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-center">
                          <div className="text-lg font-bold text-foreground">{app.deploymentCount}</div>
                          <div className="text-xs text-muted-foreground">{t('common.deployments')}</div>
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
                      </>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            )
          })}
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

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteDeployment}
        title={t('workloads.deleteDeployment', 'Delete Deployment')}
        message={t('workloads.confirmDelete', 'Are you sure you want to delete deployment {{name}}? This action cannot be undone.', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('common:actions.delete', 'Delete')}
        variant="danger"
      />
    </DashboardPage>
  )
}
