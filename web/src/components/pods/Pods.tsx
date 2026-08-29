import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPodIssues } from '../../hooks/useCachedData'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { usePodsView } from './usePodsView'
import {
  PodsSkeletonList,
  PodsEmptyState,
  PodIssuesList,
  ClustersOverview,
  PodDeleteDialog,
} from './Pods.parts'

const PODS_CARDS_KEY = 'kubestellar-pods-cards'

// Default cards for the pods dashboard
const DEFAULT_POD_CARDS = getDefaultCards('pods')

export function Pods() {
  // Data fetching via stale-while-revalidate cache hooks
  const {
    issues: podIssues,
    isLoading: podIssuesLoading,
    isRefreshing,
    error: podIssuesError,
    lastRefresh: podIssuesLastRefresh,
    refetch: refetchPodIssues,
    retryFetch: retryPodIssues,
  } = useCachedPodIssues()
  const { deduplicatedClusters: clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const isLoading = podIssuesLoading || clustersLoading

  const {
    filteredPodIssues,
    stats,
    showSkeletons,
    lastUpdated,
    handleRefresh,
    backendActionUnavailable,
    backendUnavailableMessage,
    backendStaleStatusMessage,
    deleteConfirm,
    isDeleting,
    pendingDeleteRef,
    executeDeletePod,
    handlePodIssueKeyDown,
    handleShowLogs,
    handleRestartPod,
    handleDeletePod,
    drillToPod,
    getDashboardStatValue,
    globalSelectedClusters,
    isAllClustersSelected,
  } = usePodsView({
    podIssues,
    isLoading,
    clusters,
    refetchPodIssues,
    refetchClusters,
    podIssuesLastRefresh,
  })

  return (
    <DashboardPage
      title="Pods"
      subtitle="Monitor pod health and issues across clusters"
      icon="Hexagon"
      rightExtra={<RotatingTip page="pods" />}
      beforeCards={backendActionUnavailable ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{backendStaleStatusMessage}</span>
        </div>
      ) : null}
      storageKey={PODS_CARDS_KEY}
      defaultCards={DEFAULT_POD_CARDS}
      statsType="pods"
      getStatValue={getDashboardStatValue}
      onRefresh={handleRefresh}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.totalPods > 0}
      emptyState={{
        title: 'Pods Dashboard',
        description: 'Add cards to monitor pod health, issues, and resource usage across your clusters.'
      }}
    >
      {backendActionUnavailable && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {backendUnavailableMessage}
        </div>
      )}

      {podIssuesError && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Unable to load pod issues: {podIssuesError}</span>
          <button
            type="button"
            onClick={() => retryPodIssues()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      )}

      {showSkeletons ? (
        <PodsSkeletonList />
      ) : filteredPodIssues.length === 0 ? (
        <PodsEmptyState />
      ) : (
        <PodIssuesList
          issues={filteredPodIssues}
          backendActionUnavailable={backendActionUnavailable}
          backendUnavailableMessage={backendUnavailableMessage}
          onDrillToPod={drillToPod}
          onKeyDown={handlePodIssueKeyDown}
          onShowLogs={handleShowLogs}
          onRestart={handleRestartPod}
          onDelete={handleDeletePod}
        />
      )}

      <ClustersOverview
        clusters={clusters || []}
        isAllClustersSelected={isAllClustersSelected}
        globalSelectedClusters={globalSelectedClusters}
      />

      <PodDeleteDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => { deleteConfirm.close(); pendingDeleteRef.current = null }}
        onConfirm={executeDeletePod}
        podName={pendingDeleteRef.current?.name ?? ''}
        isLoading={isDeleting}
      />
    </DashboardPage>
  )
}
