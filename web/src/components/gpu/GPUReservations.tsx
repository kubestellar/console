import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap,
  Calendar,
  Clock,
  Users,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  TrendingUp,
  FlaskConical,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useGPUNodes } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { DonutChart } from '../charts/PieChart'
import { BarChart } from '../charts/BarChart'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { TechnicalAcronym } from '../shared/TechnicalAcronym'
import { getChartColor, getChartColorByName } from '../../lib/chartColors'

// GPU utilization thresholds for visual indicators
const UTILIZATION_HIGH_THRESHOLD = 80 // Red indicator above this percentage
const UTILIZATION_MEDIUM_THRESHOLD = 50 // Yellow indicator above this percentage

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'requests'

// Mock reservation data
interface GPUReservation {
  id: string
  name: string
  user: string
  team: string
  cluster: string
  gpuType: string
  gpuCount: number
  startDate: Date
  endDate: Date
  status: 'active' | 'pending' | 'completed' | 'cancelled'
  purpose: string
}

interface GPUQuota {
  team: string
  gpuLimit: number
  gpuUsed: number
  cpuLimit: number
  cpuUsed: number
  memoryLimit: number // GB
  memoryUsed: number // GB
}

function getMockReservations(): GPUReservation[] {
  const now = new Date()
  return [
    {
      id: 'res-001',
      name: 'LLM Training Job',
      user: 'alice@company.com',
      team: 'ML Platform',
      cluster: 'vllm-d',
      gpuType: 'A100-80GB',
      gpuCount: 8,
      startDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      status: 'active',
      purpose: 'Fine-tuning LLaMA model',
    },
    {
      id: 'res-002',
      name: 'Inference Testing',
      user: 'bob@company.com',
      team: 'Research',
      cluster: 'vllm-d',
      gpuType: 'A100-80GB',
      gpuCount: 2,
      startDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      status: 'pending',
      purpose: 'Model inference benchmark',
    },
    {
      id: 'res-003',
      name: 'Computer Vision Project',
      user: 'charlie@company.com',
      team: 'Computer Vision',
      cluster: 'ops',
      gpuType: 'V100',
      gpuCount: 4,
      startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      status: 'completed',
      purpose: 'Object detection training',
    },
    {
      id: 'res-004',
      name: 'NLP Research',
      user: 'diana@company.com',
      team: 'Research',
      cluster: 'vllm-d',
      gpuType: 'A100-80GB',
      gpuCount: 4,
      startDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      status: 'pending',
      purpose: 'Transformer experiments',
    },
  ]
}

function getMockQuotas(): GPUQuota[] {
  return [
    { team: 'ML Platform', gpuLimit: 16, gpuUsed: 8, cpuLimit: 64, cpuUsed: 32, memoryLimit: 256, memoryUsed: 128 },
    { team: 'Research', gpuLimit: 12, gpuUsed: 6, cpuLimit: 48, cpuUsed: 24, memoryLimit: 192, memoryUsed: 96 },
    { team: 'Computer Vision', gpuLimit: 8, gpuUsed: 4, cpuLimit: 32, cpuUsed: 16, memoryLimit: 128, memoryUsed: 64 },
    { team: 'Data Science', gpuLimit: 4, gpuUsed: 0, cpuLimit: 16, cpuUsed: 0, memoryLimit: 64, memoryUsed: 0 },
  ]
}

export function GPUReservations() {
  const { t } = useTranslation()
  const { nodes: rawNodes, isLoading } = useGPUNodes()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { isDemoMode: _isDemoMode } = useDemoMode()
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showNewReservationForm, setShowNewReservationForm] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<GPUReservation | null>(null)

  // This page uses mock data for reservations, quotas, and team usage
  // Real GPU node data comes from useGPUNodes()
  const showDemoIndicator = true // Always show demo indicator since reservations are mocked

  // Filter nodes by global cluster selection
  const nodes = useMemo(() => {
    if (isAllClustersSelected) return rawNodes
    return rawNodes.filter(n => selectedClusters.some(c => n.cluster.startsWith(c)))
  }, [rawNodes, selectedClusters, isAllClustersSelected])

  // Mock data
  const reservations = useMemo(() => getMockReservations(), [])
  const quotas = useMemo(() => getMockQuotas(), [])

  // GPU stats
  const stats = useMemo(() => {
    const totalGPUs = nodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = nodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const availableGPUs = totalGPUs - allocatedGPUs
    const utilizationPercent = totalGPUs > 0 ? Math.round((allocatedGPUs / totalGPUs) * 100) : 0

    const activeReservations = reservations.filter(r => r.status === 'active').length
    const pendingReservations = reservations.filter(r => r.status === 'pending').length
    const reservedGPUs = reservations
      .filter(r => r.status === 'active' || r.status === 'pending')
      .reduce((sum, r) => sum + r.gpuCount, 0)

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

    // Team usage
    const teamUsage = quotas.map((q, i) => ({
      name: q.team,
      value: q.gpuUsed,
      color: getChartColor((i % 4) + 1),
    }))

    // Weekly usage trend (mock)
    const weeklyUsage = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
      name: day,
      value: Math.floor(allocatedGPUs * (0.7 + Math.random() * 0.3)),
    }))

    return {
      totalGPUs,
      allocatedGPUs,
      availableGPUs,
      utilizationPercent,
      activeReservations,
      pendingReservations,
      reservedGPUs,
      typeChartData,
      teamUsage,
      weeklyUsage,
    }
  }, [nodes, reservations, quotas])

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

  const getReservationsForDay = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return reservations.filter(r => {
      const start = new Date(r.startDate)
      const end = new Date(r.endDate)
      return date >= start && date <= end && (r.status === 'active' || r.status === 'pending')
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

  if (isLoading && nodes.length === 0) {
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
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'calendar', label: 'Calendar', icon: Calendar },
          { id: 'quotas', label: 'Quotas', icon: Settings2 },
          { id: 'requests', label: 'Requests', icon: Clock, count: stats.pendingReservations },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ViewTab)}
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
                <span className="px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}

        <div className="ml-auto pb-2">
          <button
            onClick={() => setShowNewReservationForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Reservation
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
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{stats.activeReservations}</div>
                  <div className="text-xs text-muted-foreground">Active Reservations</div>
                </div>
              </div>
            </div>
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{stats.pendingReservations}</div>
                  <div className="text-xs text-muted-foreground">Pending Requests</div>
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
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-secondary"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${stats.utilizationPercent * 3.52} 352`}
                      className={cn(
                        stats.utilizationPercent > UTILIZATION_HIGH_THRESHOLD ? 'text-red-500' :
                        stats.utilizationPercent > UTILIZATION_MEDIUM_THRESHOLD ? 'text-yellow-500' :
                        'text-green-500'
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
                <DonutChart
                  data={stats.typeChartData}
                  size={150}
                  thickness={20}
                  showLegend={true}
                />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">
                  No GPU data
                </div>
              )}
            </div>

            {/* Team Usage */}
            <div className="glass p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Usage by Team</h3>
              {stats.teamUsage.length > 0 ? (
                <DonutChart
                  data={stats.teamUsage}
                  size={150}
                  thickness={20}
                  showLegend={true}
                />
              ) : (
                <div className="flex items-center justify-center h-[150px] text-muted-foreground">
                  No usage data
                </div>
              )}
            </div>
          </div>

          {/* Weekly Trend */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Weekly GPU Usage</h3>
            <BarChart
              data={stats.weeklyUsage}
              height={200}
              color={getChartColorByName('primary')}
              showGrid={true}
            />
          </div>

          {/* Active Reservations */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Active Reservations</h3>
            <div className="space-y-3">
              {reservations.filter(r => r.status === 'active').map(res => (
                <div
                  key={res.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <Zap className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{res.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {res.user} · {res.team}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-medium text-foreground">{res.gpuCount} × {res.gpuType}</div>
                      <div className="text-sm text-muted-foreground">
                        Until {res.endDate.toLocaleDateString()}
                      </div>
                    </div>
                    <ClusterBadge cluster={res.cluster} size="sm" />
                  </div>
                </div>
              ))}
              {reservations.filter(r => r.status === 'active').length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  No active reservations
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Calendar Navigation */}
          <div className="glass p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-medium text-foreground">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}

              {/* Empty cells for start */}
              {Array.from({ length: startingDay }).map((_, i) => (
                <div key={`empty-${i}`} className="p-2 min-h-[80px]" />
              ))}

              {/* Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayReservations = getReservationsForDay(day)
                const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString()

                return (
                  <div
                    key={day}
                    className={cn(
                      'p-2 min-h-[80px] rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors',
                      isToday && 'bg-purple-500/10 border-purple-500/50'
                    )}
                  >
                    <div className={cn(
                      'text-sm font-medium mb-1',
                      isToday ? 'text-purple-400' : 'text-foreground'
                    )}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayReservations.slice(0, 2).map(res => (
                        <button
                          key={res.id}
                          onClick={() => setSelectedReservation(res)}
                          className={cn(
                            'w-full text-left px-1.5 py-0.5 rounded text-xs truncate',
                            res.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                          )}
                        >
                          {res.gpuCount}× {res.name.slice(0, 10)}
                        </button>
                      ))}
                      {dayReservations.length > 2 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayReservations.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected Reservation Details */}
          {selectedReservation && (
            <div className="glass p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-foreground">{selectedReservation.name}</h3>
                <button
                  onClick={() => setSelectedReservation(null)}
                  className="p-1 rounded hover:bg-secondary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">User</div>
                  <div className="text-foreground">{selectedReservation.user}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Team</div>
                  <div className="text-foreground">{selectedReservation.team}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">GPU Resources</div>
                  <div className="text-foreground">{selectedReservation.gpuCount} × {selectedReservation.gpuType}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Cluster</div>
                  <div className="text-foreground">{selectedReservation.cluster}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Start Date</div>
                  <div className="text-foreground">{selectedReservation.startDate.toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">End Date</div>
                  <div className="text-foreground">{selectedReservation.endDate.toLocaleDateString()}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-sm text-muted-foreground">Purpose</div>
                  <div className="text-foreground">{selectedReservation.purpose}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quotas Tab */}
      {activeTab === 'quotas' && (
        <div className="space-y-6">
          <div className="grid gap-4">
            {quotas.map(quota => {
              const gpuPercent = (quota.gpuUsed / quota.gpuLimit) * 100
              const cpuPercent = (quota.cpuUsed / quota.cpuLimit) * 100
              const memPercent = (quota.memoryUsed / quota.memoryLimit) * 100

              return (
                <div key={quota.team} className="glass p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/20">
                        <Users className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{quota.team}</div>
                        <div className="text-sm text-muted-foreground">Team Quota</div>
                      </div>
                    </div>
                    <button className="text-sm text-purple-400 hover:text-purple-300">
                      Edit Quota
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {/* GPU Quota */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground"><TechnicalAcronym term="GPU">GPU</TechnicalAcronym></span>
                        <span className="text-foreground">{quota.gpuUsed}/{quota.gpuLimit}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            gpuPercent > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' : gpuPercent > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                          )}
                          style={{ width: `${gpuPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* CPU Quota */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground"><TechnicalAcronym term="CPU">CPU</TechnicalAcronym> (cores)</span>
                        <span className="text-foreground">{quota.cpuUsed}/{quota.cpuLimit}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            cpuPercent > UTILIZATION_HIGH_THRESHOLD ? 'bg-red-500' : cpuPercent > UTILIZATION_MEDIUM_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                          )}
                          style={{ width: `${cpuPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Memory Quota */}
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Memory (GB)</span>
                        <span className="text-foreground">{quota.memoryUsed}/{quota.memoryLimit}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            memPercent > 80 ? 'bg-red-500' : memPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'
                          )}
                          style={{ width: `${memPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-6">
          {/* Pending Requests */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Pending Requests</h3>
            <div className="space-y-3">
              {reservations.filter(r => r.status === 'pending').map(res => (
                <div
                  key={res.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-yellow-500/20">
                      <Clock className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{res.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {res.user} · {res.team}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {res.startDate.toLocaleDateString()} - {res.endDate.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-medium text-foreground">{res.gpuCount} × {res.gpuType}</div>
                      <ClusterBadge cluster={res.cluster} size="sm" />
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded bg-green-500 text-white text-sm hover:bg-green-600 transition-colors">
                        Approve
                      </button>
                      <button className="px-3 py-1 rounded bg-red-500 text-white text-sm hover:bg-red-600 transition-colors">
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {reservations.filter(r => r.status === 'pending').length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400 opacity-50" />
                  <p>{t('gpu.noPendingRequests')}</p>
                </div>
              )}
            </div>
          </div>

          {/* All Requests History */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">All Requests</h3>
            <div className="space-y-2">
              {reservations.map(res => (
                <div
                  key={res.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    res.status === 'active' ? 'bg-green-500/10' :
                    res.status === 'pending' ? 'bg-yellow-500/10' :
                    res.status === 'completed' ? 'bg-blue-500/10' :
                    'bg-red-500/10'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="font-medium text-foreground">{res.name}</div>
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded',
                      res.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      res.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      res.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-red-500/20 text-red-400'
                    )}>
                      {res.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{res.gpuCount} GPUs</span>
                    <span>{res.team}</span>
                    <span>{res.startDate.toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Reservation Modal */}
      <BaseModal isOpen={showNewReservationForm} onClose={() => setShowNewReservationForm(false)} size="md" closeOnBackdrop={false}>
        <BaseModal.Header
          title="New GPU Reservation"
          icon={Calendar}
          onClose={() => setShowNewReservationForm(false)}
          showBack={false}
        />

        <BaseModal.Content>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Reservation Name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
                placeholder="e.g., LLM Training Job"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  GPU Type
                </label>
                <select className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground">
                  <option>A100-80GB</option>
                  <option>A100-40GB</option>
                  <option>V100</option>
                  <option>T4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  GPU Count
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
                  placeholder="1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                Purpose
              </label>
              <textarea
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
                rows={3}
                placeholder="Describe what you'll use the GPUs for..."
              />
            </div>
          </form>
        </BaseModal.Content>

        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowNewReservationForm(false)}
              className="px-4 py-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            >
              Submit Request
            </button>
          </div>
        </BaseModal.Footer>
      </BaseModal>
    </div>
  )
}
