import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Calendar,
  Plus,
  Settings2,
  TrendingUp,
  FlaskConical,
  Trash2,
  Loader2,
  Server,
  Filter,
  User,
  LayoutDashboard } from 'lucide-react'
import { BaseModal, useModalState } from '../../lib/modals'
import {
  useGPUNodes,
  useResourceQuotas,
  useClusters } from '../../hooks/useMCP'
import { ReservationFormModal, type GPUClusterInfo } from './ReservationFormModal'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode, hasRealToken } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { cn } from '../../lib/cn'
import { getChartColor } from '../../lib/chartColors'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { getDefaultCardWidth } from '../cards/cardRegistry'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates } from '@dnd-kit/sortable'

// Extracted sub-components and constants
import {
  GPU_KEYS,
  MAX_NAME_DISPLAY_LENGTH } from './gpu-constants'
import type { GpuDashCard } from './SortableGpuCard'
import { DEFAULT_GPU_CARDS } from './SortableGpuCard'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import type { CalendarBar } from './GPUCalendarTab'
import { GPUReservationsTab } from './GPUReservationsTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'

export function GPUReservations() {
  const { t } = useTranslation(['cards', 'common'])
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
  const { isOpen: showAddCardModal, open: openAddCardModal, close: closeAddCardModal } = useModalState()

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
  // nor the /api/mcp/pods-based REST fallback sees it). See #3945.
  const knownNamespacesByCluster = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const r of (allReservations || [])) {
      if (!r.cluster || !r.namespace) continue
      if (!out[r.cluster]) out[r.cluster] = []
      if (!out[r.cluster].includes(r.namespace)) out[r.cluster].push(r.namespace)
    }
    return out
  }, [allReservations])

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
      color: getChartColor((i % 4) + 1) }))

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
      color: getChartColor((i % 4) + 1) }))

    // GPU allocation by cluster
    const clusterUsage = gpuClusters.map(c => ({
      name: c.name.length > MAX_NAME_DISPLAY_LENGTH ? c.name.slice(0, MAX_NAME_DISPLAY_LENGTH) + '...' : c.name,
      value: c.allocatedGPUs }))

    return {
      totalGPUs,
      allocatedGPUs,
      availableGPUs,
      utilizationPercent,
      activeReservations,
      reservedGPUs,
      typeChartData,
      usageByNamespace,
      clusterUsage }
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

  // Get the start/end day index (0-based from month start) for a reservation within the visible month.
  // Duration is added to the ORIGINAL start time first, then day boundaries are derived.
  const getReservationDayRange = (r: GPUReservation) => {
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
  }

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
  }, [filteredReservations, startingDay, daysInMonth, currentMonth, getReservationDayRange])

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
      showToast('GPU reservation deleted', 'success')
    } catch (err) {
      showToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }

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
            <StatusBadge color="yellow" variant="outline" rounded="full" icon={<FlaskConical className="w-3 h-3" />}>
              {t('gpuReservations.demo')}
            </StatusBadge>
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
                <StatusBadge color="purple" rounded="full">
                  {tab.count}
                </StatusBadge>
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
        <GPUOverviewTab
          stats={stats}
          filteredReservations={filteredReservations}
          utilizations={utilizations}
          effectiveDemoMode={effectiveDemoMode}
          showOnlyMine={showOnlyMine}
        />
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <GPUCalendarTab
          currentMonth={currentMonth}
          calendarWeeks={calendarWeeks}
          effectiveDemoMode={effectiveDemoMode}
          expandedReservationId={expandedReservationId}
          onSetExpandedReservationId={setExpandedReservationId}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onAddReservation={(dateStr) => { setPrefillDate(dateStr); setEditingReservation(null); setShowReservationForm(true) }}
          getGPUCountForDay={getGPUCountForDay}
        />
      )}

      {/* Reservations Tab */}
      {activeTab === 'quotas' && (
        <GPUReservationsTab
          filteredReservations={filteredReservations}
          utilizations={utilizations}
          effectiveDemoMode={effectiveDemoMode}
          showOnlyMine={showOnlyMine}
          searchTerm={searchTerm}
          reservationsLoading={reservationsLoading}
          expandedReservationId={expandedReservationId}
          deleteConfirmId={deleteConfirmId}
          showReservationForm={showReservationForm}
          user={user}
          onSetSearchTerm={setSearchTerm}
          onSetShowOnlyMine={setShowOnlyMine}
          onSetExpandedReservationId={setExpandedReservationId}
          onEditReservation={(r) => { setEditingReservation(r); setShowReservationForm(true) }}
          onDeleteReservation={setDeleteConfirmId}
          onCreateReservation={() => { setEditingReservation(null); setShowReservationForm(true) }}
        />
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <GPUInventoryTab
          gpuClusters={gpuClusters}
          nodes={nodes}
          nodesLoading={nodesLoading}
          effectiveDemoMode={effectiveDemoMode}
        />
      )}

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <GPUDashboardTab
          dashboardCards={dashboardCards}
          dashCardIds={dashCardIds}
          gpuDashSensors={gpuDashSensors}
          gpuLiveMode={gpuLiveMode}
          isRefreshingDashboard={isRefreshingDashboard}
          onDashDragEnd={handleDashDragEnd}
          onRemoveDashboardCard={handleRemoveDashboardCard}
          onDashCardWidthChange={handleDashCardWidthChange}
          onTriggerRefresh={triggerRefresh}
          onShowAddCardModal={openAddCardModal}
        />
      )}

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardModal}
        onClose={closeAddCardModal}
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
        knownNamespacesByCluster={knownNamespacesByCluster}
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
