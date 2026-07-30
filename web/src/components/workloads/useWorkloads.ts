import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeploymentIssues, usePodIssues, useClusters, useDeployments } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useToast } from '../ui/Toast'
import { kubectlProxy } from '../../lib/kubectlProxy'
import type { StatBlockValue } from '../ui/StatsOverview'
import type { Workload } from '../cards/WorkloadDeployment'
import { isLocalAgentSuppressed } from '../../lib/constants'
import type { AppSummary, DeploymentSummary, WorkloadItem } from './Workloads.types'

const POD_ISSUES_ERROR_THRESHOLD = 3

function mapImportedWorkload(workload: Workload): DeploymentSummary {
  const IMPORTED_WORKLOAD_CLUSTER = 'Imported'
  return {
    name: workload.name,
    namespace: workload.namespace,
    cluster: workload.targetClusters[0] || IMPORTED_WORKLOAD_CLUSTER,
    status: 'deploying',
    replicas: workload.replicas,
    readyReplicas: workload.readyReplicas,
    type: 'deployment',
    image: workload.image,
  }
}

export function useWorkloads() {
  const { t } = useTranslation()
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, error: podIssuesError, lastUpdated: podLastUpdated, refetch: refetchPodIssues } = usePodIssues()
  const { issues: deploymentIssues, isLoading: deploymentIssuesLoading, isRefreshing: deploymentIssuesRefreshing, error: deploymentIssuesError, lastUpdated: deploymentLastUpdated, refetch: refetchDeploymentIssues } = useDeploymentIssues()
  const { deployments: allDeployments, isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, error: deploymentsError, lastUpdated: deploymentsLastUpdated, refetch: refetchDeployments } = useDeployments()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, error: clustersError, lastUpdated: clustersLastUpdated, refetch: refetchClusters } = useClusters()

  const lastUpdated = useMemo(() => {
    const timestamps = [podLastUpdated, deploymentLastUpdated, deploymentsLastUpdated, clustersLastUpdated].filter(
      (ts): ts is Date => ts !== null && ts !== undefined
    )
    if (timestamps.length === 0) return null
    return timestamps.reduce((latest, current) => (current > latest ? current : latest))
  }, [podLastUpdated, deploymentLastUpdated, deploymentsLastUpdated, clustersLastUpdated])

  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  const { drillToNamespace, drillToAllNamespaces, drillToAllDeployments, drillToAllPods, drillToDeployment } = useDrillDownActions()
  const { showToast } = useToast()
  const [pendingDelete, setPendingDelete] = useState<{ cluster: string; namespace: string; name: string } | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importedWorkloads, setImportedWorkloads] = useState<Workload[]>([])

  const handleImportWorkloads = useCallback((newWorkloads: Workload[]) => {
    setImportedWorkloads(prev => [...prev, ...newWorkloads])
    showToast(t('workloads.importSuccess', 'Workload added to the list'), 'success')
  }, [showToast, t])

  const deployments = useMemo(
    () => [...allDeployments, ...importedWorkloads.map(mapImportedWorkload)],
    [allDeployments, importedWorkloads],
  )

  const isLoading = podIssuesLoading || deploymentIssuesLoading || deploymentsLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing || deploymentIssuesRefreshing || deploymentsRefreshing
  const loadError = podIssuesError || deploymentIssuesError || deploymentsError || clustersError
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode() && !isLocalAgentSuppressed() && !wasAgentEverConnected()
  const showSkeletons = ((deployments.length === 0 && podIssues.length === 0 && deploymentIssues.length === 0) && isLoading) || forceSkeletonForOffline || isModeSwitching

  const handleRefresh = () => {
    if (isRefreshing) return
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
    } catch {
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
    } catch {
      showToast(t('workloads.deleteError', 'Failed to delete deployment'), 'error')
    }
  }

  const handleShowLogs = (e: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    e.stopPropagation()
    drillToDeployment(cluster, namespace, name, { tab: 'pods' })
  }

  const { selectedClusters: globalSelectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()

  const apps = useMemo(() => {
    let filteredDeployments = deployments
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
      app.status = app.podIssues > POD_ISSUES_ERROR_THRESHOLD ? 'error' : 'warning'
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
      if (app.deploymentIssues > 3) {
        app.status = 'error'
      } else if (app.status === 'healthy') {
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
  }, [deployments, podIssues, deploymentIssues, globalSelectedClusters, isAllClustersSelected, customFilter])

  const stats = useMemo(() => {
    const namespaceApps = apps.filter(a => a.type === 'namespace') as AppSummary[]
    return {
      total: namespaceApps.length || apps.length,
      healthy: namespaceApps.filter(a => a.status === 'healthy').length,
      warning: namespaceApps.filter(a => a.status === 'warning').length,
      critical: namespaceApps.filter(a => a.status === 'error').length,
      totalDeployments: deployments.length,
      totalPodIssues: podIssues.length,
      totalDeploymentIssues: deploymentIssues.length
    }
  }, [apps, deployments, podIssues, deploymentIssues])

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'namespaces':
        return { value: stats.total, sublabel: t('workloads.activeNamespaces'), onClick: () => drillToAllNamespaces(), isClickable: apps.length > 0 }
      case 'critical':
        return { value: stats.critical, sublabel: t('workloads.criticalIssues'), onClick: () => drillToAllNamespaces('critical'), isClickable: stats.critical > 0 }
      case 'warning':
        return { value: stats.warning, sublabel: t('workloads.warningIssues'), onClick: () => drillToAllNamespaces('warning'), isClickable: stats.warning > 0 }
      case 'healthy':
        return { value: stats.healthy, sublabel: t('workloads.healthyNamespaces'), onClick: () => drillToAllNamespaces('healthy'), isClickable: stats.healthy > 0 }
      case 'deployments':
        return { value: stats.totalDeployments, sublabel: t('workloads.totalDeployments'), onClick: () => drillToAllDeployments(), isClickable: stats.totalDeployments > 0 }
      case 'pod_issues':
        return { value: stats.totalPodIssues, sublabel: t('workloads.podIssues'), onClick: () => drillToAllPods('issues'), isClickable: stats.totalPodIssues > 0 }
      case 'deployment_issues':
        return { value: stats.totalDeploymentIssues, sublabel: t('workloads.deploymentIssues'), onClick: () => drillToAllDeployments('issues'), isClickable: stats.totalDeploymentIssues > 0 }
      default:
        return { value: '-', sublabel: '' }
    }
  }

  return {
    t,
    apps,
    stats,
    clusters,
    deployments,
    podIssues,
    deploymentIssues,
    isLoading,
    isRefreshing,
    loadError,
    lastUpdated,
    showSkeletons,
    forceSkeletonForOffline,
    globalSelectedClusters,
    isAllClustersSelected,
    pendingDelete,
    setPendingDelete,
    showImportDialog,
    setShowImportDialog,
    handleImportWorkloads,
    handleRefresh,
    handleRestartDeployment,
    handleDeleteDeployment,
    confirmDeleteDeployment,
    handleShowLogs,
    getDashboardStatValue,
    drillToDeployment,
    drillToNamespace,
  }
}
