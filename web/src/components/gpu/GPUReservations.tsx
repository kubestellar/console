import { useState, useMemo, useCallback } from 'react'
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
import { ReservationFormModal } from './ReservationFormModal'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { cn } from '../../lib/cn'
import { Input } from '../ui/Input'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import type { GPUReservation, CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { getDefaultCardWidth } from '../cards/cardRegistry'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
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
import type { GpuDashCard } from './SortableGpuCard'
import { DEFAULT_GPU_CARDS } from './SortableGpuCard'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import type { CalendarBar } from './GPUCalendarTab'
import { GPUReservationsTab } from './GPUReservationsTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'
import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { useGPUReservationsView, useGPUCalendarLogic } from '../../hooks/gpu/useGPUReservationsView'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'
type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

export function GPUReservations() {
  const { t: tTyped } = useTranslation(['cards', 'common'])
  const t = tTyped as unknown as TranslateFn
  const { user } = useAuth()
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

  // Use the extracted data view hook
  const {
    nodes,
    rawNodes,
    gpuQuotas,
    gpuClusters,
    filteredReservations,
    allReservations,
    utilizations,
    knownNamespacesByCluster,
    stats,
    nodesLoading,
    reservationsLoading,
    isLoading,
    isRefreshingDashboard,
    effectiveDemoMode,
    gpuLiveMode,
    triggerRefresh,
  } = useGPUReservationsView(showOnlyMine, searchTerm, user)

  // Use the extracted calendar logic hook
  const { daysInMonth, startingDay, getReservationDayRange, getGPUCountForDay } = useGPUCalendarLogic(currentMonth)

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
    createReservation: apiCreateReservation,
    updateReservation: apiUpdateReservation,
    deleteReservation: apiDeleteReservation } = useGPUReservations()

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
    } catch (err: unknown) {
      showToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
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

      {/* Tabs */}
      <div
        role="tablist"
        className="flex flex-wrap gap-1 mb-6 border-b border-border"
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
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 mb-[-2px] transition-colors',
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

        <div className="ml-auto pb-2 flex flex-wrap items-center gap-3">
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
              <Input
                type="checkbox"
                checked={showOnlyMine}
                onChange={toggleShowOnlyMine}
                className="sr-only"
              />
              {showOnlyMine ? <User className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              {t('gpuReservations.myReservations')}
            </label>
          )}
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('gpuReservations.createReservation')}
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <CompactErrorBoundary context="GPUOverviewTab">
        <GPUOverviewTab
          stats={stats}
          filteredReservations={filteredReservations}
          utilizations={utilizations}
          effectiveDemoMode={effectiveDemoMode}
          showOnlyMine={showOnlyMine}
          onSelectReservation={goToReservation}
        />
        </CompactErrorBoundary>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <CompactErrorBoundary context="GPUCalendarTab">
        <GPUCalendarTab
          currentMonth={currentMonth}
          calendarWeeks={calendarWeeks}
          effectiveDemoMode={effectiveDemoMode}
          expandedReservationId={expandedReservationId}
          onSetExpandedReservationId={setExpandedReservationId}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onAddReservation={openCreateFormForDate}
          getGPUCountForDay={(day) => getGPUCountForDay(day, filteredReservations)}
        />
        </CompactErrorBoundary>
      )}

      {/* Reservations Tab */}
      {activeTab === 'quotas' && (
        <CompactErrorBoundary context="GPUReservationsTab">
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
          onEditReservation={openEditForm}
          onDeleteReservation={setDeleteConfirmId}
          onCreateReservation={openCreateForm}
        />
        </CompactErrorBoundary>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <CompactErrorBoundary context="GPUInventoryTab">
        <GPUInventoryTab
          gpuClusters={gpuClusters}
          nodes={nodes}
          nodesLoading={nodesLoading}
          effectiveDemoMode={effectiveDemoMode}
        />
        </CompactErrorBoundary>
      )}

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <CompactErrorBoundary context="GPUDashboardTab">
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
        </CompactErrorBoundary>
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
        onClose={closeReservationForm}
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
