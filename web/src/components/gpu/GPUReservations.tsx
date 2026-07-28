import { useTranslation } from 'react-i18next'
import { FlaskConical } from 'lucide-react'
import { useModalState } from '../../lib/modals'
import { ReservationFormModal } from './ReservationFormModal'
import { useToast } from '../ui/Toast'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import { GPUReservationsTab } from './GPUReservationsTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'
import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { useGPUReservationsData } from './useGPUReservationsData'
import { TabNavigation } from './TabNavigation'
import { FilterToolbar } from './FilterToolbar'
import { DeleteConfirmModal } from './DeleteConfirmModal'

export function GPUReservations() {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const { isOpen: showAddCardModal, open: openAddCardModal, close: closeAddCardModal } = useModalState()

  // Extract all data-fetching, state, and computed logic into custom hook
  const data = useGPUReservationsData()

  if (data.isLoading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  const handleConfirmDelete = async () => {
    const result = await data.handleDeleteReservation()
    if (!result) return
    if (result.success) {
      showToast('GPU reservation deleted', 'success')
    } else {
      showToast(`Failed to delete: ${result.error}`, 'error')
    }
  }

  const handleSave = async (input: Parameters<typeof data.handleSaveReservation>[0]) => {
    const id = await data.handleSaveReservation(input)
    return id
  }

  const handleSaved = () => {
    showToast(t('gpuReservations.form.success.saved'), 'success')
  }

  const handleError = (msg: string) => {
    showToast(msg, 'error')
  }

  const handleCloseAddCardModal = () => {
    closeAddCardModal()
  }

  const handleAddCards = (suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>) => {
    data.handleAddDashboardCards(suggestions)
    closeAddCardModal()
  }

  return (
    <div className="pt-16 min-w-0">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t('gpuReservations.title')}</h1>
          {data.effectiveDemoMode && (
            <StatusBadge color="yellow" variant="outline" rounded="full" icon={<FlaskConical className="w-3 h-3" />}>
              {t('gpuReservations.demo')}
            </StatusBadge>
          )}
        </div>
        <div className="text-muted-foreground">{t('gpuReservations.subtitle')}</div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <TabNavigation
          activeTab={data.activeTab}
          onSetActiveTab={data.setActiveTab}
          filteredReservationsCount={data.filteredReservations.length}
        />
        <FilterToolbar
          user={data.user}
          showOnlyMine={data.showOnlyMine}
          onToggleShowOnlyMine={data.toggleShowOnlyMine}
          onOpenCreateForm={data.openCreateForm}
        />
      </div>

      {/* Overview Tab */}
      {data.activeTab === 'overview' && (
        <CompactErrorBoundary context="GPUOverviewTab">
        <GPUOverviewTab
          stats={data.stats}
          filteredReservations={data.filteredReservations}
          utilizations={data.utilizations}
          effectiveDemoMode={data.effectiveDemoMode}
          showOnlyMine={data.showOnlyMine}
          onSelectReservation={data.goToReservation}
        />
        </CompactErrorBoundary>
      )}

      {/* Calendar Tab */}
      {data.activeTab === 'calendar' && (
        <CompactErrorBoundary context="GPUCalendarTab">
        <GPUCalendarTab
          currentMonth={data.currentMonth}
          calendarWeeks={data.calendarWeeks}
          effectiveDemoMode={data.effectiveDemoMode}
          expandedReservationId={data.expandedReservationId}
          onSetExpandedReservationId={data.setExpandedReservationId}
          onPrevMonth={data.prevMonth}
          onNextMonth={data.nextMonth}
          onAddReservation={data.openCreateFormForDate}
          getGPUCountForDay={data.getGPUCountForDay}
        />
        </CompactErrorBoundary>
      )}

      {/* Reservations Tab */}
      {data.activeTab === 'quotas' && (
        <CompactErrorBoundary context="GPUReservationsTab">
        <GPUReservationsTab
          filteredReservations={data.filteredReservations}
          utilizations={data.utilizations}
          effectiveDemoMode={data.effectiveDemoMode}
          showOnlyMine={data.showOnlyMine}
          searchTerm={data.searchTerm}
          reservationsLoading={data.reservationsLoading}
          expandedReservationId={data.expandedReservationId}
          deleteConfirmId={data.deleteConfirmId}
          showReservationForm={data.showReservationForm}
          user={data.user}
          onSetSearchTerm={data.setSearchTerm}
          onSetShowOnlyMine={data.setShowOnlyMine}
          onSetExpandedReservationId={data.setExpandedReservationId}
          onEditReservation={data.openEditForm}
          onDeleteReservation={data.setDeleteConfirmId}
          onCreateReservation={data.openCreateForm}
        />
        </CompactErrorBoundary>
      )}

      {/* Inventory Tab */}
      {data.activeTab === 'inventory' && (
        <CompactErrorBoundary context="GPUInventoryTab">
        <GPUInventoryTab
          gpuClusters={data.gpuClusters}
          nodes={data.nodes}
          nodesLoading={data.nodesLoading}
          effectiveDemoMode={data.effectiveDemoMode}
        />
        </CompactErrorBoundary>
      )}

      {/* Dashboard Tab */}
      {data.activeTab === 'dashboard' && (
        <CompactErrorBoundary context="GPUDashboardTab">
        <GPUDashboardTab
          dashboardCards={data.dashboardCards}
          dashCardIds={data.dashCardIds}
          gpuDashSensors={data.gpuDashSensors}
          gpuLiveMode={data.gpuLiveMode}
          isRefreshingDashboard={data.isRefreshingDashboard}
          onDashDragEnd={data.handleDashDragEnd}
          onRemoveDashboardCard={data.handleRemoveDashboardCard}
          onDashCardWidthChange={data.handleDashCardWidthChange}
          onTriggerRefresh={data.triggerRefresh}
          onShowAddCardModal={openAddCardModal}
        />
        </CompactErrorBoundary>
      )}

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardModal}
        onClose={handleCloseAddCardModal}
        onAddCards={handleAddCards}
        existingCardTypes={data.dashboardCards.map(c => c.type)}
      />

      {/* Create/Edit Reservation Modal */}
      <ReservationFormModal
        isOpen={data.showReservationForm}
        onClose={data.closeReservationForm}
        editingReservation={data.editingReservation}
        gpuClusters={data.gpuClusters}
        allNodes={data.rawNodes}
        user={data.user}
        prefillDate={data.prefillDate}
        forceLive={data.gpuLiveMode}
        knownNamespacesByCluster={data.knownNamespacesByCluster}
        onSave={handleSave}
        onActivate={data.handleActivateReservation}
        onSaved={handleSaved}
        onError={handleError}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmModal
        deleteConfirmReservation={data.deleteConfirmReservation}
        isDeleting={data.isDeleting}
        onClose={() => data.setDeleteConfirmId(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  )
}
