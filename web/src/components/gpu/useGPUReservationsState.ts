import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalState } from '../../lib/modals'
import { useGPUNodes, useResourceQuotas, useClusters } from '../../hooks/useMCP'
import type { GPUClusterInfo } from './ReservationFormModal'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { GPU_KEYS } from './gpu-constants'
import { computeGPUOverviewStats } from './gpuOverviewStats'
import { useGPUDashboardCards } from './useGPUDashboardCards'
import { useGPUCalendarState } from './useGPUCalendarState'
import { useGPUReservationForm } from './useGPUReservationForm'

export type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'
export type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

/**
 * Aggregates all state, data-fetching, and derived values for the GPUReservations page.
 * Extracted from GPUReservations.tsx so the component itself only handles rendering.
 */
export function useGPUReservationsState() {
  const { t: tTyped } = useTranslation(['cards', 'common'])
  const t = tTyped as unknown as TranslateFn
  const { nodes: rawNodes, isLoading: nodesLoading, refetch: refetchGPUNodes } = useGPUNodes()
  const { refetch: refetchClusters } = useClusters()

  // Refresh indicator for dashboard tab — refreshes GPU nodes + clusters
  const refetchAll = () => {
    refetchGPUNodes()
    refetchClusters()
  }
  const { showIndicator: isRefreshingDashboard, triggerRefresh } = useRefreshIndicator(refetchAll)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: demoMode } = useDemoMode()
  const { isInClusterMode } = useBackendHealth()
  const { user, isAuthenticated } = useAuth()

  // GPU Reservations bypasses demo mode when running in-cluster with a real OAuth token.
  // Other pages can remain in demo mode — this exception ensures authenticated users
  // on cluster deployments always get live GPU reservation data.
  const [gpuLiveMode, setGpuLiveMode] = useState(false)
  const effectiveDemoMode = demoMode && !gpuLiveMode

  useEffect(() => {
    async function checkGpuLiveMode() {
      const { hasRealToken } = await import('@/lib/demoMode')
      const hasReal = await hasRealToken()
      setGpuLiveMode(isInClusterMode && isAuthenticated && hasReal)
    }
    checkGpuLiveMode()
  }, [isInClusterMode, isAuthenticated])

  const { resourceQuotas } = useResourceQuotas(undefined, undefined, gpuLiveMode)
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const { isOpen: showAddCardModal, open: openAddCardModal, close: closeAddCardModal } = useModalState()

  // Dashboard card state + DnD
  const {
    dashboardCards,
    dashCardIds,
    gpuDashSensors,
    handleAddDashboardCards,
    handleRemoveDashboardCard,
    handleDashCardWidthChange,
    handleDashDragEnd,
  } = useGPUDashboardCards()

  // API-backed reservations
  const {
    reservations: allReservations,
    isLoading: reservationsLoading,
    createReservation: apiCreateReservation,
    updateReservation: apiUpdateReservation,
    deleteReservation: apiDeleteReservation } = useGPUReservations()

  // Filter nodes by global cluster selection
  const nodes = (() => {
    if (isAllClustersSelected) return rawNodes || []
    return (rawNodes || []).filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  })()

  // GPU quotas from K8s (for overview stats only)
  const gpuQuotas = (() => {
    const filtered = (resourceQuotas || []).filter(q =>
      Object.keys(q.hard || {}).some(k => GPU_KEYS.some(gk => k.includes(gk)))
    )
    if (isAllClustersSelected) return filtered
    return filtered.filter(q => q.cluster && selectedClusters.some(c => q.cluster!.startsWith(c)))
  })()

  // Filtered reservations respecting "My Reservations" toggle, cluster selection, and keyword search
  const filteredReservations = useMemo(() => {
    let filtered = allReservations || []
    if (!isAllClustersSelected) {
      filtered = filtered.filter(r => selectedClusters.some(c => r.cluster.startsWith(c)))
    }
    if (showOnlyMine && user) {
      const login = user.github_login?.toLowerCase()
      filtered = filtered.filter(r => r.user_name.toLowerCase() === login)
    }
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase()
      filtered = filtered.filter(r =>
        (r.title ?? '').toLowerCase().includes(term) ||
        (r.namespace ?? '').toLowerCase().includes(term) ||
        (r.user_name ?? '').toLowerCase().includes(term) ||
        (r.cluster ?? '').toLowerCase().includes(term) ||
        (r.status ?? '').toLowerCase().includes(term) ||
        (r.gpu_type && r.gpu_type.toLowerCase().includes(term)) ||
        (r.gpu_types && r.gpu_types.some(t => t.toLowerCase().includes(term))) ||
        (r.description && r.description.toLowerCase().includes(term)) ||
        (r.notes && r.notes.toLowerCase().includes(term))
      )
    }
    return filtered
  }, [allReservations, showOnlyMine, user, selectedClusters, isAllClustersSelected, searchTerm])

  // Fetch utilization data for visible reservations
  const visibleReservationIds = (filteredReservations || []).map(r => r.id)
  const { utilizations } = useGPUUtilizations(visibleReservationIds)

  // Clusters with GPU info for the dropdown
  const gpuClusters = (() => {
    const clusterMap: Record<string, GPUClusterInfo> = {}
    for (const node of (rawNodes || [])) {
      if (!clusterMap[node.cluster]) {
        clusterMap[node.cluster] = {
          name: node.cluster,
          totalGPUs: 0,
          allocatedGPUs: 0,
          availableGPUs: 0,
          gpuTypes: [] }
      }
      const c = clusterMap[node.cluster]
      c.totalGPUs += node.gpuCount
      c.allocatedGPUs += node.gpuAllocated
      c.availableGPUs = c.totalGPUs - c.allocatedGPUs
      if (!c.gpuTypes.includes(node.gpuType)) {
        c.gpuTypes.push(node.gpuType)
      }
    }
    return Object.values(clusterMap).filter(c => c.totalGPUs > 0)
  })()

  // Namespaces known to have existing reservations, grouped by cluster.
  const knownNamespacesByCluster = useMemo(() => {
    const byCluster = new Map<string, Set<string>>()
    for (const r of (allReservations || [])) {
      if (!r.cluster || !r.namespace) continue
      let set = byCluster.get(r.cluster)
      if (!set) {
        set = new Set<string>()
        byCluster.set(r.cluster, set)
      }
      set.add(r.namespace)
    }
    const out: Record<string, string[]> = {}
    byCluster.forEach((set, cluster) => {
      out[cluster] = Array.from(set)
    })
    return out
  }, [allReservations])

  // GPU stats
  const stats = useMemo(() => computeGPUOverviewStats({
    nodes,
    reservations: filteredReservations,
    gpuQuotas,
    gpuClusters,
  }), [nodes, gpuQuotas, gpuClusters, filteredReservations])

  // Calendar state: month navigation + week layout
  const {
    currentMonth,
    calendarWeeks,
    getGPUCountForDay,
    prevMonth,
    nextMonth,
  } = useGPUCalendarState(filteredReservations)

  // Reservation form / delete-confirmation state
  const {
    showReservationForm,
    editingReservation,
    deleteConfirmId,
    isDeleting,
    prefillDate,
    deleteConfirmReservation,
    setDeleteConfirmId,
    handleDeleteReservation,
    openCreateForm,
    openEditForm,
    closeReservationForm,
    openCreateFormForDate,
  } = useGPUReservationForm({
    allReservations,
    onDelete: apiDeleteReservation,
    onShowToast: showToast,
  })

  const goToReservation = useCallback((id: string) => {
    setExpandedReservationId(id)
    setActiveTab('quotas')
  }, [])

  const toggleShowOnlyMine = useCallback(() => {
    setShowOnlyMine(prev => {
      if (!prev) setActiveTab('quotas')
      return !prev
    })
  }, [])

  const isLoading = nodesLoading && nodes.length === 0 && reservationsLoading

  return {
    t,
    isLoading,
    effectiveDemoMode,
    gpuLiveMode,
    activeTab,
    setActiveTab,
    expandedReservationId,
    setExpandedReservationId,
    showOnlyMine,
    setShowOnlyMine,
    toggleShowOnlyMine,
    searchTerm,
    setSearchTerm,
    showAddCardModal,
    openAddCardModal,
    closeAddCardModal,
    dashboardCards,
    dashCardIds,
    gpuDashSensors,
    handleAddDashboardCards,
    handleRemoveDashboardCard,
    handleDashCardWidthChange,
    handleDashDragEnd,
    isRefreshingDashboard,
    triggerRefresh,
    nodes,
    rawNodes,
    nodesLoading,
    reservationsLoading,
    filteredReservations,
    utilizations,
    gpuClusters,
    knownNamespacesByCluster,
    stats,
    currentMonth,
    calendarWeeks,
    getGPUCountForDay,
    prevMonth,
    nextMonth,
    showReservationForm,
    editingReservation,
    deleteConfirmId,
    isDeleting,
    prefillDate,
    deleteConfirmReservation,
    setDeleteConfirmId,
    handleDeleteReservation,
    openCreateForm,
    openEditForm,
    closeReservationForm,
    openCreateFormForDate,
    goToReservation,
    user,
    apiCreateReservation,
    apiUpdateReservation,
    showToast,
  }
}
