import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { DashboardDropZone } from './DashboardDropZone'
import { SortableCard, DragPreviewCard } from './SharedSortableCard'
import { DiscoverCardsPlaceholder } from './DiscoverCardsPlaceholder'
import type { DashboardState } from './DashboardState'

type DashboardGridProps = Pick<DashboardState,
  'activeDragData' |
  'activeId' |
  'collisionDetection' |
  'currentCardTypes' |
  'dashboard' |
  'dashboards' |
  'handleAddSingleCard' |
  'handleConfigureCard' |
  'handleCreateDashboard' |
  'handleDragCancel' |
  'handleDragEnd' |
  'handleDragOver' |
  'handleDragStart' |
  'handleGridKeyDown' |
  'handleHeightChange' |
  'handleInsertAfter' |
  'handleInsertBefore' |
  'handleRegisterExpandTrigger' |
  'handleRemoveCard' |
  'handleWidthChange' |
  'isCustomized' |
  'isDragging' |
  'isRefreshing' |
  'lastUpdated' |
  'localCards' |
  'openAddCardModal' |
  'registerCardRef' |
  'sensors' |
  'showDragHint' |
  'triggerRefresh'>

export function DashboardGrid({
  activeDragData,
  activeId,
  collisionDetection,
  currentCardTypes,
  dashboard,
  dashboards,
  handleAddSingleCard,
  handleConfigureCard,
  handleCreateDashboard,
  handleDragCancel,
  handleDragEnd,
  handleDragOver,
  handleDragStart,
  handleGridKeyDown,
  handleHeightChange,
  handleInsertAfter,
  handleInsertBefore,
  handleRegisterExpandTrigger,
  handleRemoveCard,
  handleWidthChange,
  isCustomized,
  isDragging,
  isRefreshing,
  lastUpdated,
  localCards,
  openAddCardModal,
  registerCardRef,
  sensors,
  showDragHint,
  triggerRefresh,
}: DashboardGridProps) {
  const activeCard = activeId ? localCards.find(card => card.id === activeId) : null

  return (
    <>
      <DashboardDropZone
        dashboards={dashboards}
        currentDashboardId={dashboard?.id}
        isDragging={isDragging}
        onCreateDashboard={handleCreateDashboard}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={localCards.map(card => card.id)} strategy={rectSortingStrategy}>
          <div
            data-testid="dashboard-cards-grid"
            data-tour="dashboard"
            role="grid"
            aria-label="Dashboard cards"
            className={`grid grid-cols-1 md:grid-cols-12 gap-2 auto-rows-min grid-flow-dense min-w-0 ${showDragHint ? 'animate-shimmy' : ''}`}
          >
            {localCards.map((card, index) => (
              <SortableCard
                key={card.id}
                card={card}
                onConfigure={() => handleConfigureCard(card)}
                onRemove={() => handleRemoveCard(card.id)}
                onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                onHeightChange={(newHeight) => handleHeightChange(card.id, newHeight)}
                isDragging={activeId === card.id}
                isRefreshing={isRefreshing}
                onRefresh={triggerRefresh}
                lastUpdated={lastUpdated}
                onKeyDown={handleGridKeyDown}
                registerRef={(el) => registerCardRef(card.id, el)}
                registerExpandTrigger={(expand) => handleRegisterExpandTrigger(card.id, expand)}
                onInsertBefore={() => handleInsertBefore(index)}
                onInsertAfter={() => handleInsertAfter(index)}
                isWorkloadDragActive={activeDragData?.type === 'workload'}
              />
            ))}
          </div>
        </SortableContext>

        {!isCustomized && (
          <DiscoverCardsPlaceholder
            existingCardTypes={currentCardTypes}
            onAddCard={handleAddSingleCard}
            onOpenCatalog={openAddCardModal}
          />
        )}

        <DragOverlay dropAnimation={null} zIndex={9999}>
          {activeCard ? (
            <div className="opacity-80 rotate-3 scale-105">
              <DragPreviewCard card={activeCard} />
            </div>
          ) : activeId && activeDragData?.type === 'workload' ? (
            <div className="bg-blue-100 dark:bg-blue-900/60 shadow-xl rounded-lg px-4 py-2 border-2 border-blue-400 max-w-xs pointer-events-none">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                {(activeDragData.workload as { name?: string })?.name || 'Workload'}
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                Drop on a cluster group to deploy
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}
