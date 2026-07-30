import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterDetailModal } from './ClusterDetailModal'
import { AddClusterDialog } from './AddClusterDialog'
import { RenameModal, RemoveClusterDialog, GPUDetailModal } from './components'
import { ApiKeyPromptModal } from '../cards/console-missions/shared'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { StatusBadge } from '../ui/StatusBadge'
import { useClustersView } from './useClustersView'
import { ClustersBeforeCards } from './Clusters.parts'

const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'
const DEFAULT_CLUSTERS_CARDS = getDefaultCards('clusters')

export function Clusters() {
  const { t } = useTranslation()
  const view = useClustersView()

  const headerBadge = (() => {
    if (view.stats.unreachable > 0) {
      return (
        <StatusBadge color="red" size="xs" variant="outline" icon={<AlertCircle className="w-3 h-3" />}>
          {`${view.stats.unreachable} offline cluster${view.stats.unreachable === 1 ? '' : 's'}`}
        </StatusBadge>
      )
    }
    if (view.stats.unhealthy > 0) {
      return (
        <StatusBadge color="yellow" size="xs" variant="outline" icon={<AlertTriangle className="w-3 h-3" />}>
          {`${view.stats.unhealthy} degraded cluster${view.stats.unhealthy === 1 ? '' : 's'}`}
        </StatusBadge>
      )
    }
    return (
      <StatusBadge color="green" size="xs" variant="outline" icon={<CheckCircle className="w-3 h-3" />}>
        All clusters healthy
      </StatusBadge>
    )
  })()

  return (
    <DashboardPage
      testId="clusters-page"
      title={t('navigation.clusters')}
      subtitle={t('cluster.subtitle')}
      icon="Server"
      afterTitle={headerBadge}
      storageKey={CLUSTERS_CARDS_KEY}
      defaultCards={DEFAULT_CLUSTERS_CARDS}
      statsType="clusters"
      getStatValue={view.getStatValue}
      onRefresh={view.refetch}
      isLoading={view.isLoading}
      isRefreshing={view.dataRefreshing}
      lastUpdated={view.lastUpdated}
      hasData={view.stats.hasResourceData || view.stats.total > 0}
      beforeCards={
        <ClustersBeforeCards
          clusters={view.clusters}
          filteredClusters={view.filteredClusters}
          stats={view.stats}
          clusterGroundtruthFields={view.clusterGroundtruthFields}
          showClusterGrid={view.showClusterGrid}
          setShowClusterGrid={view.setShowClusterGrid}
          showSkeletonContent={view.showSkeletonContent}
          filter={view.filter}
          setFilter={view.setFilter}
          sortBy={view.sortBy}
          setSortBy={view.setSortBy}
          sortAsc={view.sortAsc}
          setSortAsc={view.setSortAsc}
          layoutMode={view.layoutMode}
          setLayoutMode={view.setLayoutMode}
          gpuByCluster={view.gpuByCluster}
          isConnected={view.isConnected}
          isDegraded={view.isDegraded}
          isLoading={view.isLoading}
          permissionsLoading={view.permissionsLoading}
          isClusterAdmin={view.isClusterAdmin}
          clusterGroups={view.clusterGroups}
          addClusterGroup={view.addClusterGroup}
          deleteClusterGroup={view.deleteClusterGroup}
          selectClusterGroup={view.selectClusterGroup}
          setSelectedCluster={view.setSelectedCluster}
          setRenamingCluster={view.setRenamingCluster}
          setRemovingCluster={view.setRemovingCluster}
          handleReorder={view.handleReorder}
          setShowAddCluster={view.setShowAddCluster}
          pruneCheckKeyAndRun={view.pruneCheckKeyAndRun}
          createCheckKeyAndRun={view.createCheckKeyAndRun}
          startMission={view.startMission}
          openSidebar={view.openSidebar}
          t={t}
        />
      }
      rightExtra={<RotatingTip page="clusters" />}
      emptyState={{
        title: 'Cluster Dashboard',
        description: 'Add cards to monitor cluster health, resource usage, and workload status.',
      }}
    >
      {/* Cluster Detail Modal */}
      {view.selectedCluster && (
        <ClusterDetailModal
          clusterName={view.selectedCluster}
          clusterUser={view.clusters.find(c => c.name === view.selectedCluster)?.user}
          onClose={() => view.setSelectedCluster(null)}
          onRename={(name) => {
            view.setSelectedCluster(null)
            view.setRenamingCluster(name)
          }}
          onRemove={view.isConnected ? (name) => {
            view.setSelectedCluster(null)
            view.setRemovingCluster(name)
          } : undefined}
        />
      )}

      {/* Rename Modal */}
      {view.renamingCluster && (
        <RenameModal
          clusterName={view.renamingCluster}
          currentDisplayName={view.clusters.find(c => c.name === view.renamingCluster)?.context || view.renamingCluster}
          onClose={() => view.setRenamingCluster(null)}
          onRename={view.handleRenameContext}
        />
      )}

      {/* Remove Offline Cluster Modal (#5901) */}
      {view.removingCluster && (() => {
        const target = view.clusters.find(c => c.name === view.removingCluster)
        const ctxName = target?.context || view.removingCluster
        const displayName = target?.context || target?.name || view.removingCluster
        return (
          <RemoveClusterDialog
            contextName={ctxName}
            displayName={displayName}
            onClose={() => view.setRemovingCluster(null)}
            onConfirm={view.handleRemoveCluster}
          />
        )
      })()}

      {/* GPU Detail Modal */}
      {view.showGPUModal && (
        <GPUDetailModal
          gpuNodes={view.gpuNodes}
          isLoading={view.gpuLoading}
          error={view.gpuError}
          onRefresh={view.gpuRefetch}
          onClose={view.closeGPUModal}
          operatorStatus={view.nvidiaOperators}
        />
      )}

      {/* API Key Prompt for Prune action */}
      <ApiKeyPromptModal isOpen={view.pruneShowKeyPrompt} onDismiss={view.pruneDismissPrompt} onGoToSettings={view.pruneGoToSettings} />

      {/* API Key Prompt for Create Cluster with AI action (#6454) */}
      <ApiKeyPromptModal isOpen={view.createShowKeyPrompt} onDismiss={view.createDismissPrompt} onGoToSettings={view.createGoToSettings} />

      {/* Add Cluster Dialog */}
      <AddClusterDialog open={view.showAddCluster} onClose={() => view.setShowAddCluster(false)} />
    </DashboardPage>
  )
}
