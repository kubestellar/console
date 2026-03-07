import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Check, WifiOff, ChevronRight, CheckCircle, AlertTriangle, ChevronDown, FolderOpen, Plus, Trash2, Server, Activity, LayoutGrid } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useClusters, useGPUNodes, useNVIDIAOperators, ClusterInfo, refreshSingleCluster } from '../../hooks/useMCP'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { useDashboard } from '../../lib/dashboards'
import { ClusterDetailModal } from './ClusterDetailModal'
import { AddClusterDialog } from './AddClusterDialog'
import { EmptyClusterState } from './EmptyClusterState'
import {
  RenameModal,
  StatsOverview,
  FilterTabs,
  ClusterGrid,
  GPUDetailModal,
  SortableClusterCard,
  DragPreviewCard,
  CardConfigModal,
  type ClusterLayoutMode,
} from './components'
import { isClusterUnreachable } from './utils'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { getDefaultCards } from '../../config/dashboards'

// Storage key for cluster page cards
const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'

// Default cards loaded from centralized config
const DEFAULT_CLUSTERS_CARDS = getDefaultCards('clusters')

import { useLocalAgent } from '../../hooks/useLocalAgent'
import { emitClusterStatsDrillDown } from '../../lib/analytics'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { ClusterCardSkeleton, StatsOverviewSkeleton } from '../ui/ClusterCardSkeleton'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useTranslation } from 'react-i18next'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_CLUSTER_LAYOUT, FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'


export function Clusters() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const { nodes: gpuNodes, isLoading: gpuLoading, error: gpuError, refetch: gpuRefetch } = useGPUNodes()
  const { operators: nvidiaOperators } = useNVIDIAOperators()
  const { isConnected, status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

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
  const [sortBy, setSortBy] = useState<'name' | 'nodes' | 'pods' | 'health'>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [layoutMode, setLayoutMode] = useState<ClusterLayoutMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY_CLUSTER_LAYOUT)
    return (stored as ClusterLayoutMode) || 'grid'
  })
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  const [showGroups, setShowGroups] = useState(false) // Collapsed by default so cluster cards are visible first

  // Additional UI state
  const [showStats, setShowStats] = useState(true) // Stats overview visible by default
  const [showClusterGrid, setShowClusterGrid] = useState(true) // Cluster cards visible by default
  const [showGPUModal, setShowGPUModal] = useState(false)
  const [showAddCluster, setShowAddCluster] = useState(false)

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    setShowCards,
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: CLUSTERS_CARDS_KEY,
    defaultCards: DEFAULT_CLUSTERS_CARDS,
    onRefresh: refetch,
  })

  // Handle addCard URL param - open modal and clear param.
  // Guard: KeepAlive keeps hidden dashboards mounted; only process on active route.
  useEffect(() => {
    if (location.pathname !== '/clusters') return
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      searchParams.delete('addCard')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard, location.pathname])

  // Trigger refresh when navigating to this page (location.key changes on each navigation)
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards)
    expandCards()
    setShowAddCard(false)
  }, [addCards, expandCards, setShowAddCard])

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId)
  }, [openConfigureCard])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error('Local agent not connected')
    const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/rename-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
      signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'Failed to rename context')
    }
    refetch()
  }

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
    // Unreachable = no nodes (can't connect)
    // Healthy = has nodes and healthy flag is true
    // Unhealthy = has nodes but healthy flag is false
    if (filter === 'healthy') {
      result = result.filter(c => !isClusterUnreachable(c) && c.healthy)
    } else if (filter === 'unhealthy') {
      result = result.filter(c => !isClusterUnreachable(c) && !c.healthy)
    } else if (filter === 'unreachable') {
      result = result.filter(c => isClusterUnreachable(c))
    }

    // Sort
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
        case 'health':
          const aHealth = isClusterUnreachable(a) ? 0 : a.healthy ? 2 : 1
          const bHealth = isClusterUnreachable(b) ? 0 : b.healthy ? 2 : 1
          cmp = aHealth - bHealth
          break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [clusters, filter, globalSelectedClusters, isAllClustersSelected, customFilter, sortBy, sortAsc])

  // Get GPU count per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, { total: number; allocated: number }> = {}
    ;(gpuNodes || []).forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      if (!map[clusterKey]) {
        map[clusterKey] = { total: 0, allocated: 0 }
      }
      map[clusterKey].total += node.gpuCount
      map[clusterKey].allocated += node.gpuAllocated
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
    // Note: Don't filter by "loading" state to avoid hiding clusters during refresh
    // Unreachable = reachable explicitly false or connection errors or no nodes
    const unreachable = globalFilteredClusters.filter(c => isClusterUnreachable(c)).length
    // Helper: A cluster is healthy if it has nodes OR if healthy flag is explicitly true
    const isHealthy = (c: ClusterInfo) => (c.nodeCount && c.nodeCount > 0) || c.healthy === true
    // Healthy = not unreachable and (has nodes OR healthy flag)
    const healthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && isHealthy(c)).length
    // Unhealthy = not unreachable and not healthy
    const unhealthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && !isHealthy(c)).length
    // Loading = initial load only (no data yet), not during refresh
    const loadingCount = globalFilteredClusters.filter(c =>
      c.nodeCount === undefined && c.reachable === undefined
    ).length

    // Check if we have any reachable clusters with resource data
    const hasResourceData = globalFilteredClusters.some(c =>
      !isClusterUnreachable(c) && c.nodeCount !== undefined && c.nodeCount > 0
    )

    return {
      total: globalFilteredClusters.length,
      loading: loadingCount,
      healthy,
      unhealthy,
      unreachable,
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

  // Note: We no longer block on errors - always show demo data gracefully
  // The error variable is kept for potential future use but UI always renders

  return (
    <div data-testid="clusters-page" className="pt-16">
      {/* Header */}
      <DashboardHeader
        title={t('navigation.clusters')}
        subtitle={t('cluster.subtitle')}
        icon={<Server className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="clusters-auto-refresh"
        lastUpdated={lastUpdated}
        rightExtra={
          <button
            onClick={() => setShowAddCluster(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('cluster.addCluster')}
          </button>
        }
      />

      {/* Stats Overview - collapsible */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Activity className="w-4 h-4" />
            <span>Stats Overview</span>
            {showStats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {showStats && (
          showSkeletonContent ? (
            <StatsOverviewSkeleton />
          ) : (
            <StatsOverview
              stats={stats}
              onFilterByStatus={(status) => {
                emitClusterStatsDrillDown('cluster_health_status')
                setFilter(status)
                setShowClusterGrid(true) // Ensure cluster grid is visible
              }}
              onCPUClick={() => { emitClusterStatsDrillDown('cpu'); window.location.href = '/compute' }}
              onMemoryClick={() => { emitClusterStatsDrillDown('memory'); window.location.href = '/compute' }}
              onStorageClick={() => { emitClusterStatsDrillDown('storage'); window.location.href = '/storage' }}
              onGPUClick={() => { emitClusterStatsDrillDown('gpu'); setShowGPUModal(true) }}
              onNodesClick={() => { emitClusterStatsDrillDown('nodes'); window.location.href = '/compute' }}
              onPodsClick={() => { emitClusterStatsDrillDown('pods'); window.location.href = '/workloads' }}
            />
          )
        )}
      </div>

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
                  localStorage.setItem(STORAGE_KEY_CLUSTER_LAYOUT, mode)
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

      {/* Cluster Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle and buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Cluster Dashboard Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Server className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Cluster Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor cluster health, resource usage, and workload status.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Cards
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
                    {cards.map(card => (
                      <SortableClusterCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                        isDragging={activeId === card.id}
                        isRefreshing={isRefreshing}
                        onRefresh={triggerRefresh}
                        lastUpdated={lastUpdated}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-80 rotate-3 scale-105">
                      <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>

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

      {renamingCluster && (
        <RenameModal
          clusterName={renamingCluster}
          currentDisplayName={clusters.find(c => c.name === renamingCluster)?.context || renamingCluster}
          onClose={() => setRenamingCluster(null)}
          onRename={handleRenameContext}
        />
      )}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
      />

      {/* Card Configuration Modal */}
      {configuringCard && (
        <CardConfigModal
          card={configuringCard}
          clusters={clusters}
          onSave={(config) => handleSaveCardConfig(configuringCard.id, config)}
          onClose={() => setConfiguringCard(null)}
        />
      )}

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* GPU Detail Modal */}
      {showGPUModal && (
        <GPUDetailModal
          gpuNodes={gpuNodes}
          isLoading={gpuLoading}
          error={gpuError}
          onRefresh={gpuRefetch}
          onClose={() => setShowGPUModal(false)}
          operatorStatus={nvidiaOperators}
        />
      )}
      <AddClusterDialog open={showAddCluster} onClose={() => setShowAddCluster(false)} />
    </div>
  )
}


