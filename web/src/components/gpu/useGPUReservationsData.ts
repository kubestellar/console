import { useState, useMemo, useCallback, useEffect } from 'react'
import { useGPUNodes, useResourceQuotas, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import type { GPUClusterInfo } from './ReservationFormModal'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { GPU_KEYS } from './gpu-constants'
import type { GpuDashCard } from './SortableGpuCard'
import { DEFAULT_GPU_CARDS } from './SortableGpuCard'
import { getDefaultCardWidth } from '../cards/cardRegistry'
import type { CalendarBar } from './GPUCalendarTab'
import { computeGPUOverviewStats } from './gpuOverviewStats'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates } from '@dnd-kit/sortable'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'

export function useGPUReservationsData() {
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
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null)
  const [editingReservation, setEditingReservation] = useState<GPUReservation | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [prefillDate, setPrefillDate] = useState<string | null>(null)
  const [showReservationForm, setShowReservationForm] = useState(false)

  // Dashboard tab: customizable GPU cards persisted to localStorage
  const GPU_DASHBOARD_STORAGE_KEY = 'gpu-dashboard-tab-cards'
  const [dashboardCards, setDashboardCards] = useState<GpuDashCard[]>(() => {
    const stored = safeGetJSON<GpuDashCard[] | string[]>(GPU_DASHBOARD_STORAGE_KEY)
    if (!stored || stored.length === 0) return DEFAULT_GPU_CARDS
    // Migrate from old string[] format
    if (typeof stored[0] === 'string') {
      const migrated = (stored as string[]).map(type => ({ type, width: getDefaultCardWidth(type) }))
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, migrated)
      return migrated
    }
    return stored as GpuDashCard[]
  })

  const handleAddDashboardCards = (suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => {
    setDashboardCards(prev => {
      const updated = [...prev, ...suggestions.map(s => ({ type: s.type, width: getDefaultCardWidth(s.type) }))]
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
      return updated
    })
  }

  const handleRemoveDashboardCard = (index: number) => {
    setDashboardCards(prev => {
      const updated = prev.filter((_, i) => i !== index)
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
      return updated
    })
  }

  const handleDashCardWidthChange = (index: number, newWidth: number) => {
    setDashboardCards(prev => {
      const updated = prev.map((c, i) => i === index ? { ...c, width: newWidth } : c)
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
      return updated
    })
  }

  // Drag-and-drop for dashboard tab card reordering
  const gpuDashSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dashCardIds = dashboardCards.map((c, i) => `gpu-dash-${c.type}-${i}`)
  const handleDashDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = dashCardIds.indexOf(active.id as string)
      const newIndex = dashCardIds.indexOf(over.id as string)
      if (oldIndex !== -1 && newIndex !== -1) {
        setDashboardCards(prev => {
          const updated = arrayMove(prev, oldIndex, newIndex)
          safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
          return updated
        })
      }
    }
  }

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
    // Filter by cluster selection
    if (!isAllClustersSelected) {
      filtered = filtered.filter(r => selectedClusters.some(c => r.cluster.startsWith(c)))
    }
    // Filter by user
    if (showOnlyMine && user) {
      const login = user.github_login?.toLowerCase()
      filtered = filtered.filter(r => r.user_name.toLowerCase() === login)
    }
    // Filter by keyword search
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase()
      filtered = filtered.filter(r =>
        (r.title ?? '').toLowerCase().includes(term) ||
        (r.namespace ?? '').toLowerCase().includes(term) ||
        (r.user_name ?? '').toLowerCase().includes(term) ||
        (r.cluster ?? '').toLowerCase().includes(term) ||
        (r.status ?? '').toLowerCase().includes(term) ||
        (r.gpu_type && r.gpu_type.toLowerCase().includes(term)) ||
        // Match against any accepted GPU type so searching
        // for "H100" finds multi-type reservations that list H100
        // among their acceptable alternatives.
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
  // Fallback source for the Create Reservation dropdown when useNamespaces()
  // can't surface a namespace (e.g. user lacks cluster-wide list RBAC AND
  // the namespace has no running pods, so neither health-check discovery
  // nor the /api/mcp/pods-based REST fallback sees it).
  const knownNamespacesByCluster = useMemo(() => {
    // Use a Map<string, Set<string>> to dedupe in O(1) per entry.
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

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDay = firstDay.getDay()
    return { daysInMonth, startingDay }
  }

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth)

  // Get the start/end day index (0-based from month start) for a reservation within the visible month.
  // Duration is added to the ORIGINAL start time first, then day boundaries are derived.
  const getReservationDayRange = useCallback((r: GPUReservation) => {
    if (!r.start_date) return null
    const MS_PER_HOUR = 3_600_000
    const DEFAULT_DURATION_HOURS = 24

    const originalStart = new Date(r.start_date)
    const durationHours = r.duration_hours || DEFAULT_DURATION_HOURS
    // Compute end from the exact original timestamp, not a midnight-normalized one
    const exactEnd = new Date(originalStart.getTime() + durationHours * MS_PER_HOUR)

    // Normalize to day boundaries for calendar range display
    const start = new Date(originalStart)
    start.setHours(0, 0, 0, 0)
    const end = new Date(exactEnd)
    end.setHours(23, 59, 59, 999)

    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    monthEnd.setHours(23, 59, 59, 999)

    if (end < monthStart || start > monthEnd) return null

    const clampedStart = start < monthStart ? 1 : start.getDate()
    const clampedEnd = end > monthEnd ? daysInMonth : end.getDate()
    return { startDay: clampedStart, endDay: clampedEnd }
  }, [currentMonth, daysInMonth])

  // Compute spanning reservation rows per calendar week
  const calendarWeeks = useMemo(() => {
    const totalCells = startingDay + daysInMonth
    const numWeeks = Math.ceil(totalCells / 7)
    const weeks: { days: (number | null)[]; bars: CalendarBar[] }[] = []

    // Build week arrays
    for (let w = 0; w < numWeeks; w++) {
      const days: (number | null)[] = []
      for (let col = 0; col < 7; col++) {
        const cellIndex = w * 7 + col
        const day = cellIndex - startingDay + 1
        days.push(day >= 1 && day <= daysInMonth ? day : null)
      }
      weeks.push({ days, bars: [] })
    }

    // For each reservation, compute which weeks it spans and assign row slots
    // Track row occupancy per week: rowOccupancy[weekIndex][row] = reservationId or null
    const rowOccupancy: (string | null)[][] = weeks.map(() => [])

    // Sort reservations by start day then by duration (longer first) for stable layout
    const sortedReservations = [...filteredReservations]
      .map(r => ({ r, range: getReservationDayRange(r) }))
      .filter((x): x is { r: GPUReservation; range: { startDay: number; endDay: number } } => x.range !== null)
      .sort((a, b) => a.range.startDay - b.range.startDay || (b.range.endDay - b.range.startDay) - (a.range.endDay - a.range.startDay))

    for (const { r, range } of sortedReservations) {
      // Find which weeks this reservation touches
      for (let w = 0; w < weeks.length; w++) {
        const weekStartDay = weeks[w].days.find(d => d !== null) ?? 1
        const weekEndDay = [...weeks[w].days].reverse().find(d => d !== null) ?? daysInMonth

        if (range.startDay > weekEndDay || range.endDay < weekStartDay) continue

        // Compute column range within this week
        const barStartDay = Math.max(range.startDay, weekStartDay)
        const barEndDay = Math.min(range.endDay, weekEndDay)
        const startCol = weeks[w].days.indexOf(barStartDay)
        const endCol = weeks[w].days.indexOf(barEndDay)
        if (startCol === -1 || endCol === -1) continue

        // Find a free row slot
        let row = 0
        while (true) {
          if (!rowOccupancy[w][row]) break
          if (rowOccupancy[w][row] !== r.id) {
            // Check if this row has a conflict in the column range
            let conflict = false
            for (const bar of weeks[w].bars) {
              if (bar.row === row) {
                const barEnd = bar.startCol + bar.spanCols - 1
                if (!(endCol < bar.startCol || startCol > barEnd)) {
                  conflict = true
                  break
                }
              }
            }
            if (!conflict) break
          }
          row++
        }
        rowOccupancy[w][row] = r.id

        weeks[w].bars.push({
          reservation: r,
          startCol,
          spanCols: endCol - startCol + 1,
          row,
          isStart: barStartDay === range.startDay,
          isEnd: barEndDay === range.endDay })
      }
    }

    return weeks
  }, [filteredReservations, startingDay, daysInMonth, getReservationDayRange])

  // Get GPU count reserved on a specific day
  const getGPUCountForDay = (day: number) => {
    const MS_PER_HOUR = 3_600_000
    const DEFAULT_DURATION_HOURS = 24
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    let total = 0
    for (const r of filteredReservations) {
      if (!r.start_date) continue
      const originalStart = new Date(r.start_date)
      const durationHours = r.duration_hours || DEFAULT_DURATION_HOURS
      // Compute end from the exact original timestamp, then normalize to day boundaries
      const exactEnd = new Date(originalStart.getTime() + durationHours * MS_PER_HOUR)
      const start = new Date(originalStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(exactEnd)
      end.setHours(23, 59, 59, 999)
      if (date >= start && date <= end) {
        total += r.gpu_count
      }
    }
    return total
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  // Handlers
  const handleDeleteReservation = async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await apiDeleteReservation(deleteConfirmId)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }

  // Named callbacks for multi-state transitions — keeps JSX clean and ensures
  // the paired state updates are always applied atomically (React 19 batches
  // all setState calls within the same synchronous function).
  const openCreateForm = useCallback(() => {
    setEditingReservation(null)
    setShowReservationForm(true)
  }, [])

  const openEditForm = useCallback((r: GPUReservation) => {
    setEditingReservation(r)
    setShowReservationForm(true)
  }, [])

  const closeReservationForm = useCallback(() => {
    setShowReservationForm(false)
    setEditingReservation(null)
    setPrefillDate(null)
  }, [])

  const openCreateFormForDate = useCallback((dateStr: string) => {
    setPrefillDate(dateStr)
    setEditingReservation(null)
    setShowReservationForm(true)
  }, [])

  const goToReservation = useCallback((id: string) => {
    setExpandedReservationId(id)
    setActiveTab('quotas')
  }, [])

  const toggleShowOnlyMine = useCallback(() => {
    setShowOnlyMine(prev => {
      // Navigate to reservations tab when the filter is being switched on so
      // users immediately see the filtered list.
      if (!prev) setActiveTab('quotas')
      return !prev
    })
  }, [])

  const deleteConfirmReservation = deleteConfirmId
    ? allReservations.find(r => r.id === deleteConfirmId)
    : null

  const isLoading = nodesLoading && nodes.length === 0 && reservationsLoading

  const handleSaveReservation = async (input: CreateGPUReservationInput | UpdateGPUReservationInput) => {
    if (editingReservation) {
      await apiUpdateReservation(editingReservation.id, input as UpdateGPUReservationInput)
      return editingReservation.id
    } else {
      const created = await apiCreateReservation(input as CreateGPUReservationInput)
      return created.id
    }
  }

  const handleActivateReservation = async (id: string) => {
    await apiUpdateReservation(id, { status: 'active' })
  }

  return {
    // State
    activeTab,
    setActiveTab,
    currentMonth,
    expandedReservationId,
    setExpandedReservationId,
    editingReservation,
    deleteConfirmId,
    setDeleteConfirmId,
    isDeleting,
    showOnlyMine,
    setShowOnlyMine,
    searchTerm,
    setSearchTerm,
    prefillDate,
    showReservationForm,
    
    // Dashboard cards state
    dashboardCards,
    dashCardIds,
    handleAddDashboardCards,
    handleRemoveDashboardCard,
    handleDashCardWidthChange,
    gpuDashSensors,
    handleDashDragEnd,
    
    // Data
    nodes,
    rawNodes,
    nodesLoading,
    gpuClusters,
    filteredReservations,
    allReservations,
    reservationsLoading,
    utilizations,
    stats,
    gpuQuotas,
    knownNamespacesByCluster,
    
    // Calendar
    calendarWeeks,
    getGPUCountForDay,
    prevMonth,
    nextMonth,
    
    // Computed
    effectiveDemoMode,
    gpuLiveMode,
    isLoading,
    deleteConfirmReservation,
    user,
    isRefreshingDashboard,
    
    // Handlers
    handleDeleteReservation,
    openCreateForm,
    openEditForm,
    closeReservationForm,
    openCreateFormForDate,
    goToReservation,
    toggleShowOnlyMine,
    triggerRefresh,
    handleSaveReservation,
    handleActivateReservation,
  }
}
