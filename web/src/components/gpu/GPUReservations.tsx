import { useState, useMemo, useEffect, useCallback } from 'react'
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
import { useDemoMode } from '../../hooks/useDemoMode'
import { useBackendHealth } from '../../hooks/useBackendHealth'
import { useAuth } from '../../lib/auth'
import { useToast } from '../ui/Toast'
import { cn } from '../../lib/cn'
import { Input } from '../ui/Input'
import { useGPUReservations } from '../../hooks/useGPUReservations'
import { useGPUUtilizations } from '../../hooks/useGPUUtilizations'
import type { CreateGPUReservationInput, UpdateGPUReservationInput } from '../../hooks/useGPUReservations'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'

// Extracted sub-components and constants
import { GPU_KEYS } from './gpu-constants'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import { GPUReservationsTab } from './GPUReservationsTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'
import { computeGPUOverviewStats } from './gpuOverviewStats'
import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { useGPUDashboardCards } from './useGPUDashboardCards'
import { useGPUCalendarState } from './useGPUCalendarState'
import { useGPUReservationForm } from './useGPUReservationForm'

type ViewTab = 'overview' | 'calendar' | 'quotas' | 'inventory' | 'dashboard'
type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

export function GPUReservations() {
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
          getGPUCountForDay={getGPUCountForDay}
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
        onAddCards={(suggestions) => { handleAddDashboardCards(suggestions); closeAddCardModal() }}
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
