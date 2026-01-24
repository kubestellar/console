import { memo, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, LayoutGrid, ChevronDown, ChevronRight, RefreshCw, Hourglass } from 'lucide-react'
import * as Icons from 'lucide-react'
import { LucideIcon } from 'lucide-react'
import { DashboardCard } from './types'
import { CardWrapper } from '../../components/cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../../components/cards/cardRegistry'
import { formatCardTitle } from '../../lib/formatCardTitle'

// ============================================================================
// Icon Resolver
// ============================================================================

function getIcon(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon>)[name] || Icons.HelpCircle
}

// ============================================================================
// SortableDashboardCard - Draggable card wrapper
// ============================================================================

export interface SortableDashboardCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

export const SortableDashboardCard = memo(function SortableDashboardCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableDashboardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const cardWidth = card.position?.w || 4
  const cardHeight = card.position?.h || 2

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${cardWidth}`,
    gridRow: `span ${cardHeight}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Unknown card type: ${card.card_type}`)
    return null
  }

  return (
    <div ref={setNodeRef} style={style}>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        cardWidth={cardWidth}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
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
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// ============================================================================
// DragPreviewCard - Preview shown during drag
// ============================================================================

export interface DragPreviewCardProps {
  card: DashboardCard
}

export function DragPreviewCard({ card }: DragPreviewCardProps) {
  const cardWidth = card.position?.w || 4

  return (
    <div
      className="glass rounded-lg p-4 shadow-xl opacity-80 rotate-3 scale-105"
      style={{ width: `${(cardWidth / 12) * 100}%`, minWidth: 200, maxWidth: 400 }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {card.title || formatCardTitle(card.card_type)}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// DashboardHeader - Standard dashboard header
// ============================================================================

export interface DashboardHeaderProps {
  /** Dashboard title */
  title: string
  /** Description below title */
  description?: string
  /** Icon name */
  icon: string
  /** Whether data is refreshing */
  isRefreshing?: boolean
  /** Auto-refresh enabled */
  autoRefresh?: boolean
  /** Toggle auto-refresh */
  onAutoRefreshChange?: (enabled: boolean) => void
  /** Manual refresh handler */
  onRefresh?: () => void
  /** Whether refresh is in progress */
  isFetching?: boolean
  /** Extra controls */
  extra?: ReactNode
}

export function DashboardHeader({
  title,
  description,
  icon,
  isRefreshing,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  isFetching,
  extra,
}: DashboardHeaderProps) {
  const Icon = getIcon(icon)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Icon className="w-6 h-6 text-purple-400" />
              {title}
            </h1>
            {description && (
              <p className="text-muted-foreground">{description}</p>
            )}
          </div>
          {isRefreshing && (
            <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
              <Hourglass className="w-3 h-3" />
              <span>Updating</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onAutoRefreshChange && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => onAutoRefreshChange(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isFetching}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          )}
          {extra}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DashboardCardsSection - Card grid section with toggle
// ============================================================================

export interface DashboardCardsSectionProps {
  /** Section title */
  title: string
  /** Number of cards */
  cardCount: number
  /** Whether section is expanded */
  isExpanded: boolean
  /** Toggle expand/collapse */
  onToggle: () => void
  /** Children (the cards grid) */
  children: ReactNode
}

export function DashboardCardsSection({
  title,
  cardCount,
  isExpanded,
  onToggle,
  children,
}: DashboardCardsSectionProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>{title} ({cardCount})</span>
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && children}
    </div>
  )
}

// ============================================================================
// DashboardEmptyCards - Empty state when no cards
// ============================================================================

export interface DashboardEmptyCardsProps {
  /** Icon name */
  icon: string
  /** Title */
  title: string
  /** Description */
  description: string
  /** Add cards handler */
  onAddCards: () => void
}

export function DashboardEmptyCards({
  icon,
  title,
  description,
  onAddCards,
}: DashboardEmptyCardsProps) {
  const Icon = getIcon(icon)

  return (
    <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
      <div className="flex justify-center mb-4">
        <Icon className="w-12 h-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
        {description}
      </p>
      <button
        onClick={onAddCards}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Cards
      </button>
    </div>
  )
}

// ============================================================================
// DashboardCardsGrid - Grid container for cards
// ============================================================================

export interface DashboardCardsGridProps {
  children: ReactNode
  columns?: number
  gap?: number
}

export function DashboardCardsGrid({
  children,
  columns = 12,
  gap: _gap = 4,
}: DashboardCardsGridProps) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  )
}
