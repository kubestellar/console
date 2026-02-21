import { memo, useState, useEffect, type KeyboardEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS, LIVE_DATA_CARDS } from '../cards/cardRegistry'
import { formatCardTitle } from '../../lib/formatCardTitle'
import type { Card } from './dashboardUtils'

interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onReplace: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
  onKeyDown?: (e: KeyboardEvent) => void
  registerRef?: (el: HTMLElement | null) => void
  registerExpandTrigger?: (expand: () => void) => void
}

/** Below this width, clamp small cards to half-width (6 cols) for readability */
const NARROW_BREAKPOINT = 1024

/** Minimum card column span at narrow viewports */
const MIN_NARROW_COLS = 6

export const SortableCard = memo(function SortableCard({ card, onConfigure, onReplace, onRemove, onWidthChange, isDragging, isRefreshing, onRefresh, lastUpdated, onKeyDown, registerRef, registerExpandTrigger }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  // At narrow viewports (< 1024px), clamp small cards to min 6 cols
  // so we get max 2 cards per row instead of cramped 3-up layout
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < NARROW_BREAKPOINT
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    setIsNarrow(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const effectiveW = isNarrow && card.position.w < MIN_NARROW_COLS ? MIN_NARROW_COLS : card.position.w

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${effectiveW}`,
    gridRow: `span ${card.position.h}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      ref={(el) => { setNodeRef(el); registerRef?.(el) }}
      style={style}
      className="h-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:rounded-xl"
      tabIndex={0}
      role="gridcell"
      aria-label={formatCardTitle(card.card_type)}
      onKeyDown={onKeyDown}
    >
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        lastSummary={card.last_summary}
        title={card.title}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isLive={LIVE_DATA_CARDS.has(card.card_type)}
        cardWidth={card.position.w}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
        onConfigure={onConfigure}
        onReplace={onReplace}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        registerExpandTrigger={registerExpandTrigger}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        {CardComponent ? (
          <CardComponent config={card.config} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Card type: {card.card_type}</p>
          </div>
        )}
      </CardWrapper>
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.card_type === nextProps.card.card_type &&
    prevProps.card.position.w === nextProps.card.position.w &&
    prevProps.card.position.h === nextProps.card.position.h &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.last_summary === nextProps.card.last_summary &&
    JSON.stringify(prevProps.card.config) === JSON.stringify(nextProps.card.config) &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isRefreshing === nextProps.isRefreshing &&
    prevProps.lastUpdated === nextProps.lastUpdated &&
    prevProps.onKeyDown === nextProps.onKeyDown
  )
})

export function DragPreviewCard({ card }: { card: Card }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      className="rounded-lg glass border border-purple-500/50 p-4 shadow-xl"
      style={{
        width: `${card.position.w * 100}px`,
        minWidth: '200px',
        maxWidth: '400px',
      }}
    >
      <div className="text-sm font-medium text-foreground mb-2">
        {formatCardTitle(card.card_type)}
      </div>
      <div className="h-24 flex items-center justify-center text-muted-foreground">
        {CardComponent ? 'Moving card...' : `Card type: ${card.card_type}`}
      </div>
    </div>
  )
}
