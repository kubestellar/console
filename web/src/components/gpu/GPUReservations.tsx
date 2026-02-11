import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap,
  Calendar,
  Plus,
  X,
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
  Eye,
  Filter,
  User,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import {
  useGPUNodes,
  useResourceQuotas,
  useClusters,
  useNamespaces,
  createOrUpdateResourceQuota,
  COMMON_RESOURCE_TYPES,
} from '../../hooks/useMCP'
import type { GPUNode } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { DonutChart } from '../charts/PieChart'
import { BarChart } from '../charts/BarChart'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'
import { getChartColor, getChartColorByName } from '../../lib/chartColors'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'

// GPU utilization thresholds for visual indicators
const UTILIZATION_HIGH_THRESHOLD = 80
const UTILIZATION_MEDIUM_THRESHOLD = 50

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory'

// GPU resource keys used to identify GPU quotas
const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

// GPU cluster info for dropdown
interface GPUClusterInfo {
  name: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  gpuTypes: string[]
}

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export function GPUReservations() {
  useTranslation()
  const { nodes: rawNodes, isLoading: nodesLoading } = useGPUNodes()
  const { resourceQuotas } = useResourceQuotas()
  useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: demoMode } = useDemoMode()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showReservationForm, setShowReservationForm] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<GPUReservation | null>(null)
  const [editingReservation, setEditingReservation] = useState<GPUReservation | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [prefillDate, setPrefillDate] = useState<string | null>(null)

  const showDemoIndicator = demoMode

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
    if (isAllClustersSelected) return rawNodes
    return rawNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [rawNodes, selectedClusters, isAllClustersSelected])

  // GPU quotas from K8s (for overview stats only)
  const gpuQuotas = useMemo(() => {
    const filtered = resourceQuotas.filter(q =>
      Object.keys(q.hard).some(k => GPU_KEYS.some(gk => k.includes(gk)))
    )
    if (isAllClustersSelected) return filtered
    return filtered.filter(q => q.cluster && selectedClusters.some(c => q.cluster!.startsWith(c)))
  }, [resourceQuotas, selectedClusters, isAllClustersSelected])

  // Filtered reservations respecting "My Reservations" toggle and cluster selection
  const filteredReservations = useMemo(() => {
    let filtered = allReservations
    // Filter by cluster selection
    if (!isAllClustersSelected) {
      filtered = filtered.filter(r => selectedClusters.some(c => r.cluster.startsWith(c)))
    }
    // Filter by user
    if (showOnlyMine && user) {
      const login = user.github_login?.toLowerCase()
      filtered = filtered.filter(r => r.user_name.toLowerCase() === login)
    }
    return filtered
  }, [allReservations, showOnlyMine, user, selectedClusters, isAllClustersSelected])

  // Clusters with GPU info for the dropdown
  const gpuClusters = useMemo((): GPUClusterInfo[] => {
    const clusterMap: Record<string, GPUClusterInfo> = {}
    for (const node of rawNodes) {
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
      name: c.name.length > 12 ? c.name.slice(0, 12) + '...' : c.name,
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
          <h1 className="text-2xl font-bold text-foreground">GPU Reservations</h1>
          {showDemoIndicator && (
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <FlaskConical className="w-3 h-3" />
              Demo
            </span>
          )}
        </div>
        <p className="text-muted-foreground">Schedule and manage GPU resources across your clusters</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {[
          { id: 'overview' as const, label: 'Overview', icon: TrendingUp },
          { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
          { id: 'quotas' as const, label: 'Reservations', icon: Settings2, count: filteredReservations.length },
          { id: 'inventory' as const, label: 'Inventory', icon: Server },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors',
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
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
            <button
              onClick={() => setShowOnlyMine(!showOnlyMine)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                showOnlyMine
                  ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                  : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {showOnlyMine ? <User className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              My Reservations
            </button>
          )}
          <button
            onClick={() => { setEditingReservation(null); setShowReservationForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create GPU Reservation
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{stats.totalGPUs}</div>
                  <div className="text-xs text-muted-foreground">Total GPUs</div>
                </div>
              </div>
            </div>
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">{stats.availableGPUs}</div>
                  <div className="text-xs text-muted-foreground">Available</div>
                </div>
              </div>
            </div>
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Settings2 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{stats.activeReservations}</div>
                  <div className="text-xs text-muted-foreground">Active Reservations</div>
                </div>
              </div>
            </div>
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{stats.reservedGPUs}</div>
                  <div className="text-xs text-muted-foreground">Reserved GPUs</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Utilization */}
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GPU Utilization</h3>
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
                    <span className="text-xs text-muted-foreground">Used</span>
                  </div>
                </div>
              </div>
              <div className="text-center mt-4 text-sm text-muted-foreground">
                {stats.allocatedGPUs} of {stats.totalGPUs} GPUs allocated
              </div>
            </div>

            {/* GPU Types */}
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GPU Types</h3>
              {stats.typeChartData.length > 0 ? (
                <DonutChart data={stats.typeChartData} size={150} thickness={20} showLegend={true} />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">No GPU data</div>
              )}
            </div>

            {/* Usage by Namespace */}
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GPU Usage by Namespace</h3>
              {stats.usageByNamespace.length > 0 ? (
                <DonutChart data={stats.usageByNamespace} size={150} thickness={20} showLegend={true} />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">No GPU quotas with usage</div>
              )}
            </div>
          </div>

          {/* Cluster Allocation */}
          {stats.clusterUsage.length > 0 && (
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GPU Allocation by Cluster</h3>
              <BarChart data={stats.clusterUsage} height={200} color={getChartColorByName('primary')} showGrid={true} />
            </div>
          )}

          {/* Active Reservations */}
          <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {showOnlyMine ? 'My GPU Reservations' : 'Active GPU Reservations'}
            </h3>
            <div className="space-y-3">
              {filteredReservations.slice(0, 5).map(r => (
                <div key={r.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
                >
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
                      <div className="font-medium text-foreground">{r.gpu_count} <TechnicalAcronym term="GPU">GPUs</TechnicalAcronym></div>
                      <div className="text-sm text-muted-foreground">{r.duration_hours}h duration</div>
                    </div>
                    <span className={cn('px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                      {r.status}
                    </span>
                    <ClusterBadge cluster={r.cluster} size="sm" />
                  </div>
                </div>
              ))}
              {filteredReservations.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  {showOnlyMine ? 'No reservations found for your user.' : 'No GPU reservations yet. Click "Create GPU Reservation" to get started.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
            <div className="flex items-center justify-center gap-4 mb-4">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-medium text-foreground min-w-[180px] text-center">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Calendar Grid - Spanning Bars */}
            <div className="border border-border/50 rounded-lg overflow-hidden">
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 border-b border-border/50">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="px-2 py-2 text-center text-sm font-medium text-muted-foreground border-r border-border/30 last:border-r-0">{day}</div>
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
                                <span className="text-[10px] font-medium text-muted-foreground">GPUs: {gpuCount}</span>
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
                          >
                            <Plus className="w-3 h-3" />
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
                            onClick={() => setSelectedReservation(bar.reservation)}
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

          {/* Selected Reservation Details */}
          {selectedReservation && (
            <div className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-foreground">Reservation Details</h3>
                <button onClick={() => setSelectedReservation(null)} className="p-1 rounded hover:bg-secondary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Title</div>
                  <div className="text-foreground font-medium">{selectedReservation.title}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[selectedReservation.status] || STATUS_COLORS.pending)}>
                    {(selectedReservation.status === 'active') && <span className="w-2 h-2 rounded-full bg-green-400" />}
                    {selectedReservation.status}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">User</div>
                  <div className="text-foreground">{selectedReservation.user_name}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Namespace</div>
                  <div className="text-foreground">{selectedReservation.namespace}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">GPUs</div>
                  <div className="text-foreground">{selectedReservation.gpu_count}</div>
                </div>
                {selectedReservation.gpu_type && (
                  <div>
                    <div className="text-sm text-muted-foreground">GPU Type</div>
                    <div className="text-foreground">{selectedReservation.gpu_type}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Start Date</div>
                  <div className="text-foreground">{selectedReservation.start_date}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Duration</div>
                  <div className="text-foreground">{selectedReservation.duration_hours} hours</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Cluster</div>
                  <div className="text-foreground">{selectedReservation.cluster}</div>
                </div>
                {selectedReservation.quota_enforced && selectedReservation.quota_name && (
                  <div>
                    <div className="text-sm text-muted-foreground">K8s Quota</div>
                    <div className="text-foreground">{selectedReservation.quota_name}</div>
                  </div>
                )}
                {selectedReservation.description && (
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">Description</div>
                    <div className="text-foreground">{selectedReservation.description}</div>
                  </div>
                )}
                {selectedReservation.notes && (
                  <div className="col-span-2">
                    <div className="text-sm text-muted-foreground">Notes</div>
                    <div className="text-foreground">{selectedReservation.notes}</div>
                  </div>
                )}
                {/* Actions */}
                <div className="col-span-2 flex gap-3 pt-2 border-t border-border">
                  <button onClick={() => { setEditingReservation(selectedReservation); setShowReservationForm(true); setSelectedReservation(null) }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-purple-400 hover:bg-purple-500/10">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button onClick={() => { setDeleteConfirmId(selectedReservation.id); setSelectedReservation(null) }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reservations Tab */}
      {activeTab === 'quotas' && (
        <div className="space-y-6">
          {filteredReservations.length === 0 && !reservationsLoading && (
            <div className={cn('glass p-8 rounded-lg text-center', demoMode && 'border-2 border-yellow-500/50')}>
              <Settings2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">
                {showOnlyMine ? 'No reservations found for your user.' : 'No GPU reservations yet'}
              </p>
              {!showOnlyMine && (
                <button onClick={() => { setEditingReservation(null); setShowReservationForm(true) }}
                  className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600">
                  Create GPU Reservation
                </button>
              )}
            </div>
          )}
          <div className="grid gap-4">
            {filteredReservations.map(r => (
              <div key={r.id} className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
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
                    <button onClick={() => setSelectedReservation(r)}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setEditingReservation(r); setShowReservationForm(true) }}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-purple-400">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteConfirmId(r.id)}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Reservation details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="flex items-center gap-2 p-2 rounded bg-secondary/30">
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    <div>
                      <div className="text-xs text-muted-foreground">GPUs</div>
                      <div className="text-sm font-medium text-foreground">{r.gpu_count}</div>
                    </div>
                  </div>
                  {r.gpu_type && (
                    <div className="p-2 rounded bg-secondary/30">
                      <div className="text-xs text-muted-foreground">Type</div>
                      <div className="text-sm font-medium text-foreground truncate">{r.gpu_type}</div>
                    </div>
                  )}
                  <div className="p-2 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div className="text-sm font-medium text-foreground">{r.start_date}</div>
                  </div>
                  <div className="p-2 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="text-sm font-medium text-foreground">{r.duration_hours}h</div>
                  </div>
                </div>

                {/* Description and notes */}
                {(r.description || r.notes) && (
                  <div className="mt-3 pt-3 border-t border-border/50 text-sm text-muted-foreground">
                    {r.description && <p>{r.description}</p>}
                    {r.notes && <p className="mt-1 italic">{r.notes}</p>}
                  </div>
                )}

                {/* Quota enforcement badge */}
                {r.quota_enforced && r.quota_name && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                    <CheckCircle2 className="w-3 h-3" />
                    K8s ResourceQuota enforced: {r.quota_name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {gpuClusters.length === 0 && !nodesLoading && (
            <div className={cn('glass p-8 rounded-lg text-center', demoMode && 'border-2 border-yellow-500/50')}>
              <Server className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No GPU nodes found across clusters</p>
            </div>
          )}
          {gpuClusters.map(cluster => {
            const clusterNodes = nodes.filter(n => n.cluster === cluster.name)
            return (
              <div key={cluster.name} className={cn('glass p-4 rounded-lg', demoMode && 'border-2 border-yellow-500/50')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <ClusterBadge cluster={cluster.name} size="sm" />
                    <div className="text-sm text-muted-foreground">
                      {cluster.gpuTypes.join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-foreground font-medium">{cluster.totalGPUs} total</span>
                    <span className="text-green-400">{cluster.availableGPUs} available</span>
                    <span className="text-yellow-400">{cluster.allocatedGPUs} allocated</span>
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

      {/* Create/Edit Reservation Modal */}
      {showReservationForm && (
        <ReservationFormModal
          isOpen={showReservationForm}
          onClose={() => { setShowReservationForm(false); setEditingReservation(null); setPrefillDate(null) }}
          editingReservation={editingReservation}
          gpuClusters={gpuClusters}
          allNodes={rawNodes}
          user={user}
          prefillDate={prefillDate}
          onSave={async (input) => {
            if (editingReservation) {
              await apiUpdateReservation(editingReservation.id, input as UpdateGPUReservationInput)
            } else {
              await apiCreateReservation(input as CreateGPUReservationInput)
            }
          }}
          onSaved={() => showToast('GPU reservation saved successfully', 'success')}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Delete Confirmation */}
      <BaseModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} size="sm">
        <BaseModal.Header title="Delete Reservation" icon={Trash2} onClose={() => setDeleteConfirmId(null)} showBack={false} />
        <BaseModal.Content>
          <p className="text-muted-foreground">
            Are you sure you want to delete the reservation <strong className="text-foreground">{deleteConfirmReservation?.title}</strong>?
          </p>
          <p className="text-sm text-red-400 mt-2">
            This action cannot be undone.
          </p>
        </BaseModal.Content>
        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex gap-3">
            <button onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button onClick={handleDeleteReservation} disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </div>
        </BaseModal.Footer>
      </BaseModal>
    </div>
  )
}

// Reservation Form Modal
function ReservationFormModal({
  isOpen,
  onClose,
  editingReservation,
  gpuClusters,
  allNodes,
  user,
  prefillDate,
  onSave,
  onSaved,
  onError,
}: {
  isOpen: boolean
  onClose: () => void
  editingReservation: GPUReservation | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  onSave: (input: CreateGPUReservationInput | UpdateGPUReservationInput) => Promise<void>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [cluster, setCluster] = useState(editingReservation?.cluster || '')
  const [namespace, setNamespace] = useState(editingReservation?.namespace || '')
  const [title, setTitle] = useState(editingReservation?.title || '')
  const [description, setDescription] = useState(editingReservation?.description || '')
  const [gpuCount, setGpuCount] = useState(editingReservation ? String(editingReservation.gpu_count) : '')
  const [gpuPreference, setGpuPreference] = useState(editingReservation?.gpu_type || '')
  const [startDate, setStartDate] = useState(editingReservation?.start_date || prefillDate || new Date().toISOString().split('T')[0])
  const [durationHours, setDurationHours] = useState(editingReservation ? String(editingReservation.duration_hours) : '')
  const [notes, setNotes] = useState(editingReservation?.notes || '')
  const enforceQuota = true
  const [extraResources, setExtraResources] = useState<Array<{ key: string; value: string }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { namespaces: rawNamespaces } = useNamespaces(cluster || undefined)

  // Filter out system namespaces from the dropdown
  const FILTERED_NS_PREFIXES = ['openshift-', 'kube-']
  const FILTERED_NS_EXACT = ['default', 'kube-system', 'kube-public', 'kube-node-lease']
  const clusterNamespaces = useMemo(() =>
    rawNamespaces.filter(ns =>
      !FILTERED_NS_PREFIXES.some(prefix => ns.startsWith(prefix)) &&
      !FILTERED_NS_EXACT.includes(ns)
    ),
  [rawNamespaces])

  // Get the selected cluster's GPU info
  const selectedClusterInfo = gpuClusters.find(c => c.name === cluster)
  const maxGPUs = selectedClusterInfo?.availableGPUs ?? 0

  // Auto-detect GPU resource key from cluster's GPU types
  const gpuResourceKey = useMemo(() => {
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'))
    const hasIntel = clusterNodes.some(n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'))
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  }, [cluster, allNodes])

  // GPU types available on selected cluster with per-type counts
  const clusterGPUTypes = useMemo(() => {
    if (!cluster) return [] as Array<{ type: string; total: number; available: number }>
    const typeMap: Record<string, { total: number; allocated: number }> = {}
    for (const n of allNodes.filter(n => n.cluster === cluster)) {
      if (!typeMap[n.gpuType]) typeMap[n.gpuType] = { total: 0, allocated: 0 }
      typeMap[n.gpuType].total += n.gpuCount
      typeMap[n.gpuType].allocated += n.gpuAllocated
    }
    return Object.entries(typeMap).map(([type, d]) => ({
      type,
      total: d.total,
      available: d.total - d.allocated,
    }))
  }, [cluster, allNodes])

  // Auto-generate quota name from title
  const quotaName = title
    ? `gpu-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`
    : ''

  const handleSave = async () => {
    setError(null)
    if (!cluster) { setError('Select a cluster'); return }
    if (!namespace) { setError('Select a namespace'); return }
    if (!title) { setError('Title is required'); return }
    const count = parseInt(gpuCount)
    if (!count || count < 1) { setError('GPU count must be at least 1'); return }
    if (count > maxGPUs && !editingReservation) { setError(`Only ${maxGPUs} GPUs available on ${cluster}`); return }

    setIsSaving(true)
    try {
      if (editingReservation) {
        // Partial update
        const input: UpdateGPUReservationInput = {
          title,
          description,
          cluster,
          namespace,
          gpu_count: count,
          gpu_type: gpuPreference || clusterGPUTypes[0]?.type || '',
          start_date: startDate,
          duration_hours: parseInt(durationHours) || 24,
          notes,
          quota_enforced: enforceQuota,
          quota_name: enforceQuota ? quotaName : '',
          max_cluster_gpus: selectedClusterInfo?.totalGPUs,
        }
        await onSave(input)
      } else {
        // Create
        const input: CreateGPUReservationInput = {
          title,
          description,
          cluster,
          namespace,
          gpu_count: count,
          gpu_type: gpuPreference || clusterGPUTypes[0]?.type || '',
          start_date: startDate,
          duration_hours: parseInt(durationHours) || 24,
          notes,
          quota_enforced: enforceQuota,
          quota_name: enforceQuota ? quotaName : '',
          max_cluster_gpus: selectedClusterInfo?.totalGPUs,
        }
        await onSave(input)
      }

      // Optionally create K8s ResourceQuota for enforcement
      if (enforceQuota) {
        try {
          const hard: Record<string, string> = {
            [gpuResourceKey]: String(count),
          }
          for (const r of extraResources) {
            if (r.key && r.value) hard[r.key] = r.value
          }
          await createOrUpdateResourceQuota({ cluster, namespace, name: quotaName, hard })
        } catch {
          // Non-fatal: reservation is saved, but quota enforcement failed
          onError('Reservation saved, but K8s quota creation failed. You can retry from the edit form.')
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save reservation'
      setError(msg)
      onError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title={editingReservation ? 'Edit GPU Reservation' : 'Create GPU Reservation'}
        icon={Calendar}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content className="max-h-[70vh]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Title of Experiment *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g., LLM Fine-tuning Job"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* User info (read-only from auth) */}
          {user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">User Name</label>
                <input type="text" value={user.email || user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">GitHub Handle</label>
                <input type="text" value={user.github_login} readOnly
                  className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Describe your experiment or workload..."
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Cluster (GPU-only, with counts) */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Cluster *</label>
            <select value={cluster} onChange={e => { setCluster(e.target.value); setNamespace(''); setGpuPreference('') }}
              disabled={!!editingReservation}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50">
              <option value="">Select cluster...</option>
              {gpuClusters.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} — {c.availableGPUs} available / {c.totalGPUs} total GPUs
                </option>
              ))}
            </select>
            {gpuClusters.length === 0 && (
              <p className="text-xs text-yellow-400 mt-1">No clusters with GPUs found</p>
            )}
          </div>

          {/* Namespace */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Namespace *</label>
            <select value={namespace} onChange={e => setNamespace(e.target.value)}
              disabled={!!editingReservation || !cluster}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground disabled:opacity-50">
              <option value="">Select namespace...</option>
              {clusterNamespaces.map(ns => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>

          {/* GPU Count */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Total GPUs Required *
              {selectedClusterInfo && (
                <span className="text-xs text-green-400 ml-2">
                  (max {selectedClusterInfo.availableGPUs} available)
                </span>
              )}
            </label>
            <input type="number" value={gpuCount} onChange={e => setGpuCount(e.target.value)}
              min="1" max={maxGPUs || undefined}
              placeholder="e.g., 4"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* GPU Type Selection (only when cluster has multiple types) */}
          {clusterGPUTypes.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">GPU Type</label>
              <div className="flex flex-wrap gap-2">
                {clusterGPUTypes.map(gt => (
                  <button key={gt.type} type="button"
                    onClick={() => setGpuPreference(gt.type)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors',
                      gpuPreference === gt.type
                        ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                        : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                    )}>
                    <Zap className="w-3.5 h-3.5" />
                    {gt.type}
                    <span className="text-xs opacity-70">({gt.available}/{gt.total})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Single GPU type — show as info */}
          {clusterGPUTypes.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              {clusterGPUTypes[0].type}
              <span className="text-xs">({clusterGPUTypes[0].available} of {clusterGPUTypes[0].total} available)</span>
            </div>
          )}

          {/* Start Date and Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Expected Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Expected Duration (hours)</label>
              <input type="number" value={durationHours} onChange={e => setDurationHours(e.target.value)}
                min="1" placeholder="e.g., 24"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>

          {/* Additional Resource Limits */}
          {enforceQuota && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-muted-foreground">Additional Resource Limits (optional)</label>
                <button onClick={() => setExtraResources([...extraResources, { key: '', value: '' }])}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {extraResources.map((r, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select value={r.key} onChange={e => {
                    const updated = [...extraResources]
                    updated[i].key = e.target.value
                    setExtraResources(updated)
                  }} className="flex-1 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground">
                    <option value="">Select resource...</option>
                    {COMMON_RESOURCE_TYPES.filter(rt => !GPU_KEYS.some(gk => rt.key.includes(gk))).map(rt => (
                      <option key={rt.key} value={rt.key}>{rt.label}</option>
                    ))}
                  </select>
                  <input type="text" value={r.value} onChange={e => {
                    const updated = [...extraResources]
                    updated[i].value = e.target.value
                    setExtraResources(updated)
                  }} placeholder="e.g., 8Gi" className="w-24 px-2 py-1.5 rounded bg-secondary border border-border text-sm text-foreground" />
                  <button onClick={() => setExtraResources(extraResources.filter((_, j) => j !== i))}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Additional Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any additional context..."
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs font-medium text-purple-400 mb-1">Reservation Preview</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Title: <span className="text-foreground">{title || '...'}</span></div>
              <div>Cluster: <span className="text-foreground">{cluster || '...'}</span></div>
              <div>Namespace: <span className="text-foreground">{namespace || '...'}</span></div>
              <div>GPUs: <span className="text-foreground">{gpuCount || '...'}</span></div>
              <div>Start: <span className="text-foreground">{startDate || '...'}</span></div>
              <div>Duration: <span className="text-foreground">{durationHours || '24'}h</span></div>
              {enforceQuota && (
                <div>K8s Quota: <span className="text-foreground">{quotaName || '...'} ({gpuResourceKey})</span></div>
              )}
            </div>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingReservation ? 'Update Reservation' : 'Create Reservation'}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
