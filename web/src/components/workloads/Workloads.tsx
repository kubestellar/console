import { useCallback, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useDeploymentIssues, usePodIssues, useClusters, useDeployments } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { useTranslation } from 'react-i18next'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useToast } from '../ui/Toast'
import { WorkloadImportDialog } from '../cards/WorkloadImportDialog'
import { ConfirmDialog } from '../../lib/modals'
import type { Workload } from '../cards/WorkloadDeployment'
import { isLocalAgentSuppressed } from '../../lib/constants'
import {
  ClustersOverviewSection,
  WorkloadsErrorBanner,
  WorkloadsList,
} from './Workloads.parts'
import {
  useWorkloadsFilters,
  type WorkloadDeployment,
} from './useWorkloadsFilters'

const WORKLOADS_CARDS_KEY = 'kubestellar-workloads-cards'
const IMPORTED_WORKLOAD_CLUSTER = 'Imported'
const DEFAULT_WORKLOAD_CARDS = getDefaultCards('workloads')

interface PendingDelete {
  cluster: string
  namespace: string
  name: string
}

function mapImportedWorkload(workload: Workload): WorkloadDeployment {
  return {
    name: workload.name,
    namespace: workload.namespace,
    cluster: workload.targetClusters[0] || IMPORTED_WORKLOAD_CLUSTER,
    status: 'deploying',
    replicas: workload.replicas,
    readyReplicas: workload.readyReplicas,
    image: workload.image,
  }
}

function useWorkloadImportState(onImportSuccess: () => void) {
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importedWorkloads, setImportedWorkloads] = useState<Workload[]>([])

  const handleImportWorkloads = useCallback((newWorkloads: Workload[]) => {
    setImportedWorkloads((prev) => [...prev, ...newWorkloads])
    onImportSuccess()
  }, [onImportSuccess])

  return {
    showImportDialog,
    setShowImportDialog,
    importedWorkloads,
    handleImportWorkloads,
  }
}

function useWorkloadsData(importedWorkloads: Workload[]) {
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, error: podIssuesError, lastUpdated: podLastUpdated, refetch: refetchPodIssues } = usePodIssues()
  const { issues: deploymentIssues, isLoading: deploymentIssuesLoading, isRefreshing: deploymentIssuesRefreshing, error: deploymentIssuesError, lastUpdated: deploymentLastUpdated, refetch: refetchDeploymentIssues } = useDeploymentIssues()
  const { deployments: allDeployments, isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, error: deploymentsError, lastUpdated: deploymentsLastUpdated, refetch: refetchDeployments } = useDeployments()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, error: clustersError, lastUpdated: clustersLastUpdated, refetch: refetchClusters } = useClusters()
  const { status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  const deployments = useMemo(
    () => [...allDeployments, ...importedWorkloads.map(mapImportedWorkload)],
    [allDeployments, importedWorkloads],
  )

  const lastUpdated = useMemo(() => {
    const timestamps = [podLastUpdated, deploymentLastUpdated, deploymentsLastUpdated, clustersLastUpdated].filter(
      (timestamp): timestamp is Date => timestamp !== null && timestamp !== undefined,
    )
    if (timestamps.length === 0) return null
    return timestamps.reduce((latest, current) => (current > latest ? current : latest))
  }, [podLastUpdated, deploymentLastUpdated, deploymentsLastUpdated, clustersLastUpdated])

  const isLoading = podIssuesLoading || deploymentIssuesLoading || deploymentsLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing || deploymentIssuesRefreshing || deploymentsRefreshing
  const loadError = podIssuesError || deploymentIssuesError || deploymentsError || clustersError

  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode() && !isLocalAgentSuppressed() && !wasAgentEverConnected()
  const showSkeletons = ((deployments.length === 0 && podIssues.length === 0 && deploymentIssues.length === 0) && isLoading) || forceSkeletonForOffline || isModeSwitching

  return {
    podIssues,
    deploymentIssues,
    deployments,
    clusters,
    refetchPodIssues,
    refetchDeploymentIssues,
    refetchDeployments,
    refetchClusters,
    isLoading,
    isRefreshing,
    loadError,
    showSkeletons,
    forceSkeletonForOffline,
    lastUpdated,
  }
}

function useDeploymentActions({
  refetchDeployments,
  showToast,
  t,
}: {
  refetchDeployments: () => void
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
  t: (key: string, fallback?: string, options?: Record<string, unknown>) => string
}) {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const handleRestartDeployment = useCallback(async (event: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    event.stopPropagation()
    try {
      showToast(t('workloads.restarting', 'Restarting deployment...'), 'info')
      await kubectlProxy.exec(['rollout', 'restart', 'deployment', name, '-n', namespace], { context: cluster })
      showToast(t('workloads.restartSuccess', 'Restart triggered'), 'success')
      refetchDeployments()
    } catch {
      showToast(t('workloads.restartError', 'Failed to restart deployment'), 'error')
    }
  }, [refetchDeployments, showToast, t])

  const handleDeleteDeployment = useCallback((event: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    event.stopPropagation()
    setPendingDelete({ cluster, namespace, name })
  }, [])

  const confirmDeleteDeployment = useCallback(async () => {
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
  }, [pendingDelete, refetchDeployments, showToast, t])

  return {
    pendingDelete,
    setPendingDelete,
    handleRestartDeployment,
    handleDeleteDeployment,
    confirmDeleteDeployment,
  }
}

export function Workloads() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { drillToNamespace, drillToAllNamespaces, drillToAllDeployments, drillToAllPods, drillToDeployment } = useDrillDownActions()

  const {
    showImportDialog,
    setShowImportDialog,
    importedWorkloads,
    handleImportWorkloads,
  } = useWorkloadImportState(() => {
    showToast(t('workloads.importSuccess', 'Workload added to the list'), 'success')
  })

  const {
    podIssues,
    deploymentIssues,
    deployments,
    clusters,
    refetchPodIssues,
    refetchDeploymentIssues,
    refetchDeployments,
    refetchClusters,
    isLoading,
    isRefreshing,
    loadError,
    showSkeletons,
    forceSkeletonForOffline,
    lastUpdated,
  } = useWorkloadsData(importedWorkloads)

  const {
    apps,
    stats,
    selectedClusters,
    isAllClustersSelected,
  } = useWorkloadsFilters({
    deployments,
    podIssues,
    deploymentIssues,
  })

  const {
    pendingDelete,
    setPendingDelete,
    handleRestartDeployment,
    handleDeleteDeployment,
    confirmDeleteDeployment,
  } = useDeploymentActions({
    refetchDeployments,
    showToast,
    t,
  })

  const handleRefresh = () => {
    if (isRefreshing) return
    refetchPodIssues()
    refetchDeploymentIssues()
    refetchDeployments()
    refetchClusters()
  }

  const handleShowLogs = (event: React.MouseEvent, cluster: string, namespace: string, name: string) => {
    event.stopPropagation()
    drillToDeployment(cluster, namespace, name, { tab: 'pods' })
  }

  const getDashboardStatValue = (blockId: string) => {
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

  return (
    <DashboardPage
      title={t('workloads.title')}
      subtitle={t('workloads.subtitle')}
      icon="Box"
      rightExtra={(
        <div className="flex items-center gap-2">
          <button
            data-testid="add-workload-btn"
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            title={t('workloads.addWorkload', 'Add a new workload')}
          >
            <Plus className="w-3.5 h-3.5" />
            {t('workloads.addWorkload', 'Add Workload')}
          </button>
          <RotatingTip page="workloads" />
        </div>
      )}
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
        title: t('workloads.dashboardTitle'),
        description: t('workloads.emptyDescription'),
      }}
    >
      {loadError && (
        <WorkloadsErrorBanner loadError={loadError} onRetry={handleRefresh} t={t} />
      )}

      <WorkloadsList
        apps={apps}
        showSkeletons={showSkeletons}
        onOpenImportDialog={() => setShowImportDialog(true)}
        onNamespaceClick={drillToNamespace}
        onDeploymentClick={(cluster, namespace, name) => drillToDeployment(cluster, namespace, name)}
        onRestartDeployment={handleRestartDeployment}
        onShowLogs={handleShowLogs}
        onDeleteDeployment={handleDeleteDeployment}
        t={t}
      />

      <ClustersOverviewSection
        clusters={clusters}
        forceSkeletonForOffline={forceSkeletonForOffline}
        isAllClustersSelected={isAllClustersSelected}
        selectedClusters={selectedClusters}
      />

      <WorkloadImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={handleImportWorkloads}
      />

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
