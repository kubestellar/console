/**
 * DashboardGrid - Grid layout for dashboard cards
 *
 * Renders a responsive grid of cards with optional drag-and-drop support.
 */

import { useState, useEffect, Suspense } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { DashboardCardPlacement, DashboardFeatures } from '../types'
import { UnifiedCard } from '../card'
import { getCardConfig } from '../../../config/cards'
import { getCardComponent } from '../../../components/cards/cardRegistry'
import { CardWrapper } from '../../../components/cards/CardWrapper'
import { DashboardHealthIndicator } from '../../../components/dashboard/DashboardHealthIndicator'
import { useDashboardHealth } from '../../../hooks/useDashboardHealth'

/** Viewport width breakpoint below which small cards are clamped to wider minimum */
const NARROW_VIEWPORT_BREAKPOINT_PX = 1024

/**
 * Minimum pixel height contributed by ONE row of card span. Mirrors the
 * constant in SharedSortableCard.tsx so both dashboard renderers respond
 * identically to the "Resize height" menu (#8335, #8336). Without scaling
 * by the row span, `gridRow: span N` reserves grid rows but `auto-rows-min`
 * collapses them to content height, so height changes have no visible
 * effect (same bug class as #8289/#8298 for the legacy grid).
 */
const EXPANDED_CARD_ROW_MIN_HEIGHT_PX = 180

export interface DashboardGridProps {
  /** Card placements */
  cards: DashboardCardPlacement[]
  /** Features configuration */
  features?: DashboardFeatures
  /** Called when cards are reordered */
  onReorder?: (cards: DashboardCardPlacement[]) => void
  /** Called when a card is removed */
  onRemoveCard?: (cardId: string) => void
  /** Called when a card is configured */
  onConfigureCard?: (cardId: string) => void
  /** Whether data is loading */
  isLoading?: boolean
  /** Additional className */
  className?: string
}

/**
 * DashboardGrid - Renders a grid of cards
 */
export function DashboardGrid({
  cards,
  features,
  onReorder,
  onRemoveCard,
  onConfigureCard,
  isLoading = false,
  className = '' }: DashboardGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const health = useDashboardHealth()

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates })
  )

  // Get the active card for drag overlay
  const activeCard = (() => {
    if (!activeId) return null
    return cards.find((c) => c.id === activeId) || null
  })()

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
      setActiveId(null)

      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = cards.findIndex((c) => c.id === active.id)
      const newIndex = cards.findIndex((c) => c.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
        const newCards = arrayMove(cards, oldIndex, newIndex)
        onReorder(newCards)
      }
    }

  // Enable drag-drop if configured and we have a reorder handler
  const enableDragDrop = features?.dragDrop !== false && !!onReorder

  // Render grid content
  const gridContent = (
    <div className={className}>
      {/* Health indicator banner - shown only when there are issues */}
      {health.status !== 'healthy' && (
        <div className="mb-3">
          <DashboardHealthIndicator size="sm" />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 min-w-0">
        {cards.map((placement) => (
          <DashboardCardWrapper
            key={placement.id}
            placement={placement}
            isDraggable={enableDragDrop}
            isLoading={isLoading}
            onRemove={onRemoveCard ? () => onRemoveCard(placement.id) : undefined}
            onConfigure={
              onConfigureCard ? () => onConfigureCard(placement.id) : undefined
            }
          />
        ))}
      </div>
    </div>
  )

  // Wrap with DnD context if drag-drop is enabled
  if (enableDragDrop) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={rectSortingStrategy}
        >
          {gridContent}
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeCard && (
            <DashboardCardWrapper
              placement={activeCard}
              isDraggable={false}
              isOverlay={true}
            />
          )}
        </DragOverlay>
      </DndContext>
    )
  }

  return gridContent
}

/**
 * Wrapper for individual cards with sortable support
 */
interface DashboardCardWrapperProps {
  placement: DashboardCardPlacement
  isDraggable?: boolean
  isOverlay?: boolean
  isLoading?: boolean
  onRemove?: () => void
  onConfigure?: () => void
}

function DashboardCardWrapper({
  placement,
  isDraggable = false,
  isOverlay = false,
  isLoading = false,
  onRemove,
  onConfigure }: DashboardCardWrapperProps) {
  // Get sortable props if draggable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging } = useSortable({
    id: placement.id,
    disabled: !isDraggable })

  // At narrow viewports (< 1024px), clamp small cards to min 6 cols
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < NARROW_VIEWPORT_BREAKPOINT_PX
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    // Sync initial state only if it differs to avoid cascading re-renders
    // across dozens of card instances on mobile (React error #185)
    if (mq.matches !== isNarrow) setIsNarrow(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rawW = Math.min(12, Math.max(3, placement.position?.w || 4))
  const effectiveW = isNarrow && rawW < 6 ? 6 : rawW

  // Scale min-height by row span so the "Resize height" menu actually
  // grows/shrinks the card (#8335, #8336). Uses the same constant as
  // SharedSortableCard so both renderers behave identically.
  const posH = placement.position?.h || 2
  const minHeightPx = posH * EXPANDED_CARD_ROW_MIN_HEIGHT_PX

  // Get card config - support both cardType (new) and card_type (legacy localStorage)
  const cardTypeKey = placement.cardType || (placement as { card_type?: string }).card_type
  const cardConfig = cardTypeKey ? getCardConfig(cardTypeKey) : undefined

  // Style for drag transform + min-height + grid column span
  // Use inline gridColumn instead of Tailwind col-span-* classes because
  // dynamic class names (col-span-${n}) aren't detected by Tailwind JIT.
  const style: React.CSSProperties = {
    minHeight: `${minHeightPx}px`,
    gridColumn: `span ${effectiveW} / span ${effectiveW}`,
    gridRow: `span ${posH} / span ${posH}`,
    ...(isDraggable
      ? {
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1 }
      : {}) }

  // Fallback: component-only cards (no config file) render directly via CardWrapper
  const DirectComponent = !cardConfig && cardTypeKey ? getCardComponent(cardTypeKey) : undefined

  if (!cardConfig && !DirectComponent) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="glass rounded-lg p-4 flex items-center justify-center text-muted-foreground"
      >
        Unknown card type: {cardTypeKey || 'undefined'}
      </div>
    )
  }

  const dragHandleNode = isDraggable ? (
    <button
      {...attributes}
      {...listeners}
      className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
      title="Drag to reorder"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground" />
    </button>
  ) : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isOverlay ? 'shadow-2xl' : ''}
    >
      <div className="relative h-full">
        {/* The actual card */}
        {cardConfig ? (
          <UnifiedCard
            config={cardConfig}
            instanceConfig={placement.config as Record<string, unknown> | undefined}
            title={placement.title}
            className="h-full glass rounded-lg"
          />
        ) : DirectComponent ? (
          <CardWrapper
            cardId={placement.id}
            cardType={cardTypeKey!}
            title={placement.title}
            cardWidth={placement.position?.w || 4}
            dragHandle={dragHandleNode}
            onRemove={onRemove}
            onConfigure={onConfigure}
          >
            <Suspense fallback={<div className="h-full animate-pulse" />}>
              <DirectComponent config={placement.config as Record<string, unknown> | undefined} />
            </Suspense>
          </CardWrapper>
        ) : null}

        {/* Loading overlay */}
        {isLoading && !isOverlay && (
          <div className="absolute inset-0 bg-background/50 rounded-lg flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardGrid
