import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { RotatingTip } from '../ui/RotatingTip'
import { SyncDialog } from './SyncDialog'
import { useGitOps, GITOPS_STORAGE_KEY, DEFAULT_GITOPS_CARDS } from './useGitOps'
import { GitOpsFiltersAndList, GitOpsIntegrationInfo } from './GitOps.parts'

export function GitOps() {
  const {
    t,
    clusters,
    filteredApps,
    stats,
    dataRefreshing,
    lastUpdated,
    selectedCluster,
    setSelectedCluster,
    statusFilter,
    setStatusFilter,
    syncDialogApp,
    setSyncDialogApp,
    syncStatusColor,
    syncStatusLabel,
    healthStatusIndicator,
    getDashboardStatValue,
    handleRefresh,
    handleSync,
    handleSyncComplete,
  } = useGitOps()

  const filtersAndAppsList = (
    <GitOpsFiltersAndList
      clusters={clusters}
      selectedCluster={selectedCluster}
      statusFilter={statusFilter}
      filteredApps={filteredApps}
      syncStatusColor={syncStatusColor}
      syncStatusLabel={syncStatusLabel}
      healthStatusIndicator={healthStatusIndicator}
      onClusterChange={setSelectedCluster}
      onStatusFilterChange={setStatusFilter}
      onSync={handleSync}
      t={t}
    />
  )

  return (
    <>
      <DashboardPage
        title={t('gitops.title')}
        subtitle={t('gitops.subtitle')}
        icon="GitBranch"
        rightExtra={<RotatingTip page="gitops" />}
        storageKey={GITOPS_STORAGE_KEY}
        defaultCards={DEFAULT_GITOPS_CARDS}
        statsType="gitops"
        getStatValue={getDashboardStatValue}
        onRefresh={handleRefresh}
        isLoading={false}
        isRefreshing={dataRefreshing}
        lastUpdated={lastUpdated}
        hasData={stats.total > 0}
        beforeCards={filtersAndAppsList}
        emptyState={{
          title: t('gitops.dashboardTitle'),
          description: t('gitops.dashboardDescription') }}
        isDemoData={true}
      >
        <GitOpsIntegrationInfo t={t} />
      </DashboardPage>

      {syncDialogApp && (
        <SyncDialog
          isOpen={!!syncDialogApp}
          onClose={() => setSyncDialogApp(null)}
          appName={syncDialogApp.name}
          namespace={syncDialogApp.namespace}
          cluster={syncDialogApp.cluster}
          repoUrl={syncDialogApp.repoUrl}
          path={syncDialogApp.path}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </>
  )
}
