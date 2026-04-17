import { useState, useEffect } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, ChevronDown, Server, Scissors } from 'lucide-react'
import { useClusters, useGPUNodes, useNVIDIAOperators, refreshSingleCluster } from '../../hooks/useMCP'
import { agentFetch } from '../../hooks/mcp/shared'
import { ClusterDetailModal } from './ClusterDetailModal'
import { AddClusterDialog } from './AddClusterDialog'
import { EmptyClusterState } from './EmptyClusterState'
import {
  RenameModal,
  RemoveClusterDialog,
  FilterTabs,
  ClusterGrid,
  GPUDetailModal,
  type ClusterLayoutMode } from './components'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../cards/console-missions/shared'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { emitClusterStatsDrillDown } from '../../lib/analytics'
import { ROUTES } from '../../config/routes'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { ClusterCardSkeleton } from '../ui/ClusterCardSkeleton'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_CLUSTER_LAYOUT, STORAGE_KEY_CLUSTER_ORDER, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { useModalState } from '../../lib/modals'
import { useToast } from '../ui/Toast'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { formatMemoryStat } from '../../lib/formatStats'
import { RotatingTip } from '../ui/RotatingTip'
import { useClusterFiltering } from './useClusterFiltering'
import { useClusterStats } from './useClusterStats'
import { ClusterGroupsSection } from './ClusterGroupsSection'

// Storage key for cluster page cards
const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'

// Default cards loaded from centralized config
const DEFAULT_CLUSTERS_CARDS = getDefaultCards('clusters')


export function Clusters() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, error: gpuError, refetch: gpuRefetch } = useGPUNodes()
  const { operators: nvidiaOperators } = useNVIDIAOperators()
  const { isConnected, status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const { startMission, openSidebar } = useMissions()
  const { showKeyPrompt: pruneShowKeyPrompt, checkKeyAndRun: pruneCheckKeyAndRun, goToSettings: pruneGoToSettings, dismissPrompt: pruneDismissPrompt } = useApiKeyCheck()
  const { showKeyPrompt: createShowKeyPrompt, checkKeyAndRun: createCheckKeyAndRun, goToSettings: createGoToSettings, dismissPrompt: createDismissPrompt } = useApiKeyCheck()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { showToast } = useToast()

  // When demo mode is OFF and agent is not connected, force skeleton display
  // Also show skeleton during mode switching for smooth transitions
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode()
  const { isClusterAdmin, loading: permissionsLoading } = usePermissions()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    clusterGroups,
    addClusterGroup,
    deleteClusterGroup,
    selectClusterGroup } = useGlobalFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  // Read filter from URL, default to 'all'
  const urlStatus = searchParams.get('status')
  const validFilter = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
  const [filter, setFilterState] = useState<'all' | 'healthy' | 'unhealthy' | 'unreachable'>(validFilter)

  // Sync filter state with URL changes (e.g., when navigating from sidebar)
  useEffect(() => {
    const newFilter = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
    if (newFilter !== filter) {
      setFilterState(newFilter)
    }
  }, [urlStatus, filter])

  // Update URL when filter changes programmatically
  const setFilter = (newFilter: 'all' | 'healthy' | 'unhealthy' | 'unreachable') => {
    setFilterState(newFilter)
    if (newFilter === 'all') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', newFilter)
    }
    setSearchParams(searchParams, { replace: true })
  }
  const [sortState, setSortState] = useState<{ by: 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'; customOrder: string[] }>(() => {
    try {
      const savedOrder = safeGetItem(STORAGE_KEY_CLUSTER_ORDER)
      return {
        by: savedOrder ? 'custom' : 'name',
        customOrder: savedOrder ? JSON.parse(savedOrder) : [] }
    } catch {
      return { by: 'name', customOrder: [] }
    }
  })
  const [sortAsc, setSortAsc] = useState(true)

  // Notify user if saved cluster sort configuration was corrupt and had to be reset
  useEffect(() => {
    const savedOrder = safeGetItem(STORAGE_KEY_CLUSTER_ORDER)
    if (savedOrder) {
      try {
        JSON.parse(savedOrder)
      } catch {
        showToast('Cluster sort preferences were corrupted and have been reset to defaults.', 'warning')
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Convenience aliases so downstream code stays unchanged
  const sortBy = sortState.by
  const customOrder = sortState.customOrder
  const setSortBy = (by: 'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom') =>
      setSortState(prev => ({ ...prev, by }))
  const [layoutMode, setLayoutMode] = useState<ClusterLayoutMode>(() => {
    const stored = safeGetItem(STORAGE_KEY_CLUSTER_LAYOUT)
    return (stored as ClusterLayoutMode) || 'grid'
  })
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [removingCluster, setRemovingCluster] = useState<string | null>(null)

  // Additional UI state
  const [showClusterGrid, setShowClusterGrid] = useState(true) // Cluster cards visible by default
  const { isOpen: showGPUModal, open: openGPUModal, close: closeGPUModal } = useModalState()
  const [showAddCluster, setShowAddCluster] = useState(false)

  // Trigger refresh when navigating to this page (location.key changes on each navigation)
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error('Local agent not connected')
    // Use agentFetch so the Authorization: Bearer <KC_AGENT_TOKEN> header
    // is injected — plain fetch() is rejected with 401 when the agent has
    // a token configured (#6133).
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/rename-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      // Fall back to HTTP status so users see e.g. "HTTP 401: Unauthorized"
      // instead of a silent generic error when the body has no message.
      const fallback = `HTTP ${response.status}: ${response.statusText || 'Failed to rename context'}`
      throw new Error(data.error || data.message || fallback)
    }
    refetch()
  }

  /**
   * Remove an offline cluster's kubeconfig context (#5901).
   * Backend: `RemoveContext` in pkg/k8s/client.go (added in #5658). The agent
   * exposes it at POST /kubeconfig/remove on the localhost-only HTTP server.
   *
   * Uses agentFetch() to inject the KC_AGENT_TOKEN Authorization header;
   * without this the kc-agent rejects the request with 401 Unauthorized
   * whenever a token is configured, which manifested as a silent "Failed
   * to remove cluster from kubeconfig" in the UI (#6133).
   */
  const handleRemoveCluster = async (contextName: string) => {
    if (!isConnected) throw new Error(t('cluster.removeClusterNoAgent'))
    const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/kubeconfig/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
    if (!response.ok) {
      // #6293: check for the 404-means-stale-agent case BEFORE attempting
      // to parse the body. An old kc-agent returns a plain-text Go
      // default 404 ("404 page not found") which is not JSON — reading
      // it first would be a wasted round-trip. Same reason #6288 added
      // the status-specific branch in the first place.
      if (response.status === 404) {
        throw new Error(t('cluster.removeClusterAgentTooOld'))
      }
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
      // Always surface the HTTP status if the body has no structured error,
      // so the user sees "HTTP 401: Unauthorized" instead of the generic
      // fallback — this was the root cause of #6133 being unactionable.
      const fallback = `HTTP ${response.status}: ${response.statusText || t('cluster.removeClusterError')}`
      throw new Error(data.error || data.message || fallback)
    }
    showToast(t('cluster.removeClusterSuccess', { name: contextName }), 'success')
    refetch()
  }

  const handleReorder = (newOrder: string[]) => {
    setSortState({ by: 'custom', customOrder: newOrder })
    safeSetItem(STORAGE_KEY_CLUSTER_ORDER, JSON.stringify(newOrder))
  }

  const { filteredClusters, globalFilteredClusters } = useClusterFiltering({
    clusters,
    filter,
    globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    sortBy,
    sortAsc,
    customOrder })

  // Get GPU count per cluster
  const gpuByCluster = (() => {
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
  })()

  const stats = useClusterStats({ globalFilteredClusters, gpuByCluster })

  // Determine if we should show skeleton content (loading with no data OR offline without demo OR mode switching)
  const showSkeletonContent = (isLoading && (clusters || []).length === 0) || forceSkeletonForOffline || isModeSwitching

  // Stats value getter for DashboardPage's configurable StatsOverview
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    const hasData = stats.hasResourceData || stats.total > 0
    switch (blockId) {
      case 'clusters':
        return {
          value: stats.total,
          sublabel: 'total clusters',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('all'); setShowClusterGrid(true) },
          isClickable: stats.total > 0 }
      case 'healthy':
        return {
          value: stats.healthy,
          sublabel: 'healthy',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('healthy'); setShowClusterGrid(true) },
          isClickable: stats.healthy > 0 }
      case 'unhealthy':
        return {
          value: stats.unhealthy,
          sublabel: 'unhealthy',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unhealthy'); setShowClusterGrid(true) },
          isClickable: stats.unhealthy > 0 }
      case 'unreachable':
        return {
          value: stats.unreachable,
          sublabel: 'offline',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unreachable'); setShowClusterGrid(true) },
          isClickable: stats.unreachable > 0 }
      case 'nodes':
        return {
          value: hasData ? stats.totalNodes : '-',
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
          sublabel: 'running pods',
          onClick: () => { emitClusterStatsDrillDown('pods'); navigate(ROUTES.WORKLOADS) },
          isClickable: hasData }
      default:
        return { value: '-', sublabel: '' }
    }
  }

  const getStatValue = (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId)

  // ── beforeCards: Stale banner + Cluster Info Cards + Cluster Groups ──

  const beforeCardsContent = (
    <>
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
                      initialPrompt: prompt })
                    openSidebar()
                  })
                }}
              />
              {filteredClusters.length === 0 && !isLoading && !showSkeletonContent ? (
                <EmptyClusterState onAddCluster={() => setShowAddCluster(true)} />
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
      title={t('navigation.clusters')}
      subtitle={t('cluster.subtitle')}
      icon="Server"
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
