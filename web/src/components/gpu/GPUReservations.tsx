import { useState, useMemo, useCallback, Suspense, memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap,
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  TrendingUp,
  FlaskConical,
  Trash2,
  Pencil,
  Loader2,
  Server,
  ChevronDown,
  ChevronUp,
  Filter,
  User,
  LayoutDashboard,
  GripVertical,
  X,
  Search,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import {
  useGPUNodes,
  useResourceQuotas,
  useClusters,
} from '../../hooks/useMCP'
import { ReservationFormModal, type GPUClusterInfo } from './ReservationFormModal'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode, hasRealToken } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { DonutChart } from '../charts/PieChart'
import { BarChart } from '../charts/BarChart'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'
import { getChartColor, getChartColorByName } from '../../lib/chartColors'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import type { GPUUtilizationSnapshot } from '../../hooks/useGPUUtilizations'
import { Sparkline } from '../charts/Sparkline'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { CARD_COMPONENTS, getDefaultCardWidth } from '../cards/cardRegistry'
import { CardWrapper, CARD_TITLES } from '../cards/CardWrapper'
import { AddCardModal } from '../dashboard/AddCardModal'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// GPU utilization thresholds for visual indicators
const UTILIZATION_HIGH_THRESHOLD = 80
const UTILIZATION_MEDIUM_THRESHOLD = 50

// Sparkline utilization color thresholds
const SPARKLINE_HIGH_UTIL_PCT = 70    // Green: well-utilized
const SPARKLINE_LOW_UTIL_PCT = 30     // Red: underutilized
const SPARKLINE_HEIGHT_PX = 28        // Height of sparkline chart

// Display settings
const MAX_NAME_DISPLAY_LENGTH = 12 // Maximum characters to display before truncating cluster names

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'

// GPU resource keys used to identify GPU quotas
const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

/** Get sparkline color based on average utilization */
function getUtilizationColor(avgPct: number): string {
  if (avgPct >= SPARKLINE_HIGH_UTIL_PCT) return '#22c55e' // green-500
  if (avgPct >= SPARKLINE_LOW_UTIL_PCT) return '#eab308'  // yellow-500
  return '#ef4444' // red-500
}

/** Count unique days where GPUs were actively used */
function countActiveDays(snapshots: GPUUtilizationSnapshot[]): number {
  const activeDates = new Set<string>()
  for (const snap of snapshots) {
    if (snap.active_gpu_count > 0) {
      activeDates.add(snap.timestamp.split('T')[0])
    }
  }
  return activeDates.size
}

/** Compute average GPU utilization across all snapshots */
function computeAvgUtilization(snapshots: GPUUtilizationSnapshot[]): number {
  if (snapshots.length === 0) return 0
  const sum = snapshots.reduce((acc, s) => acc + s.gpu_utilization_pct, 0)
  return Math.round(sum / snapshots.length)
}

// Dashboard card type persisted to localStorage
interface GpuDashCard { type: string; width: number }

// Sortable wrapper for GPU dashboard cards
const SortableGpuCard = memo(function SortableGpuCard({
  id,
  card,
  index,
  onRemove,
  onWidthChange,
  onRefresh,
  isRefreshing,
  forceLive,
}: {
  id: string
  card: GpuDashCard
  index: number
  onRemove: () => void
  onWidthChange: (w: number) => void
  onRefresh?: () => void
  isRefreshing?: boolean
  forceLive?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const Component = CARD_COMPONENTS[card.type]
  if (!Component) return null

  const colSpan = Math.min(12, Math.max(3, card.width))
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${colSpan} / span ${colSpan}`,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Suspense fallback={<div className="h-64 animate-pulse bg-secondary/30 rounded-xl" />}>
        <CardWrapper
          cardId={`gpu-dash-${card.type}-${index}`}
          title={CARD_TITLES[card.type] ?? card.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          cardType={card.type}
          cardWidth={card.width}
          forceLive={forceLive}
          onRemove={onRemove}
          onWidthChange={onWidthChange}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          dragHandle={
            <button
              {...attributes}
              {...listeners}
              className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
          }
        >
          <Component />
        </CardWrapper>
      </Suspense>
    </div>
  )
})

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export function GPUReservations() {
  const { t } = useTranslation(['cards', 'common'])
  const { nodes: rawNodes, isLoading: nodesLoading, refetch: refetchGPUNodes } = useGPUNodes()
  const { refetch: refetchClusters } = useClusters()

  // Refresh indicator for dashboard tab — refreshes GPU nodes + clusters
  const refetchAll = useCallback(() => {
    refetchGPUNodes()
    refetchClusters()
  }, [refetchGPUNodes, refetchClusters])
  const { showIndicator: isRefreshingDashboard, triggerRefresh } = useRefreshIndicator(refetchAll)
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: demoMode } = useDemoMode()
  const { isInClusterMode } = useBackendHealth()
  const { user, isAuthenticated } = useAuth()

  // GPU Reservations bypasses demo mode when running in-cluster with a real OAuth token.
  // Other pages can remain in demo mode — this exception ensures authenticated users
  // on cluster deployments always get live GPU reservation data.
  const gpuLiveMode = isInClusterMode && isAuthenticated && hasRealToken()
  const effectiveDemoMode = demoMode && !gpuLiveMode

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
  const [showAddCardModal, setShowAddCardModal] = useState(false)

  // Dashboard tab: customizable GPU cards persisted to localStorage
  const GPU_DASHBOARD_STORAGE_KEY = 'gpu-dashboard-tab-cards'
  const DEFAULT_GPU_CARDS: GpuDashCard[] = [
    'gpu_namespace_allocations', 'gpu_overview', 'gpu_status', 'gpu_inventory',
    'gpu_utilization', 'gpu_usage_trend', 'gpu_workloads', 'hardware_health',
  ].map(type => ({ type, width: getDefaultCardWidth(type) }))
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
  const handleAddDashboardCards = useCallback((suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => {
    setDashboardCards(prev => {
      const updated = [...prev, ...suggestions.map(s => ({ type: s.type, width: getDefaultCardWidth(s.type) }))]
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
      return updated
    })
    setShowAddCardModal(false)
  }, [])
  const handleRemoveDashboardCard = useCallback((index: number) => {
    setDashboardCards(prev => {
      const updated = prev.filter((_, i) => i !== index)
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
      return updated
    })
  }, [])
  const handleDashCardWidthChange = useCallback((index: number, newWidth: number) => {
    setDashboardCards(prev => {
      const updated = prev.map((c, i) => i === index ? { ...c, width: newWidth } : c)
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, updated)
      return updated
    })
  }, [])

  // Drag-and-drop for dashboard tab card reordering
  const gpuDashSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dashCardIds = useMemo(() => dashboardCards.map((c, i) => `gpu-dash-${c.type}-${i}`), [dashboardCards])
  const handleDashDragEnd = useCallback((event: DragEndEvent) => {
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
  }, [dashCardIds])


  // API-backed reservations
  const {
    reservations: allReservations,
    isLoading: reservationsLoading,
    createReservation: apiCreateReservation,
    updateReservation: apiUpdateReservation,
    deleteReservation: apiDeleteReservation,
  } = useGPUReservations()

  // Filter nodes by global cluster selection
  const nodes = useMemo(() => {
    if (isAllClustersSelected) return rawNodes || []
    return (rawNodes || []).filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [rawNodes, selectedClusters, isAllClustersSelected])

  // GPU quotas from K8s (for overview stats only)
  const gpuQuotas = useMemo(() => {
    const filtered = (resourceQuotas || []).filter(q =>
      Object.keys(q.hard || {}).some(k => GPU_KEYS.some(gk => k.includes(gk)))
    )
    if (isAllClustersSelected) return filtered
    return filtered.filter(q => q.cluster && selectedClusters.some(c => q.cluster!.startsWith(c)))
  }, [resourceQuotas, selectedClusters, isAllClustersSelected])

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
        r.title.toLowerCase().includes(term) ||
        r.namespace.toLowerCase().includes(term) ||
        r.user_name.toLowerCase().includes(term) ||
        r.cluster.toLowerCase().includes(term) ||
        r.status.toLowerCase().includes(term) ||
        (r.gpu_type && r.gpu_type.toLowerCase().includes(term)) ||
        (r.description && r.description.toLowerCase().includes(term)) ||
        (r.notes && r.notes.toLowerCase().includes(term))
      )
    }
    return filtered
  }, [allReservations, showOnlyMine, user, selectedClusters, isAllClustersSelected, searchTerm])

  // Fetch utilization data for visible reservations
  const visibleReservationIds = useMemo(
    () => (filteredReservations || []).map(r => r.id),
    [filteredReservations]
  )
  const { utilizations } = useGPUUtilizations(visibleReservationIds)

  // Clusters with GPU info for the dropdown
  const gpuClusters = useMemo((): GPUClusterInfo[] => {
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
      const c = clusterMap[node.cluster]
      c.totalGPUs += node.gpuCount
      c.allocatedGPUs += node.gpuAllocated
      c.availableGPUs = c.totalGPUs - c.allocatedGPUs
      if (!c.gpuTypes.includes(node.gpuType)) {
        c.gpuTypes.push(node.gpuType)
      }
    }
    return Object.values(clusterMap).filter(c => c.totalGPUs > 0)
  }, [rawNodes])

  // GPU stats
  const stats = useMemo(() => {
    const totalGPUs = nodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = nodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const availableGPUs = totalGPUs - allocatedGPUs
    const utilizationPercent = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0

    const activeReservations = filteredReservations.filter(r => r.status === 'active' || r.status === 'pending').length
    const reservedGPUs = filteredReservations.reduce((sum, r) => sum + r.gpu_count, 0)

    // GPU type distribution
    const gpuTypes = nodes.reduce((acc, n) => {
      if (!acc[n.gpuType]) acc[n.gpuType] = { total: 0, allocated: 0 }
      acc[n.gpuType].total += n.gpuCount
      acc[n.gpuType].allocated += n.gpuAllocated
      return acc
    }, {} as Record<string, { total: number; allocated: number }>)

    const typeChartData = Object.entries(gpuTypes).map(([name, data], i) => ({
      name,
      value: data.total,
      color: getChartColor((i % 4) + 1),
    }))

    // Usage by namespace from real quotas (include cluster context)
    const namespaceUsage: Record<string, number> = {}
    for (const q of gpuQuotas) {
      const label = q.cluster ? `${q.namespace} (${q.cluster})` : q.namespace
      for (const [key, value] of Object.entries(q.used || {})) {
        if (GPU_KEYS.some(gk => key.includes(gk))) {
          namespaceUsage[label] = (namespaceUsage[label] || 0) + (parseInt(value) || 0)
        }
      }
    }
    const usageByNamespace = Object.entries(namespaceUsage).map(([name, value], i) => ({
      name,
      value,
      color: getChartColor((i % 4) + 1),
    }))

    // GPU allocation by cluster
    const clusterUsage = gpuClusters.map(c => ({
      name: c.name.length > MAX_NAME_DISPLAY_LENGTH ? c.name.slice(0, MAX_NAME_DISPLAY_LENGTH) + '...' : c.name,
      value: c.allocatedGPUs,
    }))

    return {
      totalGPUs,
      allocatedGPUs,
      availableGPUs,
      utilizationPercent,
      activeReservations,
      reservedGPUs,
      typeChartData,
      usageByNamespace,
      clusterUsage,
    }
  }, [nodes, gpuQuotas, gpuClusters, filteredReservations])

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

  // Get the start/end day index (0-based from month start) for a reservation within the visible month
  const getReservationDayRange = (r: GPUReservation) => {
    if (!r.start_date) return null
    const start = new Date(r.start_date)
    start.setHours(0, 0, 0, 0)
    const durationHours = r.duration_hours || 24
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
    end.setHours(23, 59, 59, 999)

    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    monthEnd.setHours(23, 59, 59, 999)

    if (end < monthStart || start > monthEnd) return null

    const clampedStart = start < monthStart ? 1 : start.getDate()
    const clampedEnd = end > monthEnd ? daysInMonth : end.getDate()
    return { startDay: clampedStart, endDay: clampedEnd }
  }

  // Compute spanning reservation rows per calendar week
  // Each week gets assigned rows for reservations that overlap it
  interface CalendarBar {
    reservation: GPUReservation
    startCol: number // 0-6 column in this week
    spanCols: number // number of columns it spans
    row: number // row index within the week
    isStart: boolean // does the bar start in this week?
    isEnd: boolean // does the bar end in this week?
  }

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
          isEnd: barEndDay === range.endDay,
        })
      }
    }

    return weeks
  }, [filteredReservations, startingDay, daysInMonth, currentMonth])

  // Get GPU count reserved on a specific day
  const getGPUCountForDay = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    let total = 0
    for (const r of filteredReservations) {
      if (!r.start_date) continue
      const start = new Date(r.start_date)
      start.setHours(0, 0, 0, 0)
      const durationHours = r.duration_hours || 24
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
      end.setHours(23, 59, 59, 999)
      if (date >= start && date <= end) {
        total += r.gpu_count
      }
    }
    return total
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const MAX_VISIBLE_ROWS = 4

  // Handlers
  const handleDeleteReservation = useCallback(async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await apiDeleteReservation(deleteConfirmId)
      showToast('GPU reservation deleted', 'success')
    } catch (err) {
      showToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }, [deleteConfirmId, showToast, apiDeleteReservation])

  const deleteConfirmReservation = deleteConfirmId
    ? allReservations.find(r => r.id === deleteConfirmId)
    : null

  const isLoading = nodesLoading && nodes.length === 0 && reservationsLoading

  if (isLoading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  return (
    <div className="pt-16">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t('gpuReservations.title')}</h1>
          {effectiveDemoMode && (
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <FlaskConical className="w-3 h-3" />
              {t('gpuReservations.demo')}
            </span>
          )}
        </div>
        <div className="text-muted-foreground">{t('gpuReservations.subtitle')}</div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        className="flex gap-1 mb-6 border-b border-border"
        onKeyDown={(e) => {
          const ids = ['overview', 'calendar', 'quotas', 'inventory', 'dashboard'] as const
          const idx = ids.indexOf(activeTab)
          if (e.key === 'ArrowRight') setActiveTab(ids[Math.min(idx + 1, ids.length - 1)])
          else if (e.key === 'ArrowLeft') setActiveTab(ids[Math.max(idx - 1, 0)])
        }}
      >
        {[
          { id: 'overview' as const, label: t('gpuReservations.tabs.overview'), icon: TrendingUp },
          { id: 'calendar' as const, label: t('gpuReservations.tabs.calendar'), icon: Calendar },
          { id: 'quotas' as const, label: t('gpuReservations.tabs.reservations'), icon: Settings2, count: filteredReservations.length },
          { id: 'inventory' as const, label: t('gpuReservations.tabs.inventory'), icon: Server },
          { id: 'dashboard' as const, label: t('gpuReservations.tabs.dashboard'), icon: LayoutDashboard },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors',
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}

        <div className="ml-auto pb-2 flex items-center gap-3">
          {/* My Reservations filter */}
          {user && (
            <label
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer',
                showOnlyMine
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              <input
                type="checkbox"
                checked={showOnlyMine}
                onChange={() => {
                  setShowOnlyMine(!showOnlyMine)
                  // Switch to Reservations tab so filtered results are visible
                  if (!showOnlyMine) setActiveTab('quotas')
                }}
                className="sr-only"
              />
              {showOnlyMine ? <User className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              {t('gpuReservations.myReservations')}
            </label>
          )}
          <button
            onClick={() => { setEditingReservation(null); setShowReservationForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('gpuReservations.createReservation')}
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.totalGPUs}</div>
                  <div className="text-xs text-muted-foreground">{t('common:common.totalGpus')}</div>
                </div>
              </div>
            </div>
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{stats.availableGPUs}</div>
                  <div className="text-xs text-muted-foreground">{t('common:common.available')}</div>
                </div>
              </div>
            </div>
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Settings2 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{stats.activeReservations}</div>
                  <div className="text-xs text-muted-foreground">{t('gpuReservations.stats.activeReservations')}</div>
                </div>
              </div>
            </div>
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{stats.reservedGPUs}</div>
                  <div className="text-xs text-muted-foreground">{t('gpuReservations.stats.reservedGpus')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Utilization */}
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gpuReservations.charts.gpuUtilization')}</h3>
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-secondary" />
                    <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${stats.utilizationPercent * 3.52} 352`}
                      className={cn(
                        stats.utilizationPercent > UTILIZATION_HIGH_THRESHOLD ? 'text-red-500' :
                        stats.utilizationPercent > UTILIZATION_MEDIUM_THRESHOLD ? 'text-yellow-500' : 'text-green-500'
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{stats.utilizationPercent}%</span>
                    <span className="text-xs text-muted-foreground">{t('common:common.used')}</span>
                  </div>
                </div>
              </div>
              <div className="text-center mt-4 text-sm text-muted-foreground">
                {t('gpuReservations.overview.allocated', { allocated: stats.allocatedGPUs, total: stats.totalGPUs })}
              </div>
            </div>

            {/* GPU Types */}
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('common:common.gpuTypes')}</h3>
              {stats.typeChartData.length > 0 ? (
                <DonutChart data={stats.typeChartData} size={150} thickness={20} showLegend={true} />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">{t('gpuReservations.overview.noGpuData')}</div>
              )}
            </div>

            {/* Usage by Namespace */}
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gpuReservations.charts.gpuUsageByNamespace')}</h3>
              {stats.usageByNamespace.length > 0 ? (
                <DonutChart data={stats.usageByNamespace} size={150} thickness={20} showLegend={true} />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">{t('gpuReservations.overview.noGpuQuotas')}</div>
              )}
            </div>
          </div>

          {/* Cluster Allocation */}
          {stats.clusterUsage.length > 0 && (
            <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('gpuReservations.charts.gpuAllocationByCluster')}</h3>
              <BarChart data={stats.clusterUsage} height={200} color={getChartColorByName('primary')} showGrid={true} />
            </div>
          )}

          {/* Active Reservations */}
          <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {showOnlyMine ? t('gpuReservations.overview.myGpuReservations') : t('gpuReservations.overview.activeGpuReservations')}
            </h3>
            <div className="space-y-3">
              {filteredReservations.slice(0, 5).map(r => {
                const snapshots = (utilizations || {})[r.id] || []
                const avgUtil = computeAvgUtilization(snapshots)
                const activeDays = countActiveDays(snapshots)
                const sparkColor = snapshots.length > 0 ? getUtilizationColor(avgUtil) : '#9333ea'
                return (
                <div key={r.id}
                  className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Zap className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{r.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {r.namespace} · {r.user_name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-medium text-foreground">{r.gpu_count} <TechnicalAcronym term="GPU">{t('common:common.gpus')}</TechnicalAcronym></div>
                        <div className="text-sm text-muted-foreground">{t('gpuReservations.overview.durationHours', { hours: r.duration_hours })}</div>
                      </div>
                      <span className={cn('px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                        {r.status}
                      </span>
                      <ClusterBadge cluster={r.cluster} size="sm" />
                    </div>
                  </div>
                  {/* GPU Utilization Sparkline */}
                  {snapshots.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-purple-500/10">
                      <Sparkline
                        data={snapshots.map(s => s.gpu_utilization_pct)}
                        color={sparkColor}
                        height={SPARKLINE_HEIGHT_PX}
                        fill
                      />
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span style={{ color: sparkColor }}>
                          {t('gpuReservations.utilization.avgGpu', `Avg {{pct}}% GPU`, { pct: avgUtil })}
                        </span>
                        <span className="text-muted-foreground">
                          {t('gpuReservations.utilization.activeDays', `{{count}} active days`, { count: activeDays })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-purple-500/10">
                      <div className="text-xs text-muted-foreground text-center py-1">
                        {t('gpuReservations.utilization.noData', 'No usage data yet')}
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
              {filteredReservations.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  {showOnlyMine ? t('gpuReservations.overview.noReservationsUser') : t('gpuReservations.overview.noReservationsYet')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
            <div className="flex items-center justify-center gap-4 mb-4">
              {(['prev', 'heading', 'next'] as const).map(item => {
                if (item === 'heading') return (
                  <h3 key="heading" className="text-lg font-medium text-foreground min-w-[180px] text-center">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </h3>
                )
                const isNext = item === 'next'
                return (
                  <button key={item} onClick={isNext ? nextMonth : prevMonth}
                    className="p-2 min-h-11 min-w-11 rounded-lg hover:bg-secondary transition-colors"
                    aria-label={isNext ? 'Next month' : 'Previous month'}>
                    {isNext ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                  </button>
                )
              })}
            </div>
            <div className="border border-border/50 rounded-lg overflow-hidden">
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 border-b border-border/50">
                {([
                  'gpuReservations.calendar.days.sun',
                  'gpuReservations.calendar.days.mon',
                  'gpuReservations.calendar.days.tue',
                  'gpuReservations.calendar.days.wed',
                  'gpuReservations.calendar.days.thu',
                  'gpuReservations.calendar.days.fri',
                  'gpuReservations.calendar.days.sat',
                ] as const).map(key => (
                  <div key={key} className="px-2 py-2 text-center text-sm font-medium text-muted-foreground border-r border-border/30 last:border-r-0">{t(key)}</div>
                ))}
              </div>

              {/* Week rows */}
              {calendarWeeks.map((week, weekIdx) => {
                const maxRow = Math.max(0, ...week.bars.map(b => b.row))
                const barAreaHeight = Math.max(MAX_VISIBLE_ROWS, maxRow + 1)

                return (
                  <div key={weekIdx} className="border-b border-border/30 last:border-b-0">
                    {/* Day number row + GPU counts */}
                    <div className="grid grid-cols-7">
                      {week.days.map((day, col) => {
                        if (day === null) return <div key={col} className="px-2 py-1.5 border-r border-border/30 last:border-r-0 bg-secondary/20" />
                        const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString()
                        const gpuCount = getGPUCountForDay(day)
                        return (
                          <div key={col} className={cn(
                            'px-2 py-1.5 border-r border-border/30 last:border-r-0',
                            isToday && 'bg-purple-500/10'
                          )}>
                            <div className="flex items-center justify-between">
                              <span className={cn('text-sm font-medium', isToday ? 'text-purple-400' : 'text-foreground')}>{day}</span>
                              {gpuCount > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground">{t('gpuReservations.calendar.gpusCount', { count: gpuCount })}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Reservation bars area */}
                    <div className="group/bars relative grid grid-cols-7" style={{ minHeight: `${barAreaHeight * 24 + 8}px` }}>
                      {/* Column borders */}
                      {week.days.map((_, col) => (
                        <div key={col} className="border-r border-border/30 last:border-r-0" />
                      ))}

                      {/* "+" button per day - bottom right */}
                      {week.days.map((day, col) => {
                        if (day === null) return null
                        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        return (
                          <button
                            key={`add-${day}`}
                            onClick={() => { setPrefillDate(dateStr); setEditingReservation(null); setShowReservationForm(true) }}
                            className="absolute w-5 h-5 flex items-center justify-center rounded bg-purple-500/20 text-purple-400 opacity-0 group-hover/bars:opacity-60 hover:!opacity-100 hover:bg-purple-500/40 transition-all z-10"
                            style={{
                              left: `calc(${((col + 1) / 7) * 100}% - 24px)`,
                              bottom: '4px',
                            }}
                            aria-label={`Add reservation on ${dateStr}`}
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" />
                          </button>
                        )
                      })}

                      {/* Spanning bars */}
                      {week.bars.map((bar, barIdx) => {
                        const isActive = bar.reservation.status === 'active'
                        const isPending = bar.reservation.status === 'pending'
                        const isInactive = bar.reservation.status === 'completed' || bar.reservation.status === 'cancelled'

                        return (
                          <button
                            key={`${bar.reservation.id}-${weekIdx}-${barIdx}`}
                            onClick={() => setExpandedReservationId(expandedReservationId === bar.reservation.id ? null : bar.reservation.id)}
                            className={cn(
                              'absolute flex items-center gap-1.5 px-2 text-xs font-medium truncate cursor-pointer transition-opacity hover:opacity-90',
                              'h-[20px]',
                              isInactive
                                ? 'bg-secondary/80 text-muted-foreground'
                                : isActive
                                  ? 'bg-purple-500/30 text-purple-300'
                                  : 'bg-yellow-500/20 text-yellow-300',
                              bar.isStart ? 'rounded-l-md' : '',
                              bar.isEnd ? 'rounded-r-md' : '',
                            )}
                            style={{
                              left: `calc(${(bar.startCol / 7) * 100}% + 2px)`,
                              width: `calc(${(bar.spanCols / 7) * 100}% - 4px)`,
                              top: `${bar.row * 24 + 4}px`,
                            }}
                            title={`${bar.reservation.title} (${bar.reservation.gpu_count} GPUs, ${bar.reservation.status})`}
                            aria-label={`${bar.reservation.title}: ${bar.reservation.gpu_count} GPUs, ${bar.reservation.status}`}
                          >
                            {bar.isStart && (
                              <>
                                {isActive && <span className="inline-block w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />}
                                {isPending && <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />}
                              </>
                            )}
                            {bar.isStart ? bar.reservation.title : ''}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {/* Reservations Tab */}
      {activeTab === 'quotas' && (
        <div className="space-y-6">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('gpuReservations.searchPlaceholder', 'Search reservations...')}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>
          {/* Filter banner when showing only user's reservations */}
          {showOnlyMine && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="flex items-center gap-2 text-sm text-purple-300">
                <Filter className="w-4 h-4" />
                <span>{t('gpuReservations.filteringByUser', `Showing reservations for {{user}}`, { user: user?.github_login || 'you' })}</span>
              </div>
              <button
                onClick={() => setShowOnlyMine(false)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                <X className="w-3 h-3" />
                {t('common:common.clearFilter', 'Clear filter')}
              </button>
            </div>
          )}
          {filteredReservations.length === 0 && !reservationsLoading && (
            <div className={'glass p-8 rounded-lg text-center'}>
              <Settings2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">
                {showOnlyMine ? t('gpuReservations.overview.noReservationsUser') : t('gpuReservations.overview.noReservationsYet').split('"')[0]}
              </p>
              {!showOnlyMine && (
                <button onClick={() => { setEditingReservation(null); setShowReservationForm(true) }}
                  className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600">
                  {t('gpuReservations.createReservation')}
                </button>
              )}
            </div>
          )}
          <div className="grid gap-4">
            {filteredReservations.map(r => {
              const isExpanded = expandedReservationId === r.id
              return (
                <div key={r.id} className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Zap className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{r.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {r.namespace} · {r.user_name}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                        {r.status}
                      </span>
                      <ClusterBadge cluster={r.cluster} size="sm" />
                      <button onClick={() => setExpandedReservationId(isExpanded ? null : r.id)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                        aria-label={t('gpuReservations.list.viewReservation', { title: r.title })}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button onClick={() => { setEditingReservation(r); setShowReservationForm(true) }}
                        disabled={deleteConfirmId !== null || showReservationForm}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        aria-label={t('gpuReservations.list.editReservation', { title: r.title })}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirmId(r.id)}
                        disabled={deleteConfirmId !== null || showReservationForm}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        aria-label={t('gpuReservations.list.deleteReservation', { title: r.title })}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Reservation summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2 p-2 rounded bg-secondary/30">
                      <Zap className="w-3.5 h-3.5 text-purple-400" />
                      <div>
                        <div className="text-xs text-muted-foreground">{t('common:common.gpus')}</div>
                        <div className="text-sm font-medium text-foreground">{r.gpu_count}</div>
                      </div>
                    </div>
                    {r.gpu_type && (
                      <div className="p-2 rounded bg-secondary/30">
                        <div className="text-xs text-muted-foreground">{t('common:common.type')}</div>
                        <div className="text-sm font-medium text-foreground truncate">{r.gpu_type}</div>
                      </div>
                    )}
                    <div className="p-2 rounded bg-secondary/30">
                      <div className="text-xs text-muted-foreground">{t('common:common.start')}</div>
                      <div className="text-sm font-medium text-foreground">{r.start_date}</div>
                    </div>
                    <div className="p-2 rounded bg-secondary/30">
                      <div className="text-xs text-muted-foreground">{t('common:common.duration')}</div>
                      <div className="text-sm font-medium text-foreground">{r.duration_hours}h</div>
                    </div>
                  </div>

                  {/* GPU Utilization Sparkline */}
                  {(() => {
                    const snaps = (utilizations || {})[r.id] || []
                    if (snaps.length === 0) return (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="text-xs text-muted-foreground text-center py-1">
                          {t('gpuReservations.utilization.noData', 'No usage data yet')}
                        </div>
                      </div>
                    )
                    const avg = computeAvgUtilization(snaps)
                    const days = countActiveDays(snaps)
                    const color = getUtilizationColor(avg)
                    return (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <Sparkline
                          data={snaps.map(s => s.gpu_utilization_pct)}
                          color={color}
                          height={SPARKLINE_HEIGHT_PX}
                          fill
                        />
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span style={{ color }}>
                            {t('gpuReservations.utilization.avgGpu', `Avg {{pct}}% GPU`, { pct: avg })}
                          </span>
                          <span className="text-muted-foreground">
                            {t('gpuReservations.utilization.activeDays', `{{count}} active days`, { count: days })}
                          </span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Description and notes */}
                  {(r.description || r.notes) && (
                    <div className="mt-3 pt-3 border-t border-border/50 text-sm text-muted-foreground">
                      {r.description && <div>{r.description}</div>}
                      {r.notes && <div className="mt-1 italic">{r.notes}</div>}
                    </div>
                  )}

                  {/* Quota enforcement badge */}
                  {r.quota_enforced && r.quota_name && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('gpuReservations.list.k8sQuotaEnforced', { quotaName: r.quota_name })}
                    </div>
                  )}

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.user')}</div>
                          <div className="text-foreground">{r.user_name}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">{t('common:common.status')}</div>
                          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                            {r.status === 'active' && <span className="w-2 h-2 rounded-full bg-green-400" />}
                            {r.status}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">{t('common:common.namespace')}</div>
                          <div className="text-foreground">{r.namespace}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">{t('common:common.cluster')}</div>
                          <div className="text-foreground">{r.cluster}</div>
                        </div>
                        {r.quota_enforced && r.quota_name && (
                          <div>
                            <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.k8sQuota')}</div>
                            <div className="text-foreground">{r.quota_name}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.startDate')}</div>
                          <div className="text-foreground">{r.start_date}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">{t('common:common.duration')}</div>
                          <div className="text-foreground">{r.duration_hours} hours</div>
                        </div>
                        {r.description && (
                          <div className="col-span-2">
                            <div className="text-sm text-muted-foreground">{t('common:common.description')}</div>
                            <div className="text-foreground">{r.description}</div>
                          </div>
                        )}
                        {r.notes && (
                          <div className="col-span-2">
                            <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.notes')}</div>
                            <div className="text-foreground">{r.notes}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {nodesLoading && gpuClusters.length === 0 && (
            <div className="glass p-8 rounded-lg text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground animate-spin" />
              <div className="text-muted-foreground">{t('gpuReservations.inventory.loading', 'Loading GPU inventory...')}</div>
            </div>
          )}
          {gpuClusters.length === 0 && !nodesLoading && (
            <div className={'glass p-8 rounded-lg text-center'}>
              <Server className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <div className="text-muted-foreground">{t('gpuReservations.inventory.noGpuNodes')}</div>
            </div>
          )}
          {gpuClusters.map(cluster => {
            const clusterNodes = nodes.filter(n => n.cluster === cluster.name)
            return (
              <div key={cluster.name} className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ClusterBadge cluster={cluster.name} size="sm" />
                    <div className="text-sm text-muted-foreground">
                      {(cluster.gpuTypes || []).join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-foreground font-medium">{t('gpuReservations.inventory.total', { count: cluster.totalGPUs })}</span>
                    <span className="text-green-400">{t('gpuReservations.inventory.available', { count: cluster.availableGPUs })}</span>
                    <span className="text-yellow-400">{t('gpuReservations.inventory.allocated', { count: cluster.allocatedGPUs })}</span>
                  </div>
                </div>

                {/* Cluster utilization bar */}
                <div className="mb-4">
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div className={cn(
                      'h-full rounded-full transition-all',
                      (cluster.allocatedGPUs / cluster.totalGPUs * 100) > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' :
                      (cluster.allocatedGPUs / cluster.totalGPUs * 100) > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                    )} style={{ width: `${(cluster.allocatedGPUs / cluster.totalGPUs) * 100}%` }} />
                  </div>
                </div>

                {/* Node rows */}
                <div className="space-y-2">
                  {clusterNodes.map(node => {
                    const nodePercent = node.gpuCount > 0 ? (node.gpuAllocated / node.gpuCount) * 100 : 0
                    return (
                      <div key={node.name} className="flex items-center gap-4 p-2 rounded bg-secondary/30">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{node.name}</div>
                          <div className="text-xs text-muted-foreground">{node.gpuType}</div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-foreground">{node.gpuAllocated}/{node.gpuCount}</span>
                          <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                            <div className={cn(
                              'h-full rounded-full',
                              nodePercent > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' :
                              nodePercent > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                            )} style={{ width: `${nodePercent}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dashboard Tab — unified card grid with add/remove and drag reorder */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('gpuReservations.dashboard.customizable')}
            </p>
            <button
              onClick={() => setShowAddCardModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('gpuReservations.dashboard.addCard')}
            </button>
          </div>
          <DndContext
            sensors={gpuDashSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDashDragEnd}
          >
            <SortableContext items={dashCardIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-4">
                {dashboardCards.map((card, index) => (
                  <SortableGpuCard
                    key={dashCardIds[index]}
                    id={dashCardIds[index]}
                    card={card}
                    index={index}
                    forceLive={gpuLiveMode}
                    onRemove={() => handleRemoveDashboardCard(index)}
                    onWidthChange={(newWidth) => handleDashCardWidthChange(index, newWidth)}
                    onRefresh={triggerRefresh}
                    isRefreshing={isRefreshingDashboard}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {dashboardCards.length === 0 && (
            <div className="p-12 rounded-lg bg-card/50 border border-border text-center">
              <LayoutDashboard className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{t('gpuReservations.dashboard.noCardsYet')}</p>
              <button
                onClick={() => setShowAddCardModal(true)}
                className="mt-3 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600 transition-colors"
              >
                {t('gpuReservations.dashboard.addFirstCard')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardModal}
        onClose={() => setShowAddCardModal(false)}
        onAddCards={handleAddDashboardCards}
        existingCardTypes={dashboardCards.map(c => c.type)}
      />

      {/* Create/Edit Reservation Modal */}
      <ReservationFormModal
        isOpen={showReservationForm}
        onClose={() => { setShowReservationForm(false); setEditingReservation(null); setPrefillDate(null) }}
        editingReservation={editingReservation}
        gpuClusters={gpuClusters}
        allNodes={rawNodes}
        user={user}
        prefillDate={prefillDate}
        forceLive={gpuLiveMode}
        onSave={async (input) => {
          if (editingReservation) {
            await apiUpdateReservation(editingReservation.id, input as UpdateGPUReservationInput)
            return editingReservation.id
          } else {
            const created = await apiCreateReservation(input as CreateGPUReservationInput)
            return created.id
          }
        }}
        onActivate={async (id) => { await apiUpdateReservation(id, { status: 'active' }) }}
        onSaved={() => showToast(t('gpuReservations.form.success.saved'), 'success')}
        onError={(msg) => showToast(msg, 'error')}
      />

      {/* Delete Confirmation */}
      <BaseModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} size="sm">
        <BaseModal.Header title={t('gpuReservations.delete.title')} icon={Trash2} onClose={() => setDeleteConfirmId(null)} showBack={false} />
        <BaseModal.Content>
          <div className="text-muted-foreground">
            {t('gpuReservations.delete.confirmMessage')} <strong className="text-foreground">{deleteConfirmReservation?.title}</strong>?
          </div>
          <div className="text-sm text-red-400 mt-2">
            {t('gpuReservations.delete.cannotUndo')}
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex gap-3">
            {([
              { key: 'cancel', label: t('gpuReservations.delete.cancel'), onClick: () => setDeleteConfirmId(null), disabled: false, className: 'px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors' },
              { key: 'delete', label: t('gpuReservations.delete.delete'), onClick: handleDeleteReservation, disabled: isDeleting, className: 'flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors' },
            ] as const).map(({ key, label, onClick, disabled, className }) => (
              <button key={key} onClick={onClick} disabled={disabled} className={className}>
                {key === 'delete' && isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {label}
              </button>
            ))}
          </div>
        </BaseModal.Footer>
      </BaseModal>
    </div>
  )
}


