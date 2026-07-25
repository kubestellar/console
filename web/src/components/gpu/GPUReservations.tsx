import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, FlaskConical, Trash2, Loader2, LayoutDashboard, Calendar, Settings2, TrendingUp, Server } from 'lucide-react'
import { BaseModal, useModalState } from '../../lib/modals'
import { useGPUNodes, useResourceQuotas, useClusters } from '../../hooks/useMCP'
import { ReservationFormModal, type GPUClusterInfo } from './ReservationFormModal'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { cn } from '../../lib/cn'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { GPU_KEYS } from './gpu-constants'
import type { GpuDashCard } from './SortableGpuCard'
import { DEFAULT_GPU_CARDS } from './SortableGpuCard'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import type { CalendarBar } from './GPUCalendarTab'
import { GPUReservationsTab } from './GPUReservationsTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'
import { computeGPUOverviewStats } from './gpuOverviewStats'
import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { useGPUReservationsData } from '../../hooks/useGPUReservationsData'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'

export function GPUReservations() {
  const { t } = useTranslation(['cards', 'common'])
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

  const GPU_DASHBOARD_STORAGE_KEY = 'gpu-dashboard-tab-cards'
  const [dashboardCards, setDashboardCards] = useState<GpuDashCard[]>(() => {
    const stored = safeGetJSON<GpuDashCard[] | string[]>(GPU_DASHBOARD_STORAGE_KEY)
    if (!stored || stored.length === 0) return DEFAULT_GPU_CARDS
    if (typeof stored[0] === 'string') {
      const { getDefaultCardWidth } = require('../cards/cardRegistry')
      const migrated = (stored as string[]).map(type => ({ type, width: getDefaultCardWidth(type) }))
      safeSetJSON(GPU_DASHBOARD_STORAGE_KEY, migrated)
      return migrated
    }
    return stored as GpuDashCard[]
  })

  const handleAddDashboardCards = (suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => {
    const { getDefaultCardWidth } = require('../cards/cardRegistry')
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

  const { reservations: allReservations, isLoading: reservationsLoading, createReservation: apiCreateReservation, updateReservation: apiUpdateReservation, deleteReservation: apiDeleteReservation } = useGPUReservations()

  const nodes = isAllClustersSelected ? (rawNodes || []) : ((rawNodes || []).filter(n => selectedClusters.some(c => n.cluster.startsWith(c))))
  const gpuQuotas = (() => {
    const filtered = (resourceQuotas || []).filter(q => Object.keys(q.hard || {}).some(k => GPU_KEYS.some(gk => k.includes(gk))))
    if (isAllClustersSelected) return filtered
    return filtered.filter(q => q.cluster && selectedClusters.some(c => q.cluster!.startsWith(c)))
  })()

  const { filteredReservations } = useGPUReservationsData({ allReservations, showOnlyMine, searchTerm })
  const visibleReservationIds = (filteredReservations || []).map(r => r.id)
  const { utilizations } = useGPUUtilizations(visibleReservationIds)

  const gpuClusters = (() => {
    const clusterMap: Record<string, GPUClusterInfo> = {}
    for (const node of (rawNodes || [])) {
      if (!clusterMap[node.cluster]) {
        clusterMap[node.cluster] = { name: node.cluster, totalGPUs: 0, allocatedGPUs: 0, availableGPUs: 0, gpuTypes: [] }
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

  const knownNamespacesByCluster = (() => {
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
  })()

  const stats = computeGPUOverviewStats({
    nodes,
    reservations: filteredReservations,
    gpuQuotas,
    gpuClusters,
  })

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

  const getReservationDayRange = useCallback((r: GPUReservation) => {
    if (!r.start_date) return null
    const MS_PER_HOUR = 3_600_000
    const DEFAULT_DURATION_HOURS = 24
    const originalStart = new Date(r.start_date)
    const durationHours = r.duration_hours || DEFAULT_DURATION_HOURS
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

  const calendarWeeks = (() => {
    const totalCells = startingDay + daysInMonth
    const numWeeks = Math.ceil(totalCells / 7)
    const weeks: { days: (number | null)[]; bars: CalendarBar[] }[] = []
    for (let w = 0; w < numWeeks; w++) {
      const days: (number | null)[] = []
      for (let col = 0; col < 7; col++) {
        const cellIndex = w * 7 + col
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
      for (let w = 0; w < weeks.length; w++) {
        const weekStartDay = weeks[w].days.find(d => d !== null) ?? 1
        const weekEndDay = [...weeks[w].days].reverse().find(d => d !== null) ?? daysInMonth
        if (range.startDay > weekEndDay || range.endDay < weekStartDay) continue
        const barStartDay = Math.max(range.startDay, weekStartDay)
        const barEndDay = Math.min(range.endDay, weekEndDay)
        const startCol = weeks[w].days.indexOf(barStartDay)
        const endCol = weeks[w].days.indexOf(barEndDay)
        if (startCol === -1 || endCol === -1) continue
        let row = 0
        while (true) {
          if (!rowOccupancy[w][row]) break
          if (rowOccupancy[w][row] !== r.id) {
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
  })()

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
      if (!prev) setActiveTab('quotas')
      return !prev
    })
  }, [])

  const deleteConfirmReservation = deleteConfirmId ? allReservations?.find(r => r.id === deleteConfirmId) : null
  const isLoading = nodesLoading && nodes.length === 0 && reservationsLoading

  if (isLoading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  return (
    <div className="pt-16 min-w-0">
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

      <div role="tablist" className="flex flex-wrap gap-1 mb-6 border-b border-border" onKeyDown={(e) => {
        const ids = ['overview', 'calendar', 'quotas', 'inventory', 'dashboard'] as const
        const idx = ids.indexOf(activeTab)
        if (e.key === 'ArrowRight') setActiveTab(ids[Math.min(idx + 1, ids.length - 1)])
        else if (e.key === 'ArrowLeft') setActiveTab(ids[Math.max(idx - 1, 0)])
      }}>
        {[
          { id: 'overview' as const, label: t('gpuReservations.tabs.overview'), icon: TrendingUp },
          { id: 'calendar' as const, label: t('gpuReservations.tabs.calendar'), icon: Calendar },
          { id: 'quotas' as const, label: t('gpuReservations.tabs.reservations'), icon: Settings2, count: filteredReservations.length },
          { id: 'inventory' as const, label: t('gpuReservations.tabs.inventory'), icon: Server },
          { id: 'dashboard' as const, label: t('gpuReservations.tabs.dashboard'), icon: LayoutDashboard },
        ].map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)}
              className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
                activeTab === tab.id ? 'border-purple-500 text-purple-400' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <StatusBadge color="purple" rounded="full">{tab.count}</StatusBadge>
              )}
            </button>
          )
        })}
        <div className="ml-auto pb-2 flex flex-wrap items-center gap-3">
          {user && (
            <label className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer',
              showOnlyMine ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-border bg-secondary text-muted-foreground hover:text-foreground')}>
              <input type="checkbox" checked={showOnlyMine} onChange={toggleShowOnlyMine} className="sr-only" />
              {showOnlyMine ? <User className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {t('gpuReservations.myReservations')}
            </label>
          )}
          <button onClick={openCreateForm} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors">
            <Plus className="w-4 h-4" />
            {t('gpuReservations.createReservation')}
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        <CompactErrorBoundary context="GPUOverviewTab">
          <GPUOverviewTab stats={stats} filteredReservations={filteredReservations} utilizations={utilizations} effectiveDemoMode={effectiveDemoMode} showOnlyMine={showOnlyMine} onSelectReservation={goToReservation} />
        </CompactErrorBoundary>
      )}

      {activeTab === 'calendar' && (
        <CompactErrorBoundary context="GPUCalendarTab">
          <GPUCalendarTab currentMonth={currentMonth} calendarWeeks={calendarWeeks} effectiveDemoMode={effectiveDemoMode} expandedReservationId={expandedReservationId} onSetExpandedReservationId={setExpandedReservationId} onPrevMonth={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} onNextMonth={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} onAddReservation={openCreateFormForDate} getGPUCountForDay={getGPUCountForDay} />
        </CompactErrorBoundary>
      )}

      {activeTab === 'quotas' && (
        <CompactErrorBoundary context="GPUReservationsTab">
          <GPUReservationsTab filteredReservations={filteredReservations} utilizations={utilizations} effectiveDemoMode={effectiveDemoMode} showOnlyMine={showOnlyMine} searchTerm={searchTerm} reservationsLoading={reservationsLoading} expandedReservationId={expandedReservationId} deleteConfirmId={deleteConfirmId} showReservationForm={showReservationForm} user={user} onSetSearchTerm={setSearchTerm} onSetShowOnlyMine={setShowOnlyMine} onSetExpandedReservationId={setExpandedReservationId} onEditReservation={openEditForm} onDeleteReservation={setDeleteConfirmId} onCreateReservation={openCreateForm} />
        </CompactErrorBoundary>
      )}

      {activeTab === 'inventory' && (
        <CompactErrorBoundary context="GPUInventoryTab">
          <GPUInventoryTab gpuClusters={gpuClusters} nodes={nodes} nodesLoading={nodesLoading} effectiveDemoMode={effectiveDemoMode} />
        </CompactErrorBoundary>
      )}

      {activeTab === 'dashboard' && (
        <CompactErrorBoundary context="GPUDashboardTab">
          <GPUDashboardTab dashboardCards={dashboardCards} dashCardIds={dashCardIds} gpuDashSensors={gpuDashSensors} gpuLiveMode={gpuLiveMode} isRefreshingDashboard={isRefreshingDashboard} onDashDragEnd={handleDashDragEnd} onRemoveDashboardCard={handleRemoveDashboardCard} onDashCardWidthChange={handleDashCardWidthChange} onTriggerRefresh={triggerRefresh} onShowAddCardModal={openAddCardModal} />
        </CompactErrorBoundary>
      )}

      <AddCardModal isOpen={showAddCardModal} onClose={closeAddCardModal} onAddCards={handleAddDashboardCards} existingCardTypes={dashboardCards.map(c => c.type)} />

      <ReservationFormModal isOpen={showReservationForm} onClose={closeReservationForm} editingReservation={editingReservation} gpuClusters={gpuClusters} allNodes={rawNodes} user={user} prefillDate={prefillDate} forceLive={gpuLiveMode} knownNamespacesByCluster={knownNamespacesByCluster} onSave={async (input) => {
        if (editingReservation) {
          await apiUpdateReservation(editingReservation.id, input as UpdateGPUReservationInput)
          return editingReservation.id
        } else {
          const created = await apiCreateReservation(input as CreateGPUReservationInput)
          return created.id
        }
      }} onActivate={async (id) => { await apiUpdateReservation(id, { status: 'active' }) }} onSaved={() => showToast(t('gpuReservations.form.success.saved'), 'success')} onError={(msg) => showToast(msg, 'error')} />

      <BaseModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} size="sm" closeOnBackdrop={false} closeOnEscape={true}>
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
