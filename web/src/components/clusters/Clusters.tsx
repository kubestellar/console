import { useMemo } from 'react'
import { useClusters, useGPUNodes, useNVIDIAOperators } from '../../hooks/useMCP'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck } from '../cards/console-missions/shared'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useTranslation } from 'react-i18next'
import { isLocalAgentSuppressed } from '../../lib/constants'
import { RotatingTip } from '../ui/RotatingTip'
import { useClusterFiltering } from './useClusterFiltering'
import { useClusterStats } from './useClusterStats'
import { useClusterPageState } from './useClusterPageState'
import { useClusterDashboardStats } from './useClusterDashboardStats'
import { ClusterInfoSection } from './ClusterInfoSection'
import { ClusterModals } from './ClusterModals'

// Storage key for cluster page cards
const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'
const AI_CLUSTER_CREATION_CONTEXT = {
  allowMissingLocalTools: true,
  skipClusterPreflight: true,
  missionFlow: 'cluster-creation',
}

// Default cards loaded from centralized config
const DEFAULT_CLUSTERS_CARDS = getDefaultCards('clusters')


export function Clusters() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, error: gpuError, refetch: gpuRefetch } = useGPUNodes()
  const { operators: nvidiaOperators } = useNVIDIAOperators()
  const { isConnected, isDegraded, status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const { startMission, openSidebar } = useMissions()
  const { showKeyPrompt: pruneShowKeyPrompt, checkKeyAndRun: pruneCheckKeyAndRun, goToSettings: pruneGoToSettings, dismissPrompt: pruneDismissPrompt } = useApiKeyCheck()
  const { showKeyPrompt: createShowKeyPrompt, checkKeyAndRun: createCheckKeyAndRun, goToSettings: createGoToSettings, dismissPrompt: createDismissPrompt } = useApiKeyCheck()

  // When demo mode is OFF and agent is not connected, force skeleton display
  // Also show skeleton during mode switching for smooth transitions
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode() && !isLocalAgentSuppressed() && !wasAgentEverConnected()
  const { isClusterAdmin, loading: permissionsLoading } = usePermissions()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    clusterGroups,
    addClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
    selectedDistributions,
    isAllDistributionsSelected } = useGlobalFilters()

  const {
    selectedCluster,
    setSelectedCluster,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortAsc,
    setSortAsc,
    customOrder,
    layoutMode,
    setLayoutMode,
    renamingCluster,
    setRenamingCluster,
    removingCluster,
    setRemovingCluster,
    showClusterGrid,
    setShowClusterGrid,
    showGPUModal,
    openGPUModal,
    closeGPUModal,
    showAddCluster,
    setShowAddCluster,
    handleRenameContext,
    handleRemoveCluster,
    handleReorder,
  } = useClusterPageState({ isConnected, refetch })

  const { filteredClusters, globalFilteredClusters } = useClusterFiltering({
    clusters,
    filter,
    globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
    sortBy,
    sortAsc,
    customOrder })

  // Get GPU count per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, { total: number; allocated: number }> = {}
    ;(gpuNodes || []).forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      if (!map[clusterKey]) {
        map[clusterKey] = { total: 0, allocated: 0 }
      }
      map[clusterKey].total += node.gpuCount || 0
      map[clusterKey].allocated += node.gpuAllocated || 0
    })
    return map
  }, [gpuNodes])

  const stats = useClusterStats({ globalFilteredClusters, gpuByCluster })

  // Determine if we should show skeleton content (loading with no data OR offline without demo OR mode switching)
  const showSkeletonContent = (isLoading && (clusters || []).length === 0) || forceSkeletonForOffline || isModeSwitching

  const { headerBadge, getStatValue, clusterGroundtruthFields } = useClusterDashboardStats({
    stats,
    setFilter,
    setShowClusterGrid,
    openGPUModal })

  const handlePruneStaleContexts = () => {
    pruneCheckKeyAndRun(async () => {
      const prompt = await loadMissionPrompt(
        'kubeconfig-prune',
        'Back up my kubeconfig to a timestamped file, test each context for reachability, show me which are stale, ask for confirmation, then remove the stale ones. Tell me the backup file path.',
      )
      startMission({
        title: 'Prune Stale Kubeconfig Contexts',
        description: 'Safely clean up kubeconfig by removing entries for clusters that no longer exist',
        type: 'repair',
        initialPrompt: prompt })
    })
  }

  const handleCreateClusterWithAI = () => {
    createCheckKeyAndRun(async () => {
      const prompt = await loadMissionPrompt(
        'create-cluster',
        'Help me create a new Kubernetes cluster. Ask me about the provider (kind, k3d, EKS, GKE, AKS, OpenShift), cluster name, node count, and Kubernetes version. Then generate and execute the appropriate commands to create the cluster and add it to my kubeconfig.',
      )
      startMission({
        title: t('cluster.createClusterWithAI'),
        description: 'AI-guided cluster creation across any provider',
        type: 'deploy',
        initialPrompt: prompt,
        context: AI_CLUSTER_CREATION_CONTEXT,
      })
      openSidebar()
    })
  }

  const beforeCardsContent = (
    <ClusterInfoSection
      clusters={clusters}
      filteredClusters={filteredClusters}
      stats={stats}
      clusterGroundtruthFields={clusterGroundtruthFields}
      isLoading={isLoading}
      showSkeletonContent={showSkeletonContent}
      showClusterGrid={showClusterGrid}
      onToggleClusterGrid={() => setShowClusterGrid(!showClusterGrid)}
      filter={filter}
      onFilterChange={setFilter}
      sortBy={sortBy}
      onSortByChange={setSortBy}
      sortAsc={sortAsc}
      onSortAscChange={setSortAsc}
      layoutMode={layoutMode}
      onLayoutModeChange={setLayoutMode}
      gpuByCluster={gpuByCluster}
      isConnected={isConnected}
      isDegraded={isDegraded}
      inClusterMode={isInClusterMode()}
      permissionsLoading={permissionsLoading}
      isClusterAdmin={isClusterAdmin}
      onAddCluster={() => setShowAddCluster(true)}
      onCreateClusterWithAI={handleCreateClusterWithAI}
      onPruneStaleContexts={handlePruneStaleContexts}
      onSelectCluster={setSelectedCluster}
      onRenameCluster={setRenamingCluster}
      onRemoveCluster={setRemovingCluster}
      onReorder={handleReorder}
      clusterGroups={clusterGroups}
      addClusterGroup={addClusterGroup}
      deleteClusterGroup={deleteClusterGroup}
      selectClusterGroup={selectClusterGroup}
    />
  )

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
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={stats.hasResourceData || stats.total > 0}
      beforeCards={beforeCardsContent}
      rightExtra={<RotatingTip page="clusters" />}
      emptyState={{
        title: 'Cluster Dashboard',
        description: 'Add cards to monitor cluster health, resource usage, and workload status.' }}
    >
      <ClusterModals
        clusters={clusters}
        selectedCluster={selectedCluster}
        onCloseClusterDetail={() => setSelectedCluster(null)}
        onOpenRenameFromDetail={(name) => {
          setSelectedCluster(null)
          setRenamingCluster(name)
        }}
        onOpenRemoveFromDetail={(name) => {
          // Close the detail modal first, then open the remove confirm (#5901).
          setSelectedCluster(null)
          setRemovingCluster(name)
        }}
        isConnected={isConnected}
        renamingCluster={renamingCluster}
        onCloseRename={() => setRenamingCluster(null)}
        onRename={handleRenameContext}
        removingCluster={removingCluster}
        onCloseRemove={() => setRemovingCluster(null)}
        onConfirmRemove={handleRemoveCluster}
        showGPUModal={showGPUModal}
        gpuNodes={gpuNodes}
        gpuLoading={gpuLoading}
        gpuError={gpuError}
        gpuRefetch={gpuRefetch}
        onCloseGPUModal={closeGPUModal}
        nvidiaOperators={nvidiaOperators}
        pruneShowKeyPrompt={pruneShowKeyPrompt}
        pruneDismissPrompt={pruneDismissPrompt}
        pruneGoToSettings={pruneGoToSettings}
        createShowKeyPrompt={createShowKeyPrompt}
        createDismissPrompt={createDismissPrompt}
        createGoToSettings={createGoToSettings}
        showAddCluster={showAddCluster}
        onCloseAddCluster={() => setShowAddCluster(false)}
      />
    </DashboardPage>
  )
}
