import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useClusters, useGPUNodes, useNVIDIAOperators } from '../../hooks/useMCP'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck } from '../cards/console-missions/shared'
import { useLocalAgent, wasAgentEverConnected } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { isLocalAgentSuppressed } from '../../lib/constants'
import { useModalState } from '../../lib/modals'
import type { StatBlockValue } from '../ui/StatsOverview'
import { useClusterFiltering } from './useClusterFiltering'
import { useClusterStats } from './useClusterStats'
import type { ClusterStats, GPUByCluster } from './useClusterStats'
import { useClusterViewState } from './useClusterViewState'
import type { ClusterHealthFilter, ClusterSortField } from './useClusterViewState'
import { useClusterMutations } from './useClusterMutations'
import { getClusterDashboardStatValue } from './clusterStatValues'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { GPUNode, NVIDIAOperatorStatus } from '../../hooks/useMCP'
import type { ClusterLayoutMode } from './components'
import type { ClusterGroup } from '../../hooks/useGlobalFilters'
import type { StartMissionParams } from '../../hooks/useMissions.types'

const MIN_CLUSTER_PROGRESS_TOTAL = 1

export interface ClustersViewState {
  // Data layer
  clusters: ClusterInfo[]
  isLoading: boolean
  dataRefreshing: boolean
  lastUpdated: Date | null
  refetch: () => void
  gpuNodes: GPUNode[]
  gpuLoading: boolean
  gpuError: string | null
  gpuRefetch: () => void
  nvidiaOperators: NVIDIAOperatorStatus[]
  // Agent / connection
  isConnected: boolean
  isDegraded: boolean
  showSkeletonContent: boolean
  // Permissions
  permissionsLoading: boolean
  isClusterAdmin: (clusterName: string) => boolean
  // View state
  filter: ClusterHealthFilter
  setFilter: (f: ClusterHealthFilter) => void
  sortBy: ClusterSortField
  setSortBy: (s: ClusterSortField) => void
  sortAsc: boolean
  setSortAsc: (v: boolean) => void
  layoutMode: ClusterLayoutMode
  setLayoutMode: (m: ClusterLayoutMode) => void
  customOrder: string[]
  handleReorder: (order: string[]) => void
  // UI modal state
  selectedCluster: string | null
  setSelectedCluster: (c: string | null) => void
  renamingCluster: string | null
  setRenamingCluster: (c: string | null) => void
  removingCluster: string | null
  setRemovingCluster: (c: string | null) => void
  showClusterGrid: boolean
  setShowClusterGrid: (v: boolean) => void
  showGPUModal: boolean
  openGPUModal: () => void
  closeGPUModal: () => void
  showAddCluster: boolean
  setShowAddCluster: (v: boolean) => void
  // Mutations
  handleRenameContext: (oldName: string, newName: string) => Promise<void>
  handleRemoveCluster: (contextName: string) => Promise<void>
  // Missions
  startMission: (params: StartMissionParams) => string
  openSidebar: () => void
  pruneShowKeyPrompt: boolean
  pruneCheckKeyAndRun: (fn: () => void | Promise<void>) => void
  pruneGoToSettings: () => void
  pruneDismissPrompt: () => void
  createShowKeyPrompt: boolean
  createCheckKeyAndRun: (fn: () => void | Promise<void>) => void
  createGoToSettings: () => void
  createDismissPrompt: () => void
  // Cluster groups (from global filters)
  clusterGroups: ClusterGroup[]
  addClusterGroup: (group: Omit<ClusterGroup, 'id'>) => void
  deleteClusterGroup: (id: string) => void
  selectClusterGroup: (groupId: string) => void
  // Computed
  filteredClusters: ClusterInfo[]
  gpuByCluster: GPUByCluster
  stats: ClusterStats
  // Dashboard stat integration
  getStatValue: (blockId: string) => StatBlockValue
  clusterGroundtruthFields: Record<string, number>
}

/**
 * Consolidates all filter, sort, selection, view, data and mission state for the
 * Clusters page into a single hook call. Extracted from Clusters.tsx (#21886) to
 * reduce the component's hook count from 27 to 2 (useTranslation + this hook).
 */
export function useClustersView(): ClustersViewState {
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { nodes: gpuNodes, isLoading: gpuLoading, error: gpuError, refetch: gpuRefetch } = useGPUNodes()
  const { operators: nvidiaOperators } = useNVIDIAOperators()
  const { isConnected, isDegraded, status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()
  const { startMission, openSidebar } = useMissions()
  const { showKeyPrompt: pruneShowKeyPrompt, checkKeyAndRun: pruneCheckKeyAndRun, goToSettings: pruneGoToSettings, dismissPrompt: pruneDismissPrompt } = useApiKeyCheck()
  const { showKeyPrompt: createShowKeyPrompt, checkKeyAndRun: createCheckKeyAndRun, goToSettings: createGoToSettings, dismissPrompt: createDismissPrompt } = useApiKeyCheck()
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
    isAllDistributionsSelected,
  } = useGlobalFilters()

  const searchParamsTuple = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const { filter, setFilter, sortBy, setSortBy, sortAsc, setSortAsc, customOrder, layoutMode, setLayoutMode, handleReorder } = useClusterViewState(searchParamsTuple)

  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [removingCluster, setRemovingCluster] = useState<string | null>(null)
  const [showClusterGrid, setShowClusterGrid] = useState(true)
  const { isOpen: showGPUModal, open: openGPUModal, close: closeGPUModal } = useModalState()
  const [showAddCluster, setShowAddCluster] = useState(false)

  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const { handleRenameContext, handleRemoveCluster } = useClusterMutations({ isConnected, refetch })

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
    customOrder,
  })

  const gpuByCluster = useMemo(() => {
    const map: GPUByCluster = {}
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

  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode() && !isLocalAgentSuppressed() && !wasAgentEverConnected()
  const showSkeletonContent = (isLoading && (clusters || []).length === 0) || forceSkeletonForOffline || isModeSwitching

  const clusterStatusProgressMax = Math.max(stats.total, MIN_CLUSTER_PROGRESS_TOTAL)
  const getStatValue = (blockId: string): StatBlockValue =>
    getClusterDashboardStatValue(
      blockId,
      stats,
      stats.hasResourceData || stats.total > 0,
      clusterStatusProgressMax,
      { navigate, setFilter, setShowClusterGrid, openGPUModal },
    )

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

  return {
    clusters,
    isLoading,
    dataRefreshing,
    lastUpdated,
    refetch,
    gpuNodes: gpuNodes || [],
    gpuLoading,
    gpuError,
    gpuRefetch,
    nvidiaOperators,
    isConnected,
    isDegraded,
    showSkeletonContent,
    permissionsLoading,
    isClusterAdmin,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortAsc,
    setSortAsc,
    layoutMode,
    setLayoutMode,
    customOrder,
    handleReorder,
    selectedCluster,
    setSelectedCluster,
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
    startMission,
    openSidebar,
    pruneShowKeyPrompt,
    pruneCheckKeyAndRun,
    pruneGoToSettings,
    pruneDismissPrompt,
    createShowKeyPrompt,
    createCheckKeyAndRun,
    createGoToSettings,
    createDismissPrompt,
    clusterGroups,
    addClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
    filteredClusters,
    gpuByCluster,
    stats,
    getStatValue,
    clusterGroundtruthFields,
  }
}
