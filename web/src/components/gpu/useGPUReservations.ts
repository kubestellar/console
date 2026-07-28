import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useModalState } from '../../lib/modals'
import { useGPUNodes, useResourceQuotas, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import {
  useGPUReservations as useApiGPUReservations,
  type GPUReservation,
  type CreateGPUReservationInput,
  type UpdateGPUReservationInput,
} from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import { getDefaultCardWidth } from '../cards/cardRegistry'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { GPU_KEYS } from './gpu-constants'
import { DEFAULT_GPU_CARDS, type GpuDashCard } from './SortableGpuCard'
import { computeGPUOverviewStats } from './gpuOverviewStats'
import type { CalendarBar } from './GPUCalendarTab'
import type { GPUClusterInfo } from './ReservationFormModal'

export type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'

const GPU_DASHBOARD_STORAGE_KEY = 'gpu-dashboard-tab-cards'
const MS_PER_HOUR = 3_600_000
const DEFAULT_DURATION_HOURS = 24

export function useGPUReservations() {
  const { nodes: rawNodes, isLoading: nodesLoading, refetch: refetchGPUNodes } = useGPUNodes()
  const { refetch: refetchClusters } = useClusters()

  const refetchAll = () => {
    refetchGPUNodes()
    refetchClusters()
  }

  const { showIndicator: isRefreshingDashboard, triggerRefresh } = useRefreshIndicator(refetchAll)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: demoMode } = useDemoMode()
  const { isInClusterMode } = useBackendHealth()
  const { user, isAuthenticated } = useAuth()

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
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showReservationForm, setShowReservationForm] = useState(false)
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null)
  const [editingReservation, setEditingReservation] = useState<GPUReservation | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [prefillDate, setPrefillDate] = useState<string | null>(null)

  const { isOpen: showAddCardModal, open: openAddCardModal, close: closeAddCardModal } = useModalState()

  const [dashboardCards, setDashboardCards] = useState<GpuDashCard[]>(() => {
    const stored = safeGetJSON<GpuDashCard[] | string[]>(GPU_DASHBOARD_STORAGE_KEY)
    if (!stored || stored.length === 0) return DEFAULT_GPU_CARDS
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
    closeAddCardModal()
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

  const gpuDashSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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

  const {
    reservations: allReservations,
    isLoading: reservationsLoading,
    createReservation: apiCreateReservation,
    updateReservation: apiUpdateReservation,
    deleteReservation: apiDeleteReservation,
  } = useApiGPUReservations()

  const nodes = useMemo(() => {
    if (isAllClustersSelected) return rawNodes || []
    return (rawNodes || []).filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [isAllClustersSelected, rawNodes, selectedClusters])

  const gpuQuotas = useMemo(() => {
    const filtered = (resourceQuotas || []).filter(q =>
      Object.keys(q.hard || {}).some(k => GPU_KEYS.some(gk => k.includes(gk))),
    )
    if (isAllClustersSelected) return filtered
    return filtered.filter(q => q.cluster && selectedClusters.some(c => q.cluster!.startsWith(c)))
  }, [resourceQuotas, isAllClustersSelected, selectedClusters])

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
        (r.title ?? '').toLowerCase().includes(term)
        || (r.namespace ?? '').toLowerCase().includes(term)
        || (r.user_name ?? '').toLowerCase().includes(term)
        || (r.cluster ?? '').toLowerCase().includes(term)
        || (r.status ?? '').toLowerCase().includes(term)
        || (r.gpu_type && r.gpu_type.toLowerCase().includes(term))
        || (r.gpu_types && r.gpu_types.some(t => t.toLowerCase().includes(term)))
        || (r.description && r.description.toLowerCase().includes(term))
        || (r.notes && r.notes.toLowerCase().includes(term)),
      )
    }
    return filtered
  }, [allReservations, isAllClustersSelected, searchTerm, selectedClusters, showOnlyMine, user])

  const visibleReservationIds = (filteredReservations || []).map(r => r.id)
  const { utilizations } = useGPUUtilizations(visibleReservationIds)

  const gpuClusters = useMemo(() => {
    const clusterMap: Record<string, GPUClusterInfo> = {}
    for (const node of (rawNodes || [])) {
      if (!clusterMap[node.cluster]) {
        clusterMap[node.cluster] = {
          name: node.cluster,
          totalGPUs: 0,
          allocatedGPUs: 0,
          availableGPUs: 0,
          gpuTypes: [],
        }
      }
      const clusterInfo = clusterMap[node.cluster]
      clusterInfo.totalGPUs += node.gpuCount
      clusterInfo.allocatedGPUs += node.gpuAllocated
      clusterInfo.availableGPUs = clusterInfo.totalGPUs - clusterInfo.allocatedGPUs
      if (!clusterInfo.gpuTypes.includes(node.gpuType)) {
        clusterInfo.gpuTypes.push(node.gpuType)
      }
    }
    return Object.values(clusterMap).filter(c => c.totalGPUs > 0)
  }, [rawNodes])

  const knownNamespacesByCluster = useMemo(() => {
    const byCluster = new Map<string, Set<string>>()
    for (const reservation of (allReservations || [])) {
      if (!reservation.cluster || !reservation.namespace) continue
      let namespaces = byCluster.get(reservation.cluster)
      if (!namespaces) {
        namespaces = new Set<string>()
        byCluster.set(reservation.cluster, namespaces)
      }
      namespaces.add(reservation.namespace)
    }
    const out: Record<string, string[]> = {}
    byCluster.forEach((set, cluster) => {
      out[cluster] = Array.from(set)
    })
    return out
  }, [allReservations])

  const stats = useMemo(() => computeGPUOverviewStats({
    nodes,
    reservations: filteredReservations,
    gpuQuotas,
    gpuClusters,
  }), [filteredReservations, gpuClusters, gpuQuotas, nodes])

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

  const getReservationDayRange = useCallback((reservation: GPUReservation) => {
    if (!reservation.start_date) return null

    const originalStart = new Date(reservation.start_date)
    const durationHours = reservation.duration_hours || DEFAULT_DURATION_HOURS
    const exactEnd = new Date(originalStart.getTime() + durationHours * MS_PER_HOUR)

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

  const calendarWeeks = useMemo(() => {
    const totalCells = startingDay + daysInMonth
    const numWeeks = Math.ceil(totalCells / 7)
    const weeks: { days: (number | null)[]; bars: CalendarBar[] }[] = []

    for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
      const days: (number | null)[] = []
      for (let col = 0; col < 7; col++) {
        const cellIndex = weekIndex * 7 + col
        const day = cellIndex - startingDay + 1
        days.push(day >= 1 && day <= daysInMonth ? day : null)
      }
      weeks.push({ days, bars: [] })
    }

    const rowOccupancy: (string | null)[][] = weeks.map(() => [])

    const sortedReservations = [...filteredReservations]
      .map(r => ({ r, range: getReservationDayRange(r) }))
      .filter((x): x is { r: GPUReservation; range: { startDay: number; endDay: number } } => x.range !== null)
      .sort((a, b) => a.range.startDay - b.range.startDay || (b.range.endDay - b.range.startDay) - (a.range.endDay - a.range.startDay))

    for (const { r, range } of sortedReservations) {
      for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
        const weekStartDay = weeks[weekIndex].days.find(d => d !== null) ?? 1
        const weekEndDay = [...weeks[weekIndex].days].reverse().find(d => d !== null) ?? daysInMonth

        if (range.startDay > weekEndDay || range.endDay < weekStartDay) continue

        const barStartDay = Math.max(range.startDay, weekStartDay)
        const barEndDay = Math.min(range.endDay, weekEndDay)
        const startCol = weeks[weekIndex].days.indexOf(barStartDay)
        const endCol = weeks[weekIndex].days.indexOf(barEndDay)
        if (startCol === -1 || endCol === -1) continue

        let row = 0
        while (true) {
          if (!rowOccupancy[weekIndex][row]) break
          if (rowOccupancy[weekIndex][row] !== r.id) {
            let conflict = false
            for (const bar of weeks[weekIndex].bars) {
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

        rowOccupancy[weekIndex][row] = r.id

        weeks[weekIndex].bars.push({
          reservation: r,
          startCol,
          spanCols: endCol - startCol + 1,
          row,
          isStart: barStartDay === range.startDay,
          isEnd: barEndDay === range.endDay,
        })
      }
    }

    return weeks
  }, [daysInMonth, filteredReservations, getReservationDayRange, startingDay])

  const getGPUCountForDay = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    let total = 0

    for (const reservation of filteredReservations) {
      if (!reservation.start_date) continue
      const originalStart = new Date(reservation.start_date)
      const durationHours = reservation.duration_hours || DEFAULT_DURATION_HOURS
      const exactEnd = new Date(originalStart.getTime() + durationHours * MS_PER_HOUR)
      const start = new Date(originalStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(exactEnd)
      end.setHours(23, 59, 59, 999)
      if (date >= start && date <= end) {
        total += reservation.gpu_count
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

  const handleDeleteReservation = async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await apiDeleteReservation(deleteConfirmId)
      showToast('GPU reservation deleted', 'success')
    } catch (err: unknown) {
      showToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }

  const openCreateForm = useCallback(() => {
    setEditingReservation(null)
    setShowReservationForm(true)
  }, [])

  const openEditForm = useCallback((reservation: GPUReservation) => {
    setEditingReservation(reservation)
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
      if (!prev) setActiveTab('quotas')
      return !prev
    })
  }, [])

  const deleteConfirmReservation = deleteConfirmId
    ? allReservations.find(r => r.id === deleteConfirmId)
    : null

  const isLoading = nodesLoading && nodes.length === 0 && reservationsLoading

  const saveReservation = async (input: CreateGPUReservationInput | UpdateGPUReservationInput) => {
    if (editingReservation) {
      await apiUpdateReservation(editingReservation.id, input as UpdateGPUReservationInput)
      return editingReservation.id
    }
    const created = await apiCreateReservation(input as CreateGPUReservationInput)
    return created.id
  }

  const activateReservation = async (id: string) => {
    await apiUpdateReservation(id, { status: 'active' })
  }

  return {
    rawNodes,
    nodes,
    nodesLoading,
    user,
    effectiveDemoMode,
    gpuLiveMode,
    activeTab,
    setActiveTab,
    currentMonth,
    showReservationForm,
    expandedReservationId,
    setExpandedReservationId,
    editingReservation,
    deleteConfirmId,
    setDeleteConfirmId,
    deleteConfirmReservation,
    isDeleting,
    showOnlyMine,
    searchTerm,
    setSearchTerm,
    setShowOnlyMine,
    prefillDate,
    showAddCardModal,
    openAddCardModal,
    closeAddCardModal,
    dashboardCards,
    dashCardIds,
    gpuDashSensors,
    isRefreshingDashboard,
    triggerRefresh,
    filteredReservations,
    reservationsLoading,
    utilizations,
    gpuClusters,
    knownNamespacesByCluster,
    stats,
    calendarWeeks,
    getGPUCountForDay,
    prevMonth,
    nextMonth,
    handleDeleteReservation,
    openCreateForm,
    openEditForm,
    closeReservationForm,
    openCreateFormForDate,
    goToReservation,
    toggleShowOnlyMine,
    handleAddDashboardCards,
    handleRemoveDashboardCard,
    handleDashCardWidthChange,
    handleDashDragEnd,
    saveReservation,
    activateReservation,
    showToast,
    isLoading,
  }
}
