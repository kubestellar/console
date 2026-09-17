import {
  DndContext,
  DragOverlay } from '@dnd-kit/core'
import type { CollisionDetection, DragEndEvent, DragStartEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { SortableCard } from './SortableCard'
import { DragPreviewCard } from './DragPreviewCard'
import type { Card } from './types'

interface CardGridProps {
  cards: Card[]
  activeId: string | null
  sensors: SensorDescriptor<SensorOptions>[]
  collisionDetection: CollisionDetection
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void
  isRefreshing: boolean
  lastUpdated: Date | null
  onRefresh: () => void
  onConfigure: (card: Card) => void
  onRemove: (cardId: string) => void
  onWidthChange: (cardId: string, width: number) => void
  onHeightChange: (cardId: string, height: number) => void
  onInsertBefore: (index: number) => void
  onInsertAfter: (index: number) => void
}

/**
 * Renders the drag-and-drop sortable grid of dashboard cards.
 *
 * Extracted from CustomDashboard.tsx to isolate the @dnd-kit rendering tree
 * from the surrounding page layout and state management.
 */
export function CardGrid({
  cards,
  activeId,
  sensors,
  collisionDetection,
  onDragStart,
  onDragEnd,
  isRefreshing,
  lastUpdated,
  onRefresh,
  onConfigure,
  onRemove,
  onWidthChange,
  onHeightChange,
  onInsertBefore,
  onInsertAfter,
}: CardGridProps) {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 auto-rows-min grid-flow-dense">
          {cards.map((card, index) => (
            <SortableCard
              key={card.id}
              card={card}
              onConfigure={() => onConfigure(card)}
              onRemove={() => onRemove(card.id)}
              onWidthChange={(w) => onWidthChange(card.id, w)}
              onHeightChange={(h) => onHeightChange(card.id, h)}
              isDragging={activeId === card.id}
              isRefreshing={isRefreshing}
              onRefresh={onRefresh}
              lastUpdated={lastUpdated}
              onInsertBefore={() => onInsertBefore(index)}
              onInsertAfter={() => onInsertAfter(index + 1)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId ? (
          (() => {
            const dragCard = cards.find(c => c.id === activeId)
            return dragCard ? (
              <div className="opacity-80 rotate-3 scale-105">
                <DragPreviewCard card={dragCard} />
              </div>
            ) : null
          })()
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
