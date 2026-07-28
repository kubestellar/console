import { useMemo } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, ChevronRight, ChevronDown, Server, Scissors } from 'lucide-react'
import { useClusters, useGPUNodes, useNVIDIAOperators, refreshSingleCluster } from '../../hooks/useMCP'
import { ClusterDetailModal } from './ClusterDetailModal'
import { AddClusterDialog } from './AddClusterDialog'
import { EmptyClusterState } from './EmptyClusterState'
import {
  RenameModal,
  RemoveClusterDialog,
  FilterTabs,
  ClusterGrid,
  GPUDetailModal,
} from './components'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../cards/console-missions/shared'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { emitClusterStatsDrillDown } from '../../lib/analytics'
import { ROUTES } from '../../config/routes'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { ClusterCardSkeleton } from '../ui/ClusterCardSkeleton'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useTranslation } from 'react-i18next'
import { STORAGE_KEY_CLUSTER_LAYOUT, isLocalAgentSuppressed } from '../../lib/constants'
import { safeSetItem } from '../../lib/utils/localStorage'
import { useToast } from '../ui/Toast'
import type { StatBlockValue } from '../ui/StatsOverview'
import { formatMemoryStat } from '../../lib/formatStats'
import { RotatingTip } from '../ui/RotatingTip'
import { StatusBadge } from '../ui/StatusBadge'
import { useClusterFiltering } from './useClusterFiltering'
import { useClusterStats } from './useClusterStats'
import { ClusterGroupsSection } from './ClusterGroupsSection'
import { useClusterPageState } from './useClusterPageState'

// Storage key for cluster page cards
const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'
const MIN_CLUSTER_PROGRESS_TOTAL = 1
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
  const { showToast } = useToast()
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
    navigate,
    selectedCluster, setSelectedCluster,
    filter, setFilter,
    sortBy, sortAsc, setSortAsc, customOrder, setSortBy,
    layoutMode, setLayoutMode,
    renamingCluster, setRenamingCluster,
    removingCluster, setRemovingCluster,
    showClusterGrid, setShowClusterGrid,
    showGPUModal, openGPUModal, closeGPUModal,
    showAddCluster, setShowAddCluster,
    handleRenameContext, handleRemoveCluster, handleReorder,
  } = useClusterPageState({ refetch, showToast, t, isConnected })

  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode() && !isLocalAgentSuppressed() && !wasAgentEverConnected()

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
  const headerBadge = (() => {
    if (stats.unreachable > 0) {
      return (
        <StatusBadge color="red" size="xs" variant="outline" icon={<AlertCircle className="w-3 h-3" />}>
          {`${stats.unreachable} offline cluster${stats.unreachable === 1 ? '' : 's'}`}
        </StatusBadge>
      )
    }

    if (stats.unhealthy > 0) {
      return (
        <StatusBadge color="yellow" size="xs" variant="outline" icon={<AlertTriangle className="w-3 h-3" />}>
          {`${stats.unhealthy} degraded cluster${stats.unhealthy === 1 ? '' : 's'}`}
        </StatusBadge>
      )
    }

    return (
      <StatusBadge color="green" size="xs" variant="outline" icon={<CheckCircle className="w-3 h-3" />}>
        All clusters healthy
      </StatusBadge>
    )
  })()

  // Determine if we should show skeleton content (loading with no data OR offline without demo OR mode switching)
  const showSkeletonContent = (isLoading && (clusters || []).length === 0) || forceSkeletonForOffline || isModeSwitching

  // Stats value getter for DashboardPage's configurable StatsOverview
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    const hasData = stats.hasResourceData || stats.total > 0
    switch (blockId) {
      case 'clusters':
        return {
          value: stats.total,
          groundtruthField: 'clusters-total',
          sublabel: 'total clusters',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('all'); setShowClusterGrid(true) },
          isClickable: stats.total > 0 }
      case 'healthy':
        return {
          value: stats.healthy,
          groundtruthField: 'clusters-healthy',
          sublabel: 'healthy',
          max: clusterStatusProgressMax,
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('healthy'); setShowClusterGrid(true) },
          isClickable: stats.healthy > 0 }
      case 'unhealthy':
        return {
          value: stats.unhealthy,
          sublabel: 'unhealthy',
          max: clusterStatusProgressMax,
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unhealthy'); setShowClusterGrid(true) },
          isClickable: stats.unhealthy > 0 }
      case 'unreachable':
        return {
          value: stats.unreachable,
          sublabel: 'offline',
          max: clusterStatusProgressMax,
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unreachable'); setShowClusterGrid(true) },
          isClickable: stats.unreachable > 0 }
      case 'nodes':
        return {
          value: hasData ? stats.totalNodes : '-',
          groundtruthFields: {
            'nodes-total': hasData ? stats.totalNodes : '-',
            'nodes-ready': stats.healthyNodes,
          },
          progressValue: stats.healthyNodes,
          max: stats.totalNodes,
          sublabel: 'total nodes',
          onClick: () => { emitClusterStatsDrillDown('nodes'); navigate(ROUTES.COMPUTE) },
          isClickable: hasData }
      case 'cpus':
        return {
          value: hasData ? stats.totalCPUs : '-',
          sublabel: 'cores allocatable',
          onClick: () => { emitClusterStatsDrillDown('cpu'); navigate(ROUTES.COMPUTE) },
          isClickable: hasData }
      case 'memory':
        return {
          value: hasData ? formatMemoryStat(stats.totalMemoryGB) : '-',
          sublabel: 'allocatable',
          onClick: () => { emitClusterStatsDrillDown('memory'); navigate(ROUTES.COMPUTE) },
          isClickable: hasData }
      case 'storage':
        return {
          value: hasData ? formatMemoryStat(stats.totalStorageGB) : '-',
          sublabel: 'storage',
          onClick: () => { emitClusterStatsDrillDown('storage'); navigate(ROUTES.STORAGE) },
          isClickable: hasData }
      case 'gpus':
        return {
          value: hasData ? stats.totalGPUs : '-',
          sublabel: 'total GPUs',
          onClick: () => { emitClusterStatsDrillDown('gpu'); openGPUModal() },
          isClickable: hasData && stats.totalGPUs > 0 }
      case 'pods':
        return {
          value: hasData ? stats.totalPods : '-',
          groundtruthFields: {
            'pods-total': hasData ? stats.totalPods : '-',
            'pods-running': hasData ? stats.totalPods : '-',
            'pods-pending': 0,
            'pods-crashloop': 0,
          },
          sublabel: 'running pods',
          onClick: () => { emitClusterStatsDrillDown('pods'); navigate(ROUTES.WORKLOADS) },
          isClickable: hasData }
      default:
        return { value: '-', sublabel: '' }
    }
  }

  const getStatValue = getDashboardStatValue
  const clusterStatusProgressMax = Math.max(stats.total, MIN_CLUSTER_PROGRESS_TOTAL)
  const clusterGroundtruthFields: Record<string, number> = {
    'clusters-total': stats.total,
    'clusters-healthy': stats.healthy,
    'clusters-unhealthy': stats.unhealthy,
    'clusters-unreachable': stats.unreachable,
    'nodes-total': stats.totalNodes,
    'nodes-ready': stats.healthyNodes,
    'pods-total': stats.totalPods,
    'pods-running': stats.totalPods,
    'pods-pending': 0,
    'pods-crashloop': 0,
  }

  // ── beforeCards: Stale banner + Cluster Info Cards + Cluster Groups ──

  const beforeCardsContent = (
    <>
      {Object.entries(clusterGroundtruthFields).map(([field, value]) => (
        <span key={field} className="sr-only" data-groundtruth-field={field}>
          {value}
        </span>
      ))}

      {/* Stale Kubeconfig Contexts Banner */}
      {stats.staleContexts > 0 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border bg-yellow-500/10 border-yellow-500/20 text-yellow-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1">
            {stats.staleContexts} kubeconfig context{stats.staleContexts > 1 ? 's' : ''} never connected — these may be deleted clusters.
          </span>
          <button
            onClick={() => {
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
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-300 text-xs font-medium hover:bg-yellow-500/30 transition-colors whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5" />
            Prune Kubeconfig
          </button>
        </div>
      )}

      {/* Cluster Info Cards - collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowClusterGrid(!showClusterGrid)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <Server className="w-4 h-4" />
          <span>Cluster Info Cards {showSkeletonContent ? '' : `(${filteredClusters.length})`}</span>
          {showClusterGrid ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showClusterGrid && (
          showSkeletonContent ? (
            /* Show skeleton cluster cards when offline/loading */
            <>
              <div className="flex gap-2 mb-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 w-24 bg-secondary/60 rounded-lg animate-pulse" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <ClusterCardSkeleton key={i} />
                ))}
              </div>
            </>
          ) : (
            <>
              <FilterTabs
                stats={stats}
                filter={filter}
                onFilterChange={setFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                sortAsc={sortAsc}
                onSortAscChange={setSortAsc}
                layoutMode={layoutMode}
                onLayoutModeChange={(mode) => {
                  setLayoutMode(mode)
                  safeSetItem(STORAGE_KEY_CLUSTER_LAYOUT, mode)
                }}
                onAddCluster={() => setShowAddCluster(true)}
                onCreateClusterWithAI={() => {
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
                }}
              />
              {filteredClusters.length === 0 && !isLoading && !showSkeletonContent ? (
                <EmptyClusterState
                  onAddCluster={() => setShowAddCluster(true)}
                  agentConnected={isConnected}
                  agentDegraded={isDegraded}
                  inClusterMode={isInClusterMode()}
                />
              ) : (
                <ClusterGrid
                  clusters={filteredClusters}
                  layoutMode={layoutMode}
                  gpuByCluster={gpuByCluster}
                  isConnected={isConnected}
                  permissionsLoading={permissionsLoading}
                  isClusterAdmin={isClusterAdmin}
                  onSelectCluster={setSelectedCluster}
                  onRenameCluster={setRenamingCluster}
                  onRefreshCluster={refreshSingleCluster}
                  onRemoveCluster={setRemovingCluster}
                  onReorder={handleReorder}
                />
              )}
            </>
          )
        )}
      </div>

      {/* Cluster Groups */}
      <ClusterGroupsSection
        clusters={clusters}
        clusterGroups={clusterGroups}
        addClusterGroup={addClusterGroup}
        deleteClusterGroup={deleteClusterGroup}
        selectClusterGroup={selectClusterGroup}
      />
    </>
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
      {/* Cluster Detail Modal */}
      {selectedCluster && (
        <ClusterDetailModal
          clusterName={selectedCluster}
          clusterUser={clusters.find(c => c.name === selectedCluster)?.user}
          onClose={() => setSelectedCluster(null)}
          onRename={(name) => {
            setSelectedCluster(null)
            setRenamingCluster(name)
          }}
          onRemove={isConnected ? (name) => {
            // Close the detail modal first, then open the remove confirm (#5901).
            setSelectedCluster(null)
            setRemovingCluster(name)
          } : undefined}
        />
      )}

      {/* Rename Modal */}
      {renamingCluster && (
        <RenameModal
          clusterName={renamingCluster}
          currentDisplayName={clusters.find(c => c.name === renamingCluster)?.context || renamingCluster}
          onClose={() => setRenamingCluster(null)}
          onRename={handleRenameContext}
        />
      )}

      {/* Remove Offline Cluster Modal (#5901) */}
      {removingCluster && (() => {
        const target = clusters.find(c => c.name === removingCluster)
        // Prefer the kubeconfig context string (what the backend expects); fall back to name
        const ctxName = target?.context || removingCluster
        const displayName = target?.context || target?.name || removingCluster
        return (
          <RemoveClusterDialog
            contextName={ctxName}
            displayName={displayName}
            onClose={() => setRemovingCluster(null)}
            onConfirm={handleRemoveCluster}
          />
        )
      })()}

      {/* GPU Detail Modal */}
      {showGPUModal && (
        <GPUDetailModal
          gpuNodes={gpuNodes}
          isLoading={gpuLoading}
          error={gpuError}
          onRefresh={gpuRefetch}
          onClose={closeGPUModal}
          operatorStatus={nvidiaOperators}
        />
      )}

      {/* API Key Prompt for Prune action */}
      <ApiKeyPromptModal isOpen={pruneShowKeyPrompt} onDismiss={pruneDismissPrompt} onGoToSettings={pruneGoToSettings} />

      {/* API Key Prompt for Create Cluster with AI action (#6454) */}
      <ApiKeyPromptModal isOpen={createShowKeyPrompt} onDismiss={createDismissPrompt} onGoToSettings={createGoToSettings} />

      {/* Add Cluster Dialog */}
      <AddClusterDialog open={showAddCluster} onClose={() => setShowAddCluster(false)} />
    </DashboardPage>
  )
}
