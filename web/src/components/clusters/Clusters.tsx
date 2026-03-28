import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Check, WifiOff, ChevronRight, CheckCircle, AlertTriangle, ChevronDown, FolderOpen, Plus, Trash2, Server, Scissors } from 'lucide-react'
import { useClusters, useGPUNodes, useNVIDIAOperators, refreshSingleCluster } from '../../hooks/useMCP'
import { ClusterDetailModal } from './ClusterDetailModal'
import { AddClusterDialog } from './AddClusterDialog'
import { EmptyClusterState } from './EmptyClusterState'
import {
  RenameModal,
  FilterTabs,
  ClusterGrid,
  GPUDetailModal,
  type ClusterLayoutMode,
} from './components'
import { isClusterUnreachable, isClusterHealthy } from './utils'
import { detectCloudProvider, getProviderLabel } from '../ui/CloudProviderIcon'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../cards/console-missions/shared'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { emitClusterStatsDrillDown } from '../../lib/analytics'
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
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { formatMemoryStat } from '../../lib/formatStats'
import { RotatingTip } from '../ui/RotatingTip'

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
  const { startMission } = useMissions()
  const { showKeyPrompt: pruneShowKeyPrompt, checkKeyAndRun: pruneCheckKeyAndRun, goToSettings: pruneGoToSettings, dismissPrompt: pruneDismissPrompt } = useApiKeyCheck()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

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
    selectClusterGroup,
  } = useGlobalFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
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
  const setFilter = useCallback((newFilter: 'all' | 'healthy' | 'unhealthy' | 'unreachable') => {
    setFilterState(newFilter)
    if (newFilter === 'all') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', newFilter)
    }
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams])
  const [sortBy, setSortBy] = useState<'name' | 'nodes' | 'pods' | 'health' | 'provider' | 'custom'>(() => {
    // Default to custom if user has a saved order
    const savedOrder = safeGetItem(STORAGE_KEY_CLUSTER_ORDER)
    return savedOrder ? 'custom' : 'name'
  })
  const [sortAsc, setSortAsc] = useState(true)
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const saved = safeGetItem(STORAGE_KEY_CLUSTER_ORDER)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [layoutMode, setLayoutMode] = useState<ClusterLayoutMode>(() => {
    const stored = safeGetItem(STORAGE_KEY_CLUSTER_LAYOUT)
    return (stored as ClusterLayoutMode) || 'grid'
  })
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  const [showGroups, setShowGroups] = useState(false) // Collapsed by default so cluster cards are visible first

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
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/rename-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { message?: string }
      throw new Error(data.message || 'Failed to rename context')
    }
    refetch()
  }

  const handleReorder = useCallback((newOrder: string[]) => {
    setCustomOrder(newOrder)
    setSortBy('custom')
    safeSetItem(STORAGE_KEY_CLUSTER_ORDER, JSON.stringify(newOrder))
  }, [])

  const filteredClusters = useMemo(() => {
    let result = clusters || []

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query) ||
        c.user?.toLowerCase().includes(query)
      )
    }

    // Apply local health filter
    if (filter === 'healthy') {
      result = result.filter(c => !isClusterUnreachable(c) && isClusterHealthy(c))
    } else if (filter === 'unhealthy') {
      result = result.filter(c => !isClusterUnreachable(c) && !isClusterHealthy(c))
    } else if (filter === 'unreachable') {
      result = result.filter(c => isClusterUnreachable(c))
    }

    // Sort
    if (sortBy === 'custom' && customOrder.length > 0) {
      // Use custom order: items in customOrder come first in that order,
      // items not in customOrder are appended alphabetically
      const orderMap = new Map(customOrder.map((name, i) => [name, i]))
      result = [...result].sort((a, b) => {
        const aIdx = orderMap.get(a.name)
        const bIdx = orderMap.get(b.name)
        if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx
        if (aIdx !== undefined) return -1
        if (bIdx !== undefined) return 1
        return a.name.localeCompare(b.name)
      })
    } else {
      result = [...result].sort((a, b) => {
        let cmp = 0
        switch (sortBy) {
          case 'name':
            cmp = a.name.localeCompare(b.name)
            break
          case 'nodes':
            cmp = (a.nodeCount || 0) - (b.nodeCount || 0)
            break
          case 'pods':
            cmp = (a.podCount || 0) - (b.podCount || 0)
            break
          case 'health': {
            const aHealth = isClusterUnreachable(a) ? 0 : isClusterHealthy(a) ? 2 : 1
            const bHealth = isClusterUnreachable(b) ? 0 : isClusterHealthy(b) ? 2 : 1
            cmp = aHealth - bHealth
            break
          }
          case 'provider': {
            const aProvider = getProviderLabel((a.distribution as ReturnType<typeof detectCloudProvider>) || detectCloudProvider(a.name, a.server, a.namespaces, a.user))
            const bProvider = getProviderLabel((b.distribution as ReturnType<typeof detectCloudProvider>) || detectCloudProvider(b.name, b.server, b.namespaces, b.user))
            cmp = aProvider.localeCompare(bProvider)
            break
          }
        }
        return sortAsc ? cmp : -cmp
      })
    }

    return result
  }, [clusters, filter, globalSelectedClusters, isAllClustersSelected, customFilter, sortBy, sortAsc, customOrder])

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

  // Base clusters after global filter (before local health filter)
  const globalFilteredClusters = useMemo(() => {
    let result = clusters || []

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query) ||
        c.user?.toLowerCase().includes(query)
      )
    }

    return result
  }, [clusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  const stats = useMemo(() => {
    // Calculate total GPUs from GPU nodes that match filtered clusters
    // Only include GPUs from reachable clusters
    let totalGPUs = 0
    let allocatedGPUs = 0
    globalFilteredClusters.forEach(cluster => {
      // Skip offline clusters - don't count their GPUs
      if (isClusterUnreachable(cluster)) return

      const clusterKey = cluster.name.split('/')[0]
      const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
      if (gpuInfo) {
        totalGPUs += gpuInfo.total
        allocatedGPUs += gpuInfo.allocated
      }
    })

    // Separate unreachable, healthy, unhealthy - simplified logic matching sidebar
    const unreachable = globalFilteredClusters.filter(c => isClusterUnreachable(c)).length
    const staleContexts = globalFilteredClusters.filter(c => (c as unknown as Record<string, unknown>).neverConnected === true).length
    const healthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && isClusterHealthy(c)).length
    const unhealthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && !isClusterHealthy(c)).length
    const loadingCount = globalFilteredClusters.filter(c =>
      c.nodeCount === undefined && c.reachable === undefined
    ).length

    const hasResourceData = globalFilteredClusters.some(c =>
      !isClusterUnreachable(c) && c.nodeCount !== undefined && c.nodeCount > 0
    )

    return {
      total: globalFilteredClusters.length,
      loading: loadingCount,
      healthy,
      unhealthy,
      unreachable,
      staleContexts,
      totalNodes: globalFilteredClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
      totalCPUs: globalFilteredClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
      totalMemoryGB: globalFilteredClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
      totalStorageGB: globalFilteredClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0),
      totalPods: globalFilteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
      totalGPUs,
      allocatedGPUs,
      hasResourceData,
    }
  }, [globalFilteredClusters, gpuByCluster])

  // Determine if we should show skeleton content (loading with no data OR offline without demo OR mode switching)
  const showSkeletonContent = (isLoading && (clusters || []).length === 0) || forceSkeletonForOffline || isModeSwitching

  // Stats value getter for DashboardPage's configurable StatsOverview
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const hasData = stats.hasResourceData || stats.total > 0
    switch (blockId) {
      case 'clusters':
        return {
          value: stats.total,
          sublabel: 'total clusters',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('all'); setShowClusterGrid(true) },
          isClickable: stats.total > 0,
        }
      case 'healthy':
        return {
          value: stats.healthy,
          sublabel: 'healthy',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('healthy'); setShowClusterGrid(true) },
          isClickable: stats.healthy > 0,
        }
      case 'unhealthy':
        return {
          value: stats.unhealthy,
          sublabel: 'unhealthy',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unhealthy'); setShowClusterGrid(true) },
          isClickable: stats.unhealthy > 0,
        }
      case 'unreachable':
        return {
          value: stats.unreachable,
          sublabel: 'offline',
          onClick: () => { emitClusterStatsDrillDown('cluster_health_status'); setFilter('unreachable'); setShowClusterGrid(true) },
          isClickable: stats.unreachable > 0,
        }
      case 'nodes':
        return {
          value: hasData ? stats.totalNodes : '-',
          sublabel: 'total nodes',
          onClick: () => { emitClusterStatsDrillDown('nodes'); window.location.href = '/compute' },
          isClickable: hasData,
        }
      case 'cpus':
        return {
          value: hasData ? stats.totalCPUs : '-',
          sublabel: 'cores allocatable',
          onClick: () => { emitClusterStatsDrillDown('cpu'); window.location.href = '/compute' },
          isClickable: hasData,
        }
      case 'memory':
        return {
          value: hasData ? formatMemoryStat(stats.totalMemoryGB) : '-',
          sublabel: 'allocatable',
          onClick: () => { emitClusterStatsDrillDown('memory'); window.location.href = '/compute' },
          isClickable: hasData,
        }
      case 'storage':
        return {
          value: hasData ? formatMemoryStat(stats.totalStorageGB) : '-',
          sublabel: 'storage',
          onClick: () => { emitClusterStatsDrillDown('storage'); window.location.href = '/storage' },
          isClickable: hasData,
        }
      case 'gpus':
        return {
          value: hasData ? stats.totalGPUs : '-',
          sublabel: 'total GPUs',
          onClick: () => { emitClusterStatsDrillDown('gpu'); openGPUModal() },
          isClickable: hasData && stats.totalGPUs > 0,
        }
      case 'pods':
        return {
          value: hasData ? stats.totalPods : '-',
          sublabel: 'running pods',
          onClick: () => { emitClusterStatsDrillDown('pods'); window.location.href = '/workloads' },
          isClickable: hasData,
        }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, setFilter, openGPUModal])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

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
                  initialPrompt: prompt,
                })
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
                  onReorder={handleReorder}
                />
              )}
            </>
          )
        )}
      </div>

      {/* Cluster Groups */}
      {(clusterGroups.length > 0 || showGroupForm) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowGroups(!showGroups)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Cluster Groups ({clusterGroups.length})</span>
              {showGroups ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowGroupForm(!showGroupForm)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Group
            </button>
          </div>

          {showGroups && (
            <div className="space-y-2">
              {/* New Group Form */}
              {showGroupForm && (
                <div className="glass p-4 rounded-lg space-y-3">
                  <input
                    type="text"
                    placeholder="Group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="text-xs text-muted-foreground mb-1">Select clusters for this group:</div>
                  <div className="flex flex-wrap gap-2">
                    {clusters.map((cluster) => {
                      const isInGroup = newGroupClusters.includes(cluster.name)
                      const unreachable = isClusterUnreachable(cluster)
                      return (
                        <button
                          key={cluster.name}
                          onClick={() => {
                            if (isInGroup) {
                              setNewGroupClusters(prev => prev.filter(c => c !== cluster.name))
                            } else {
                              setNewGroupClusters(prev => [...prev, cluster.name])
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                            isInGroup
                              ? 'bg-primary/20 text-primary border border-primary/30'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent'
                          }`}
                        >
                          {unreachable ? (
                            <WifiOff className="w-3 h-3 text-yellow-400" />
                          ) : cluster.healthy ? (
                            <CheckCircle className="w-3 h-3 text-green-400" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-orange-400" />
                          )}
                          {cluster.context || cluster.name}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowGroupForm(false)
                        setNewGroupName('')
                        setNewGroupClusters([])
                      }}
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (newGroupName.trim() && newGroupClusters.length > 0) {
                          addClusterGroup({ name: newGroupName.trim(), clusters: newGroupClusters })
                          setShowGroupForm(false)
                          setNewGroupName('')
                          setNewGroupClusters([])
                        }
                      }}
                      disabled={!newGroupName.trim() || newGroupClusters.length === 0}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Create
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Groups */}
              {clusterGroups.map((group) => (
                <div
                  key={group.id}
                  className="glass p-3 rounded-lg flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <button
                    onClick={() => selectClusterGroup(group.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <FolderOpen className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-medium text-foreground">{group.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {group.clusters.length} cluster{group.clusters.length !== 1 ? 's' : ''}
                        <span className="mx-1">·</span>
                        {group.clusters.slice(0, 3).join(', ')}
                        {group.clusters.length > 3 && ` +${group.clusters.length - 3} more`}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteClusterGroup(group.id)
                    }}
                    className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                    title={t('cluster.deleteGroup')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
        description: 'Add cards to monitor cluster health, resource usage, and workload status.',
      }}
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

      {/* Add Cluster Dialog */}
      <AddClusterDialog open={showAddCluster} onClose={() => setShowAddCluster(false)} />
    </DashboardPage>
  )
}
