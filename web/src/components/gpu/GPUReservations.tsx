import { FlaskConical, Loader2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals'
import { StatusBadge } from '../ui/StatusBadge'
import { AddCardModal } from '../dashboard/AddCardModal'
import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { ReservationFormModal } from './ReservationFormModal'
import { GPUOverviewTab } from './GPUOverviewTab'
import { GPUCalendarTab } from './GPUCalendarTab'
import { GPUInventoryTab } from './GPUInventoryTab'
import { GPUDashboardTab } from './GPUDashboardTab'
import { QuotaBar } from './QuotaBar'
import { ReservationTable } from './ReservationTable'
import { useGPUReservations } from './useGPUReservations'

export function GPUReservations() {
  const { t } = useTranslation(['cards', 'common'])
  const {
    rawNodes,
    nodes,
    nodesLoading,
    user,
    effectiveDemoMode,
    gpuLiveMode,
    activeTab,
    setActiveTab,
    currentMonth,
    showReservationForm,
    expandedReservationId,
    setExpandedReservationId,
    editingReservation,
    deleteConfirmId,
    setDeleteConfirmId,
    deleteConfirmReservation,
    isDeleting,
    showOnlyMine,
    searchTerm,
    setSearchTerm,
    setShowOnlyMine,
    prefillDate,
    showAddCardModal,
    openAddCardModal,
    closeAddCardModal,
    dashboardCards,
    dashCardIds,
    gpuDashSensors,
    isRefreshingDashboard,
    triggerRefresh,
    filteredReservations,
    reservationsLoading,
    utilizations,
    gpuClusters,
    knownNamespacesByCluster,
    stats,
    calendarWeeks,
    getGPUCountForDay,
    prevMonth,
    nextMonth,
    handleDeleteReservation,
    openCreateForm,
    openEditForm,
    closeReservationForm,
    openCreateFormForDate,
    goToReservation,
    toggleShowOnlyMine,
    handleAddDashboardCards,
    handleRemoveDashboardCard,
    handleDashCardWidthChange,
    handleDashDragEnd,
    saveReservation,
    activateReservation,
    showToast,
    isLoading,
  } = useGPUReservations()

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

      <QuotaBar
        activeTab={activeTab}
        filteredReservationsCount={filteredReservations.length}
        user={user}
        showOnlyMine={showOnlyMine}
        onSetActiveTab={setActiveTab}
        onToggleShowOnlyMine={toggleShowOnlyMine}
        onCreateReservation={openCreateForm}
        overviewLabel={t('gpuReservations.tabs.overview')}
        calendarLabel={t('gpuReservations.tabs.calendar')}
        reservationsLabel={t('gpuReservations.tabs.reservations')}
        inventoryLabel={t('gpuReservations.tabs.inventory')}
        dashboardLabel={t('gpuReservations.tabs.dashboard')}
        myReservationsLabel={t('gpuReservations.myReservations')}
        createReservationLabel={t('gpuReservations.createReservation')}
      />

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

      {activeTab === 'quotas' && (
        <ReservationTable
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
      )}

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

      <AddCardModal
        isOpen={showAddCardModal}
        onClose={closeAddCardModal}
        onAddCards={handleAddDashboardCards}
        existingCardTypes={dashboardCards.map(card => card.type)}
      />

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
        onSave={saveReservation}
        onActivate={activateReservation}
        onSaved={() => showToast(t('gpuReservations.form.success.saved'), 'success')}
        onError={(msg) => showToast(msg, 'error')}
      />

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
