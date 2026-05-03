import { memo, useState, useEffect, type KeyboardEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS, LIVE_DATA_CARDS } from '../cards/cardRegistry'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import { formatCardTitle } from '../../lib/formatCardTitle'
import type { Card } from './dashboardUtils'

/**
 * Number of grid rows a collapsed card occupies (#6072). Collapsed cards
 * only show their header, so they shrink to a single row regardless of the
 * card's stored `position.h`. The original `position.h` is preserved on the
 * card model and reapplied when the card is expanded again.
 */
const COLLAPSED_CARD_ROW_SPAN = 1

/**
 * Minimum pixel height contributed by ONE row of card span, used to mirror
 * the legacy `auto-rows-[minmax(180px,auto)]` baseline while the grid itself
 * uses `auto-rows-min` (required so collapsed cards can shrink).
 *
 * Effective card min-height = row count × this constant. Scaling with the
 * row span is what makes the "Resize height" menu actually change card
 * height (#8289, #8298). With a flat constant, `gridRow: span N` only
 * reserves N grid rows but `auto-rows-min` collapses those rows to the
 * card's content, so taller row counts had no visible effect.
 */
const EXPANDED_CARD_ROW_MIN_HEIGHT_PX = 180

interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  onHeightChange: (newHeight: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
  onKeyDown?: (e: KeyboardEvent) => void
  registerRef?: (el: HTMLElement | null) => void
  registerExpandTrigger?: (expand: () => void) => void
  onInsertBefore?: () => void
  onInsertAfter?: () => void
  /** When true, a workload item (not a card) is being dragged — disable sortable to prevent card from hijacking the drag */
  isWorkloadDragActive?: boolean
}

/**
 * Shallow-equal comparison for card config objects.
 * Replaces JSON.stringify which is O(n) allocation-heavy and unstable
 * for semantically equivalent objects with different key order (#4665).
 */
function shallowEqualConfig(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/** Below this width, clamp small cards to half-width (6 cols) for readability */
const NARROW_BREAKPOINT = 1024

/** Minimum card column span at narrow viewports */
const MIN_NARROW_COLS = 6

export const SortableCard = memo(function SortableCard({ card, onConfigure, onRemove, onWidthChange, onHeightChange, isDragging, isRefreshing, onRefresh, lastUpdated, onKeyDown, registerRef, registerExpandTrigger, onInsertBefore: _onInsertBefore, onInsertAfter, isWorkloadDragActive: _isWorkloadDragActive }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
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
    if (mq.matches !== isNarrow) setIsNarrow(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const posW = card.position?.w || 4
  const posH = card.position?.h || 2
  const effectiveW = isNarrow && posW < MIN_NARROW_COLS ? MIN_NARROW_COLS : posW

  // Read the card's collapse state so the grid cell shrinks to a single row
  // when the card is collapsed (#6072). The original `posH` stays untouched
  // on the card model — expanding restores the full row span.
  const { isCollapsed } = useCardCollapse(card.id)
  const effectiveRowSpan = isCollapsed ? COLLAPSED_CARD_ROW_SPAN : posH

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${effectiveW}`,
    gridRow: `span ${effectiveRowSpan}`,
    // Only enforce the legacy minimum height when expanded; collapsed cards
    // must be free to shrink to their header height so neighbouring rows can
    // pack upward instead of leaving dead space. Scale with posH so the
    // "Resize height" menu actually grows/shrinks the card (#8289, #8298).
    minHeight: isCollapsed ? undefined : `${posH * EXPANDED_CARD_ROW_MIN_HEIGHT_PX}px`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  // Render a visible fallback for missing/misspelled card types (#4932)
  if (!CardComponent) {
    return (
      <div
        ref={(el) => { setNodeRef(el); registerRef?.(el) }}
        style={style}
        className="glass rounded-lg p-4 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-warning/40"
      >
        Unknown card type: <code className="ml-1 font-mono text-warning">{card.card_type}</code>
      </div>
    )
  }

  return (
    <div
      ref={(el) => { setNodeRef(el); registerRef?.(el) }}
      style={style}
      className="relative group/card h-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:rounded-xl"
      tabIndex={0}
      role="gridcell"
      aria-label={formatCardTitle(card.card_type)}
      onKeyDown={onKeyDown}
    >
      {onInsertAfter && (
        <button
          onClick={(e) => { e.stopPropagation(); onInsertAfter() }}
          // #8383: Anchor to the right edge centered vertically so the "+"
          // sits between this card and the next column, not on top of the
          // card header action row where the kebab / maximize / report
          // buttons live. `top-2 right-2` from the original #8337 fix put
          // this button in the same coordinate space as the kebab menu
          // (which sits at roughly right:16px inside the header) causing
          // a direct overlap at rest and on hover.
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
        lastSummary={card.last_summary}
        title={card.title}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isLive={LIVE_DATA_CARDS.has(card.card_type)}
        cardWidth={card.position?.w || 4}
        cardHeight={card.position?.h || 2}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        registerExpandTrigger={registerExpandTrigger}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
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
          <CardComponent config={card.config ?? {}} />
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
    (prevProps.card.position?.w || 4) === (nextProps.card.position?.w || 4) &&
    (prevProps.card.position?.h || 2) === (nextProps.card.position?.h || 2) &&
    prevProps.card.title === nextProps.card.title &&
    prevProps.card.last_summary === nextProps.card.last_summary &&
    shallowEqualConfig(prevProps.card.config, nextProps.card.config) &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isRefreshing === nextProps.isRefreshing &&
    prevProps.lastUpdated === nextProps.lastUpdated &&
    prevProps.onKeyDown === nextProps.onKeyDown &&
    prevProps.onInsertAfter === nextProps.onInsertAfter &&
    prevProps.isWorkloadDragActive === nextProps.isWorkloadDragActive
  )
})

export function DragPreviewCard({ card }: { card: Card }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      className="rounded-lg glass border border-purple-500/50 p-4 shadow-xl"
      style={{
        width: `${(card.position?.w || 4) * 100}px`,
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
