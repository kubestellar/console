/**
 * Cards section for DashboardPage: header toggle, empty state, and the
 * drag-and-drop card grid (with virtualization support).
 *
 * Split out of DashboardPage.tsx (issues 22978 / 23018) to keep the page
 * container focused on wiring state into presentational sections.
 */
import { ComponentType, ReactNode, RefObject } from 'react'
import {
  DndContext,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react'
import { EmptyState, EmptyStateAction } from '../../../components/ui/EmptyState'
import { DashboardHealthIndicator } from '../../../components/dashboard/DashboardHealthIndicator'
import { SortableDashboardCard, DragPreviewCard, DASHBOARD_CARD_ROW_HEIGHT_PX } from '../DashboardComponents'
import type { DashboardCard } from '../types'

const GRID_STYLE = { gridAutoRows: `${DASHBOARD_CARD_ROW_HEIGHT_PX}px` } as const
const OVERLAY_Z_INDEX = 9_999

export interface DashboardPageCardsSectionProps {
  title: string
  Icon: ComponentType<{ className?: string }>
  cards: DashboardCard[]
  visibleCards: DashboardCard[]
  shouldVirtualizeCards: boolean
  loadMoreRef: RefObject<HTMLDivElement | null>
  showCards: boolean
  onToggleShowCards: () => void
  emptyState?: {
    title: string
    description: ReactNode
    action?: EmptyStateAction
    secondaryAction?: EmptyStateAction
  }
  emptyTitle: string
  emptyDescription: ReactNode
  defaultEmptyStateAction: EmptyStateAction
  sensors: SensorDescriptor<SensorOptions>[]
  collisionDetection: CollisionDetection
  handleDragStart: (event: DragStartEvent) => void
  handleDragEnd: (event: DragEndEvent) => void
  activeId: string | null
  activeDragData: Record<string, unknown> | null
  cardsGridRef: RefObject<HTMLDivElement | null>
  onConfigureCard: (cardId: string) => void
  onRemoveCard: (cardId: string) => void
  onWidthChange: (cardId: string, newWidth: number) => void
  onHeightChange: (cardId: string, newHeight: number) => void
  isRefreshing: boolean
  onCardRefresh: () => void
  lastUpdated?: Date | null
  useCompactGrid: boolean
  onInsertCard: (index: number | null) => void
  dashboardWidth: number
}

export function DashboardPageCardsSection({
  title,
  Icon,
  cards,
  visibleCards,
  shouldVirtualizeCards,
  loadMoreRef,
  showCards,
  onToggleShowCards,
  emptyState,
  emptyTitle,
  emptyDescription,
  defaultEmptyStateAction,
  sensors,
  collisionDetection,
  handleDragStart,
  handleDragEnd,
  activeId,
  activeDragData,
  cardsGridRef,
  onConfigureCard,
  onRemoveCard,
  onWidthChange,
  onHeightChange,
  isRefreshing,
  onCardRefresh,
  lastUpdated,
  useCompactGrid,
  onInsertCard,
  dashboardWidth }: DashboardPageCardsSectionProps) {
  return (
    <div className="mb-6">
      {/* Card section header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onToggleShowCards}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>{title} Cards ({cards.length})</span>
          {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {cards.length > 0 && <DashboardHealthIndicator size="sm" />}
      </div>

      {/* Cards grid */}
      {showCards && (
        <>
          {cards.length === 0 ? (
            <EmptyState
              icon={<Icon className="w-12 h-12 text-muted-foreground" />}
              title={emptyTitle}
              description={emptyDescription}
              action={emptyState?.action ?? defaultEmptyStateAction}
              secondaryAction={emptyState?.secondaryAction}
              data-testid="dashboard-empty-state"
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={visibleCards.map(c => c.id)} strategy={rectSortingStrategy}>
                <div
                  ref={cardsGridRef}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 min-w-0"
                  data-testid="dashboard-cards-grid"
                  style={GRID_STYLE}
                >
                  {visibleCards.map((card, index) => (
                    <SortableDashboardCard
                      key={card.id}
                      card={card}
                      onConfigure={() => onConfigureCard(card.id)}
                      onRemove={() => onRemoveCard(card.id)}
                      onWidthChange={(newWidth) => onWidthChange(card.id, newWidth)}
                      onHeightChange={(newHeight) => onHeightChange(card.id, newHeight)}
                      isDragging={activeId === card.id}
                      isRefreshing={isRefreshing}
                      onRefresh={onCardRefresh}
                      lastUpdated={lastUpdated}
                      useCompactGrid={useCompactGrid}
                      onInsertBefore={() => onInsertCard(index)}
                      onInsertAfter={() => onInsertCard(index + 1)}
                      containerWidth={dashboardWidth}
                    />
                  ))}
                </div>
                {shouldVirtualizeCards && visibleCards.length < cards.length && (
                  <div ref={loadMoreRef} className="h-1 w-full" aria-hidden="true" />
                )}
              </SortableContext>
              <DragOverlay dropAnimation={null} zIndex={OVERLAY_Z_INDEX}>
                {activeId && cards.find(c => c.id === activeId) ? (
                  <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
          )}
        </>
      )}
    </div>
  )
}
