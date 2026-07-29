import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import { GPUReservationsTab } from './GPUReservationsTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'
import { useGPUReservationsState } from './useGPUReservationsState'
import {
  GPUReservationsHeader,
  GPUReservationsTabBar,
  GPUReservationsModals,
} from './GPUReservations.parts'

export function GPUReservations() {
  const s = useGPUReservationsState()

  if (s.isLoading) {
    return (
      <div className="pt-16 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
      </div>
    )
  }

  return (
    <div className="pt-16 min-w-0">
      <GPUReservationsHeader t={s.t} effectiveDemoMode={s.effectiveDemoMode} />

      <GPUReservationsTabBar
        t={s.t}
        activeTab={s.activeTab}
        setActiveTab={s.setActiveTab}
        filteredReservationsCount={s.filteredReservations.length}
        user={s.user}
        showOnlyMine={s.showOnlyMine}
        toggleShowOnlyMine={s.toggleShowOnlyMine}
        openCreateForm={s.openCreateForm}
      />

      {/* Overview Tab */}
      {s.activeTab === 'overview' && (
        <CompactErrorBoundary context="GPUOverviewTab">
        <GPUOverviewTab
          stats={s.stats}
          filteredReservations={s.filteredReservations}
          utilizations={s.utilizations}
          effectiveDemoMode={s.effectiveDemoMode}
          showOnlyMine={s.showOnlyMine}
          onSelectReservation={s.goToReservation}
        />
        </CompactErrorBoundary>
      )}

      {/* Calendar Tab */}
      {s.activeTab === 'calendar' && (
        <CompactErrorBoundary context="GPUCalendarTab">
        <GPUCalendarTab
          currentMonth={s.currentMonth}
          calendarWeeks={s.calendarWeeks}
          effectiveDemoMode={s.effectiveDemoMode}
          expandedReservationId={s.expandedReservationId}
          onSetExpandedReservationId={s.setExpandedReservationId}
          onPrevMonth={s.prevMonth}
          onNextMonth={s.nextMonth}
          onAddReservation={s.openCreateFormForDate}
          getGPUCountForDay={s.getGPUCountForDay}
        />
        </CompactErrorBoundary>
      )}

      {/* Reservations Tab */}
      {s.activeTab === 'quotas' && (
        <CompactErrorBoundary context="GPUReservationsTab">
        <GPUReservationsTab
          filteredReservations={s.filteredReservations}
          utilizations={s.utilizations}
          effectiveDemoMode={s.effectiveDemoMode}
          showOnlyMine={s.showOnlyMine}
          searchTerm={s.searchTerm}
          reservationsLoading={s.reservationsLoading}
          expandedReservationId={s.expandedReservationId}
          deleteConfirmId={s.deleteConfirmId}
          showReservationForm={s.showReservationForm}
          user={s.user}
          onSetSearchTerm={s.setSearchTerm}
          onSetShowOnlyMine={s.setShowOnlyMine}
          onSetExpandedReservationId={s.setExpandedReservationId}
          onEditReservation={s.openEditForm}
          onDeleteReservation={s.setDeleteConfirmId}
          onCreateReservation={s.openCreateForm}
        />
        </CompactErrorBoundary>
      )}

      {/* Inventory Tab */}
      {s.activeTab === 'inventory' && (
        <CompactErrorBoundary context="GPUInventoryTab">
        <GPUInventoryTab
          gpuClusters={s.gpuClusters}
          nodes={s.nodes}
          nodesLoading={s.nodesLoading}
          effectiveDemoMode={s.effectiveDemoMode}
        />
        </CompactErrorBoundary>
      )}

      {/* Dashboard Tab */}
      {s.activeTab === 'dashboard' && (
        <CompactErrorBoundary context="GPUDashboardTab">
        <GPUDashboardTab
          dashboardCards={s.dashboardCards}
          dashCardIds={s.dashCardIds}
          gpuDashSensors={s.gpuDashSensors}
          gpuLiveMode={s.gpuLiveMode}
          isRefreshingDashboard={s.isRefreshingDashboard}
          onDashDragEnd={s.handleDashDragEnd}
          onRemoveDashboardCard={s.handleRemoveDashboardCard}
          onDashCardWidthChange={s.handleDashCardWidthChange}
          onTriggerRefresh={s.triggerRefresh}
          onShowAddCardModal={s.openAddCardModal}
        />
        </CompactErrorBoundary>
      )}

      <GPUReservationsModals
        t={s.t}
        showAddCardModal={s.showAddCardModal}
        closeAddCardModal={s.closeAddCardModal}
        handleAddDashboardCards={s.handleAddDashboardCards}
        dashboardCardTypes={s.dashboardCards.map(c => c.type)}
        showReservationForm={s.showReservationForm}
        closeReservationForm={s.closeReservationForm}
        editingReservation={s.editingReservation}
        gpuClusters={s.gpuClusters}
        rawNodes={s.rawNodes}
        user={s.user}
        prefillDate={s.prefillDate}
        gpuLiveMode={s.gpuLiveMode}
        knownNamespacesByCluster={s.knownNamespacesByCluster}
        apiCreateReservation={s.apiCreateReservation}
        apiUpdateReservation={s.apiUpdateReservation}
        showToast={s.showToast}
        deleteConfirmId={s.deleteConfirmId}
        setDeleteConfirmId={s.setDeleteConfirmId}
        deleteConfirmReservation={s.deleteConfirmReservation}
        handleDeleteReservation={s.handleDeleteReservation}
        isDeleting={s.isDeleting}
      />
    </div>
  )
}
