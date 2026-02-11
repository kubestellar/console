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
  deleteResourceQuota,
  COMMON_RESOURCE_TYPES,
} from '../../hooks/useMCP'
import type { ResourceQuota, GPUNode } from '../../hooks/useMCP'
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

// GPU utilization thresholds for visual indicators
const UTILIZATION_HIGH_THRESHOLD = 80
const UTILIZATION_MEDIUM_THRESHOLD = 50

// Annotation prefix for reservation metadata stored on ResourceQuotas
const ANNOTATION_PREFIX = 'gpu-reservation.kubestellar.io/'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory'

// GPU resource keys used to identify GPU quotas
const GPU_KEYS = ['nvidia.com/gpu', 'amd.com/gpu', 'gpu.intel.com/i915']

// Check if a ResourceQuota contains GPU resource limits
function isGPUQuota(quota: ResourceQuota): boolean {
  return Object.keys(quota.hard).some(k => GPU_KEYS.some(gk => k.includes(gk)))
}

// Extract reservation metadata from quota annotations
function getReservationMeta(quota: ResourceQuota) {
  const a = quota.annotations || {}
  const prefix = ANNOTATION_PREFIX
  return {
    title: a[`${prefix}title`] || quota.name,
    user: a[`${prefix}user`] || '',
    fullName: a[`${prefix}full-name`] || '',
    description: a[`${prefix}description`] || '',
    startDate: a[`${prefix}start-date`] || '',
    durationHours: a[`${prefix}duration-hours`] || '',
    gpuPreference: a[`${prefix}gpu-preference`] || '',
    notes: a[`${prefix}notes`] || '',
    createdAt: a[`${prefix}created-at`] || '',
    isReservation: !!a[`${prefix}title`],
  }
}

// Get total GPU count from a quota's hard limits
function getGPUCount(quota: ResourceQuota): number {
  let total = 0
  for (const [key, value] of Object.entries(quota.hard)) {
    if (GPU_KEYS.some(gk => key.includes(gk))) {
      total += parseInt(value) || 0
    }
  }
  return total
}

// GPU cluster info for dropdown
interface GPUClusterInfo {
  name: string
  totalGPUs: number
  allocatedGPUs: number
  availableGPUs: number
  gpuTypes: string[]
}

export function GPUReservations() {
  useTranslation()
  const { nodes: rawNodes, isLoading: nodesLoading } = useGPUNodes()
  const { resourceQuotas, isLoading: quotasLoading, refetch: refetchQuotas } = useResourceQuotas()
  useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: demoMode } = useDemoMode()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showReservationForm, setShowReservationForm] = useState(false)
  const [selectedQuota, setSelectedQuota] = useState<ResourceQuota | null>(null)
  const [editingQuota, setEditingQuota] = useState<ResourceQuota | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ cluster: string; namespace: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [prefillDate, setPrefillDate] = useState<string | null>(null)

  const showDemoIndicator = demoMode

  // Filter nodes by global cluster selection
  const nodes = useMemo(() => {
    if (isAllClustersSelected) return rawNodes
    return rawNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [rawNodes, selectedClusters, isAllClustersSelected])

  // GPU quotas only (quotas containing GPU resource keys)
  const gpuQuotas = useMemo(() => {
    const filtered = resourceQuotas.filter(isGPUQuota)
    if (isAllClustersSelected) return filtered
    return filtered.filter(q => q.cluster && selectedClusters.some(c => q.cluster!.startsWith(c)))
  }, [resourceQuotas, selectedClusters, isAllClustersSelected])

  // Filtered quotas respecting "My Reservations" toggle
  const filteredQuotas = useMemo(() => {
    if (!showOnlyMine || !user) return gpuQuotas
    const login = user.github_login?.toLowerCase()
    const email = user.email?.toLowerCase()
    return gpuQuotas.filter(q => {
      const meta = getReservationMeta(q)
      const qUser = meta.user.toLowerCase()
      return (login && qUser.includes(login)) || (email && qUser.includes(email))
    })
  }, [gpuQuotas, showOnlyMine, user])

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
    // Only return clusters with GPUs
    return Object.values(clusterMap).filter(c => c.totalGPUs > 0)
  }, [rawNodes])

  // GPU stats
  const stats = useMemo(() => {
    const totalGPUs = nodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = nodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const availableGPUs = totalGPUs - allocatedGPUs
    const utilizationPercent = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0

    const activeQuotas = gpuQuotas.length
    const reservedGPUs = gpuQuotas.reduce((sum, q) => sum + getGPUCount(q), 0)

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
      activeQuotas,
      reservedGPUs,
      typeChartData,
      usageByNamespace,
      clusterUsage,
    }
  }, [nodes, gpuQuotas, gpuClusters])

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

  // Get quotas that overlap with a specific day (using creation date and duration from annotations)
  const getQuotasForDay = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    return filteredQuotas.filter(q => {
      const meta = getReservationMeta(q)
      if (meta.startDate) {
        const start = new Date(meta.startDate)
        start.setHours(0, 0, 0, 0)
        const durationHours = parseInt(meta.durationHours) || 24
        const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
        end.setHours(23, 59, 59, 999)
        return date >= start && date <= end
      }
      // Quotas without reservation metadata — show on creation date
      if (q.age) {
        // age format like "5d", "2h" - parse to approximate date
        const created = parseAgeToDate(q.age)
        if (created) {
          created.setHours(0, 0, 0, 0)
          return date.getTime() === created.getTime()
        }
      }
      return false
    })
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  // Handlers
  const handleDeleteQuota = useCallback(async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await deleteResourceQuota(deleteConfirm.cluster, deleteConfirm.namespace, deleteConfirm.name)
      showToast(`GPU quota "${deleteConfirm.name}" deleted`, 'success')
      refetchQuotas()
    } catch (err) {
      showToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsDeleting(false)
      setDeleteConfirm(null)
    }
  }, [deleteConfirm, showToast, refetchQuotas])

  const isLoading = nodesLoading && nodes.length === 0 && quotasLoading

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
          { id: 'quotas' as const, label: 'Reservations', icon: Settings2, count: gpuQuotas.length },
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
            onClick={() => { setEditingQuota(null); setShowReservationForm(true) }}
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
            <div className="glass p-4 rounded-lg">
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
            <div className="glass p-4 rounded-lg">
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
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Settings2 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{stats.activeQuotas}</div>
                  <div className="text-xs text-muted-foreground">GPU Quotas</div>
                </div>
              </div>
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{stats.reservedGPUs}</div>
                  <div className="text-xs text-muted-foreground">Reserved (Quota Limits)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Utilization */}
            <div className="glass p-4 rounded-lg">
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
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GPU Types</h3>
              {stats.typeChartData.length > 0 ? (
                <DonutChart data={stats.typeChartData} size={150} thickness={20} showLegend={true} />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">No GPU data</div>
              )}
            </div>

            {/* Usage by Namespace */}
            <div className="glass p-4 rounded-lg">
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
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GPU Allocation by Cluster</h3>
              <BarChart data={stats.clusterUsage} height={200} color={getChartColorByName('primary')} showGrid={true} />
            </div>
          )}

          {/* Active Reservations */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {showOnlyMine ? 'My GPU Reservations' : 'Active GPU Reservations'}
            </h3>
            <div className="space-y-3">
              {filteredQuotas.slice(0, 5).map(q => {
                const meta = getReservationMeta(q)
                const gpuCount = getGPUCount(q)
                return (
                  <div key={`${q.cluster}-${q.namespace}-${q.name}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Zap className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{meta.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {q.namespace} {meta.user && `· ${meta.user}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-medium text-foreground">{gpuCount} <TechnicalAcronym term="GPU">GPUs</TechnicalAcronym></div>
                        {meta.durationHours && (
                          <div className="text-sm text-muted-foreground">{meta.durationHours}h duration</div>
                        )}
                      </div>
                      {q.cluster && <ClusterBadge cluster={q.cluster} size="sm" />}
                    </div>
                  </div>
                )
              })}
              {filteredQuotas.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  {showOnlyMine ? 'No reservations found for your user.' : 'No GPU reservations configured. Click "Create GPU Reservation" to get started.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="glass p-4 rounded-lg">
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

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">{day}</div>
              ))}

              {Array.from({ length: startingDay }).map((_, i) => (
                <div key={`empty-${i}`} className="p-2 min-h-[120px]" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayQuotas = getQuotasForDay(day)
                const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString()
                const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

                return (
                  <div key={day} className={cn(
                    'group relative p-2 min-h-[120px] rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors',
                    isToday && 'bg-purple-500/10 border-purple-500/50'
                  )}>
                    <div className={cn('text-sm font-medium mb-1', isToday ? 'text-purple-400' : 'text-foreground')}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayQuotas.slice(0, 3).map(q => {
                        const meta = getReservationMeta(q)
                        const gpuCount = getGPUCount(q)
                        return (
                          <button key={`${q.cluster}-${q.namespace}-${q.name}`}
                            onClick={() => setSelectedQuota(q)}
                            className="w-full text-left px-1.5 py-0.5 rounded text-xs truncate bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                          >
                            {gpuCount}× {meta.title.slice(0, 12)}
                          </button>
                        )
                      })}
                      {dayQuotas.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center">+{dayQuotas.length - 3} more</div>
                      )}
                    </div>
                    {/* Add reservation button */}
                    <button
                      onClick={() => { setPrefillDate(dateStr); setEditingQuota(null); setShowReservationForm(true) }}
                      className="absolute bottom-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded bg-purple-500/20 text-purple-400 opacity-0 group-hover:opacity-100 hover:bg-purple-500/40 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected Quota Details */}
          {selectedQuota && (
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-foreground">Reservation Details</h3>
                <button onClick={() => setSelectedQuota(null)} className="p-1 rounded hover:bg-secondary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {(() => {
                const meta = getReservationMeta(selectedQuota)
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Title</div>
                      <div className="text-foreground font-medium">{meta.title}</div>
                    </div>
                    {meta.fullName && (
                      <div>
                        <div className="text-sm text-muted-foreground">Full Name</div>
                        <div className="text-foreground">{meta.fullName}</div>
                      </div>
                    )}
                    {meta.user && (
                      <div>
                        <div className="text-sm text-muted-foreground">User</div>
                        <div className="text-foreground">{meta.user}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground">Namespace</div>
                      <div className="text-foreground">{selectedQuota.namespace}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">GPUs</div>
                      <div className="text-foreground">{getGPUCount(selectedQuota)}</div>
                    </div>
                    {meta.gpuPreference && (
                      <div>
                        <div className="text-sm text-muted-foreground">GPU Preference</div>
                        <div className="text-foreground">{meta.gpuPreference}</div>
                      </div>
                    )}
                    {meta.startDate && (
                      <div>
                        <div className="text-sm text-muted-foreground">Start Date</div>
                        <div className="text-foreground">{meta.startDate}</div>
                      </div>
                    )}
                    {meta.durationHours && (
                      <div>
                        <div className="text-sm text-muted-foreground">Duration</div>
                        <div className="text-foreground">{meta.durationHours} hours</div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground">Cluster</div>
                      <div className="text-foreground">{selectedQuota.cluster}</div>
                    </div>
                    {meta.description && (
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground">Description</div>
                        <div className="text-foreground">{meta.description}</div>
                      </div>
                    )}
                    {meta.notes && (
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground">Notes</div>
                        <div className="text-foreground">{meta.notes}</div>
                      </div>
                    )}
                    {/* Resource limits */}
                    <div className="col-span-2">
                      <div className="text-sm text-muted-foreground mb-2">Resource Limits</div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(selectedQuota.hard).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                            <span className="text-sm text-muted-foreground">{key}</span>
                            <span className="text-sm font-medium text-foreground">
                              {selectedQuota.used?.[key] || '0'} / {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="col-span-2 flex gap-3 pt-2 border-t border-border">
                      <button onClick={() => { setEditingQuota(selectedQuota); setShowReservationForm(true); setSelectedQuota(null) }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-purple-400 hover:bg-purple-500/10">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => { setDeleteConfirm({ cluster: selectedQuota.cluster!, namespace: selectedQuota.namespace, name: selectedQuota.name }); setSelectedQuota(null) }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-red-400 hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* GPU Quotas Tab */}
      {activeTab === 'quotas' && (
        <div className="space-y-6">
          {filteredQuotas.length === 0 && !quotasLoading && (
            <div className="glass p-8 rounded-lg text-center">
              <Settings2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">
                {showOnlyMine ? 'No reservations found for your user.' : 'No GPU reservations configured yet'}
              </p>
              {!showOnlyMine && (
                <button onClick={() => { setEditingQuota(null); setShowReservationForm(true) }}
                  className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600">
                  Create GPU Reservation
                </button>
              )}
            </div>
          )}
          <div className="grid gap-4">
            {filteredQuotas.map(q => {
              const meta = getReservationMeta(q)
              return (
                <div key={`${q.cluster}-${q.namespace}-${q.name}`} className="glass p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Zap className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{meta.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {q.namespace} · {q.name}
                          {meta.user && ` · ${meta.user}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {q.cluster && <ClusterBadge cluster={q.cluster} size="sm" />}
                      <button onClick={() => setSelectedQuota(q)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditingQuota(q); setShowReservationForm(true) }}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-purple-400">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirm({ cluster: q.cluster!, namespace: q.namespace, name: q.name })}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Resource bars */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(q.hard).map(([key, value]) => {
                      const used = parseFloat(q.used?.[key] || '0')
                      const limit = parseFloat(value)
                      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0
                      const isGPU = GPU_KEYS.some(gk => key.includes(gk))

                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className={cn('text-muted-foreground', isGPU && 'flex items-center gap-1')}>
                              {isGPU && <Zap className="w-3 h-3 text-purple-400" />}
                              {key.length > 25 ? key.slice(key.lastIndexOf('/') + 1) : key}
                            </span>
                            <span className="text-foreground">{q.used?.[key] || '0'}/{value}</span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div className={cn(
                              'h-full rounded-full transition-all',
                              percent > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' :
                              percent > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                            )} style={{ width: `${Math.min(percent, 100)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Metadata row */}
                  {(meta.startDate || meta.durationHours || meta.gpuPreference) && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex gap-4 text-xs text-muted-foreground">
                      {meta.startDate && <span>Start: {meta.startDate}</span>}
                      {meta.durationHours && <span>Duration: {meta.durationHours}h</span>}
                      {meta.gpuPreference && <span>GPU: {meta.gpuPreference}</span>}
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
          {gpuClusters.length === 0 && !nodesLoading && (
            <div className="glass p-8 rounded-lg text-center">
              <Server className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No GPU nodes found across clusters</p>
            </div>
          )}
          {gpuClusters.map(cluster => {
            const clusterNodes = nodes.filter(n => n.cluster === cluster.name)
            return (
              <div key={cluster.name} className="glass p-4 rounded-lg">
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

      {/* Create/Edit GPU Quota Modal */}
      {showReservationForm && (
        <ReservationFormModal
          isOpen={showReservationForm}
          onClose={() => { setShowReservationForm(false); setEditingQuota(null); setPrefillDate(null) }}
          editingQuota={editingQuota}
          gpuClusters={gpuClusters}
          allNodes={rawNodes}
          user={user}
          prefillDate={prefillDate}
          onSaved={() => { refetchQuotas(); showToast('GPU reservation saved successfully', 'success') }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Delete Confirmation */}
      <BaseModal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} size="sm">
        <BaseModal.Header title="Delete GPU Quota" icon={Trash2} onClose={() => setDeleteConfirm(null)} showBack={false} />
        <BaseModal.Content>
          <p className="text-muted-foreground">
            Are you sure you want to delete the quota <strong className="text-foreground">{deleteConfirm?.name}</strong> from{' '}
            <strong className="text-foreground">{deleteConfirm?.namespace}</strong>?
          </p>
          <p className="text-sm text-red-400 mt-2">
            This will remove the GPU resource limit from the namespace, allowing unrestricted GPU access.
          </p>
        </BaseModal.Content>
        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex gap-3">
            <button onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button onClick={handleDeleteQuota} disabled={isDeleting}
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

// Parse age string like "5d", "2h", "30m" to approximate date
function parseAgeToDate(age: string): Date | null {
  const now = new Date()
  const match = age.match(/^(\d+)([dhms])$/)
  if (!match) return null
  const value = parseInt(match[1])
  const unit = match[2]
  switch (unit) {
    case 'd': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
    case 'h': return new Date(now.getTime() - value * 60 * 60 * 1000)
    case 'm': return new Date(now.getTime() - value * 60 * 1000)
    case 's': return new Date(now.getTime() - value * 1000)
    default: return null
  }
}

// Reservation Form Modal
function ReservationFormModal({
  isOpen,
  onClose,
  editingQuota,
  gpuClusters,
  allNodes,
  user,
  prefillDate,
  onSaved,
  onError,
}: {
  isOpen: boolean
  onClose: () => void
  editingQuota: ResourceQuota | null
  gpuClusters: GPUClusterInfo[]
  allNodes: GPUNode[]
  user: { github_login: string; email?: string } | null
  prefillDate?: string | null
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const existingMeta = editingQuota ? getReservationMeta(editingQuota) : null

  const [cluster, setCluster] = useState(editingQuota?.cluster || '')
  const [namespace, setNamespace] = useState(editingQuota?.namespace || '')
  const [title, setTitle] = useState(existingMeta?.title || '')
  const [description, setDescription] = useState(existingMeta?.description || '')
  const [gpuCount, setGpuCount] = useState(editingQuota ? String(getGPUCount(editingQuota)) : '')
  const [gpuPreference, setGpuPreference] = useState(existingMeta?.gpuPreference || '')
  const [startDate, setStartDate] = useState(existingMeta?.startDate || prefillDate || new Date().toISOString().split('T')[0])
  const [durationHours, setDurationHours] = useState(existingMeta?.durationHours || '')
  const [notes, setNotes] = useState(existingMeta?.notes || '')
  const [extraResources, setExtraResources] = useState<Array<{ key: string; value: string }>>(
    editingQuota
      ? Object.entries(editingQuota.hard)
          .filter(([k]) => !GPU_KEYS.some(gk => k.includes(gk)))
          .map(([key, value]) => ({ key, value }))
      : []
  )
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
    if (editingQuota) {
      return Object.keys(editingQuota.hard).find(k => GPU_KEYS.some(gk => k.includes(gk))) || 'limits.nvidia.com/gpu'
    }
    if (!cluster) return 'limits.nvidia.com/gpu'
    const clusterNodes = allNodes.filter(n => n.cluster === cluster)
    const hasAMD = clusterNodes.some(n => n.gpuType.toLowerCase().includes('amd') || n.manufacturer?.toLowerCase().includes('amd'))
    const hasIntel = clusterNodes.some(n => n.gpuType.toLowerCase().includes('intel') || n.manufacturer?.toLowerCase().includes('intel'))
    if (hasAMD) return 'limits.amd.com/gpu'
    if (hasIntel) return 'gpu.intel.com/i915'
    return 'limits.nvidia.com/gpu'
  }, [cluster, allNodes, editingQuota])

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
  const quotaName = editingQuota?.name || (title
    ? `gpu-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`
    : '')

  const handleSave = async () => {
    setError(null)
    if (!cluster) { setError('Select a cluster'); return }
    if (!namespace) { setError('Select a namespace'); return }
    if (!title) { setError('Title is required'); return }
    const count = parseInt(gpuCount)
    if (!count || count < 1) { setError('GPU count must be at least 1'); return }
    if (count > maxGPUs && !editingQuota) { setError(`Only ${maxGPUs} GPUs available on ${cluster}`); return }

    const hard: Record<string, string> = {
      [gpuResourceKey]: String(count),
    }
    // Add extra resources
    for (const r of extraResources) {
      if (r.key && r.value) hard[r.key] = r.value
    }

    const annotations: Record<string, string> = {
      [`${ANNOTATION_PREFIX}title`]: title,
      [`${ANNOTATION_PREFIX}user`]: user?.email || user?.github_login || '',
      [`${ANNOTATION_PREFIX}full-name`]: user?.github_login || '',
      [`${ANNOTATION_PREFIX}description`]: description,
      [`${ANNOTATION_PREFIX}start-date`]: startDate,
      [`${ANNOTATION_PREFIX}duration-hours`]: durationHours || '24',
      [`${ANNOTATION_PREFIX}gpu-preference`]: gpuPreference || clusterGPUTypes.join(', '),
      [`${ANNOTATION_PREFIX}notes`]: notes,
      [`${ANNOTATION_PREFIX}created-at`]: editingQuota
        ? (existingMeta?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
    }

    setIsSaving(true)
    try {
      await createOrUpdateResourceQuota({
        cluster,
        namespace,
        name: quotaName,
        hard,
        annotations,
      })
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save quota'
      setError(msg)
      onError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title={editingQuota ? 'Edit GPU Reservation' : 'Create GPU Reservation'}
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Describe your experiment or workload..."
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Cluster (GPU-only, with counts) */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Cluster *</label>
            <select value={cluster} onChange={e => { setCluster(e.target.value); setNamespace(''); setGpuPreference('') }}
              disabled={!!editingQuota}
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
              disabled={!!editingQuota || !cluster}
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

          {/* Additional Resources */}
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

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Additional Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any additional context..."
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
          </div>

          {/* Preview */}
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="text-xs font-medium text-purple-400 mb-1">ResourceQuota Preview</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Name: <span className="text-foreground">{quotaName || '...'}</span></div>
              <div>Namespace: <span className="text-foreground">{namespace || '...'}</span></div>
              <div>Cluster: <span className="text-foreground">{cluster || '...'}</span></div>
              <div>GPU Limit: <span className="text-foreground">{gpuCount || '...'} ({gpuResourceKey})</span></div>
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
            {editingQuota ? 'Update Reservation' : 'Create Reservation'}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
