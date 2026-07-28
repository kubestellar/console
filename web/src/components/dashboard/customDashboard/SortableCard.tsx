import { useState, useEffect } from 'react'
import { GripVertical } from 'lucide-react'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { CardWrapper } from '../../cards/CardWrapper'
import { CARD_COMPONENTS } from '../../cards/cardRegistry'
import { useCardCollapse } from '../../../lib/cards/cardHooks'
import { formatCardTitle } from '../../../lib/formatCardTitle'
import type { Card } from './types'

/** Clamp small cards in the md–lg range (768–1023px) for readability */
const NARROW_MIN = 768
const NARROW_MAX = 1023

/** Minimum card column span at narrow viewports */
const MIN_NARROW_COLS = 6

/**
 * Minimum pixel height contributed by ONE row of card span. Effective
 * min-height = posH × this constant, so the "Resize height" menu has a
 * visible effect on `auto-rows-min` grids (#8289, #8298). Mirrors the
 * legacy `auto-rows-[minmax(180px,auto)]` baseline (180px per row).
 */
const EXPANDED_CARD_ROW_MIN_HEIGHT_PX = 180

/** Default row span when a card has no persisted position.h */
const DEFAULT_CARD_ROW_SPAN = 2

export interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  onHeightChange: (newHeight: number) => void
  isDragging?: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
  onInsertBefore?: () => void
  onInsertAfter?: () => void
}

export function SortableCard({ card, onConfigure, onRemove, onWidthChange, onHeightChange, isDragging, isRefreshing, onRefresh, lastUpdated, onInsertBefore: _onInsertBefore, onInsertAfter }: SortableCardProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id })

  // In the md–lg range (768–1023px), clamp small cards to min 6 cols
  // so we get max 2 cards per row instead of cramped 3-up layout.
  // Below 768px CSS already switches to a 1-column grid, so no clamping needed there.
  const [isNarrowRange, setIsNarrowRange] = useState(() =>
    typeof window !== 'undefined' &&
    window.innerWidth >= NARROW_MIN &&
    window.innerWidth <= NARROW_MAX
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${NARROW_MIN}px) and (max-width: ${NARROW_MAX}px)`)
    const handler = (e: MediaQueryListEvent) => setIsNarrowRange(e.matches)
    if (mq.matches !== isNarrowRange) setIsNarrowRange(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveW = isNarrowRange && (card.position?.w || 4) < MIN_NARROW_COLS ? MIN_NARROW_COLS : (card.position?.w || 4)
  const posH = card.position?.h || DEFAULT_CARD_ROW_SPAN

  // Read collapse state so the cell can drop its minimum height when the
  // card is collapsed (#6072). Without this, the grid leaves dead space
  // under collapsed cards because every cell is forced to the expanded
  // baseline height.
  const { isCollapsed } = useCardCollapse(card.id)
  const effectiveRowSpan = isCollapsed ? 1 : posH

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${effectiveW}`,
    gridRow: `span ${effectiveRowSpan}`,
    // Scale min-height by posH so the "Resize height" menu actually changes
    // the card's visual height on an auto-rows-min grid (#8289, #8298).
    minHeight: isCollapsed ? undefined : `${posH * EXPANDED_CARD_ROW_MIN_HEIGHT_PX}px`,
    opacity: isDragging ? 0.5 : 1 }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  if (!CardComponent) {
    return (
      <div ref={setNodeRef} style={style} className="relative group/card">
        {onInsertAfter && (
          <button
            onClick={(e) => { e.stopPropagation(); onInsertAfter() }}
            className="absolute top-1/2 -translate-y-1/2 right-2 z-20 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary transition-all w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow-lg hover:scale-110 ring-2 ring-background"
            aria-label="Add card"
            title="Add card here"
          >
            +
          </button>
        )}
        <CardWrapper
          cardId={card.id}
          cardType={card.card_type}
          title={formatCardTitle(card.card_type)}
          onConfigure={onConfigure}
          onRemove={onRemove}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          cardWidth={effectiveW}
          cardHeight={card.position?.h || 2}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          lastUpdated={lastUpdated}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {t('drilldown.unknownViewType')}: {card.card_type}
          </div>
        </CardWrapper>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group/card">
      {onInsertAfter && (
        <button
          onClick={(e) => { e.stopPropagation(); onInsertAfter() }}
          className="absolute top-1/2 -translate-y-1/2 right-2 z-20 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary transition-all w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shadow-lg hover:scale-110 ring-2 ring-background"
          aria-label="Add card"
          title="Add card here"
        >
          +
        </button>
      )}
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity bg-secondary/80"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        cardWidth={effectiveW}
        cardHeight={card.position?.h || 2}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
      >
        <CardComponent config={card.config ?? {}} />
      </CardWrapper>
    </div>
  )
}
