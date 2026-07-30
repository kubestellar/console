import { Plus } from 'lucide-react'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { WorkloadImportDialog } from '../cards/WorkloadImportDialog'
import { ConfirmDialog } from '../../lib/modals'
import { useWorkloads } from './useWorkloads'
import {
  WorkloadsErrorBanner,
  WorkloadSkeletonList,
  WorkloadsEmptyState,
  WorkloadRow,
  ClustersOverview,
} from './Workloads.parts'

const WORKLOADS_CARDS_KEY = 'kubestellar-workloads-cards'
const DEFAULT_WORKLOAD_CARDS = getDefaultCards('workloads')

export function Workloads() {
  const {
    t,
    apps,
    clusters,
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
  } = useWorkloads()

  return (
    <DashboardPage
      title={t('workloads.title')}
      subtitle={t('workloads.subtitle')}
      icon="Box"
      rightExtra={
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
        title: t('workloads.dashboardTitle'),
        description: t('workloads.emptyDescription')
      }}
    >
      <WorkloadsErrorBanner error={loadError} onRetry={handleRefresh} t={t} />

      {showSkeletons ? (
        <WorkloadSkeletonList />
      ) : apps.length === 0 ? (
        <WorkloadsEmptyState onDeploy={() => setShowImportDialog(true)} t={t} />
      ) : (
        <div data-testid="workloads-list" className="space-y-3">
          {apps.map((item, i) => (
            <WorkloadRow
              key={i}
              item={item}
              onDrillToDeployment={drillToDeployment}
              onDrillToNamespace={drillToNamespace}
              onRestart={handleRestartDeployment}
              onLogs={handleShowLogs}
              onDelete={handleDeleteDeployment}
              t={t}
            />
          ))}
        </div>
      )}

      <ClustersOverview
        clusters={clusters}
        isAllClustersSelected={isAllClustersSelected}
        globalSelectedClusters={globalSelectedClusters}
        forceSkeletonForOffline={forceSkeletonForOffline}
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
