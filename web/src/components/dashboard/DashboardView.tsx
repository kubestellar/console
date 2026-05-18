import { FloatingDashboardActions } from './FloatingDashboardActions'
import { DashboardGrid } from './DashboardGrid'
import { DashboardModals } from './DashboardModals'
import { DashboardSkeleton } from './DashboardSkeleton'
import { useDashboardState } from './DashboardState'
import { DashboardTopSection } from './DashboardTopSection'

export function DashboardView() {
  const state = useDashboardState()

  if (state.isLoading && state.localCards.length === 0) {
    return <DashboardSkeleton />
  }

  return (
    <div data-testid="dashboard-page" className="pt-4">
      <DashboardTopSection
        activeNudge={state.activeNudge}
        autoRefresh={state.autoRefresh}
        clusters={state.clusters}
        clustersError={state.clustersError}
        currentCardTypes={state.currentCardTypes}
        dismissNudge={state.dismissNudge}
        getStatValue={state.getStatValue}
        handleAddRecommendedCard={state.handleAddRecommendedCard}
        handleNudgeAction={state.handleNudgeAction}
        handleOpenDashboardCatalog={state.handleOpenDashboardCatalog}
        handleRunHealthCheck={state.handleRunHealthCheck}
        isClustersLoading={state.isClustersLoading}
        isFetching={state.isFetching}
        lastUpdated={state.lastUpdated}
        navigate={state.navigate}
        openAddCardModal={state.openAddCardModal}
        openMissionSidebar={state.openMissionSidebar}
        setAutoRefresh={state.setAutoRefresh}
        triggerRefresh={state.triggerRefresh}
      />

      <DashboardGrid
        activeDragData={state.activeDragData}
        activeId={state.activeId}
        collisionDetection={state.collisionDetection}
        currentCardTypes={state.currentCardTypes}
        dashboard={state.dashboard}
        dashboards={state.dashboards}
        handleAddSingleCard={state.handleAddSingleCard}
        handleConfigureCard={state.handleConfigureCard}
        handleCreateDashboard={state.handleCreateDashboard}
        handleDragCancel={state.handleDragCancel}
        handleDragEnd={state.handleDragEnd}
        handleDragOver={state.handleDragOver}
        handleDragStart={state.handleDragStart}
        handleGridKeyDown={state.handleGridKeyDown}
        handleHeightChange={state.handleHeightChange}
        handleInsertAfter={state.handleInsertAfter}
        handleInsertBefore={state.handleInsertBefore}
        handleRegisterExpandTrigger={state.handleRegisterExpandTrigger}
        handleRemoveCard={state.handleRemoveCard}
        handleWidthChange={state.handleWidthChange}
        isCustomized={state.isCustomized}
        isDragging={state.isDragging}
        isRefreshing={state.isRefreshing}
        lastUpdated={state.lastUpdated}
        localCards={state.localCards}
        openAddCardModal={state.openAddCardModal}
        registerCardRef={state.registerCardRef}
        sensors={state.sensors}
        showDragHint={state.showDragHint}
        triggerRefresh={state.triggerRefresh}
      />

      <FloatingDashboardActions
        onOpenCustomizer={state.openAddCardModal}
        onUndo={state.undo}
        onRedo={state.redo}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
      />

      <DashboardModals
        addCardSearch={state.addCardSearch}
        canRedo={state.canRedo}
        canUndo={state.canUndo}
        dashboard={state.dashboard}
        handleAddCards={state.handleAddCards}
        handleApplyTemplate={state.handleApplyTemplate}
        handleCardConfigured={state.handleCardConfigured}
        handleCloseConfigureCard={state.handleCloseConfigureCard}
        handleCloseCustomizer={state.handleCloseCustomizer}
        handleCloseWidgetExport={state.handleCloseWidgetExport}
        handleConfirmDeploy={state.handleConfirmDeploy}
        handleCreateCardFromAI={state.handleCreateCardFromAI}
        handleExportDashboard={state.handleExportDashboard}
        handleSetPendingDeploy={state.handleSetPendingDeploy}
        isAddCardModalOpen={state.isAddCardModalOpen}
        isConfigureCardOpen={state.isConfigureCardOpen}
        isCustomized={state.isCustomized}
        isWidgetExportOpen={state.isWidgetExportOpen}
        localCards={state.localCards}
        pendingDeploy={state.pendingDeploy}
        redo={state.redo}
        reset={state.reset}
        selectedCard={state.selectedCard}
        studioInitialSection={state.studioInitialSection}
        studioWidgetCardType={state.studioWidgetCardType}
        undo={state.undo}
      />
    </div>
  )
}
