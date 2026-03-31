import { Suspense, memo } from 'react'
import {
  AlertTriangle,
  GripVertical,
} from 'lucide-react'
import { CARD_COMPONENTS, getDefaultCardWidth } from '../cards/cardRegistry'
import { CardWrapper, CARD_TITLES } from '../cards/CardWrapper'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Dashboard card type persisted to localStorage
export interface GpuDashCard { type: string; width: number }

// Default GPU dashboard card types
export const GPU_DASHBOARD_CARD_TYPES = [
  'gpu_namespace_allocations', 'gpu_overview', 'gpu_status', 'gpu_inventory',
  'gpu_utilization', 'gpu_usage_trend', 'gpu_workloads', 'hardware_health',
]

export const DEFAULT_GPU_CARDS: GpuDashCard[] = GPU_DASHBOARD_CARD_TYPES.map(
  type => ({ type, width: getDefaultCardWidth(type) })
)

export interface SortableGpuCardProps {
  id: string
  card: GpuDashCard
  index: number
  onRemove: () => void
  onWidthChange: (w: number) => void
  onRefresh?: () => void
  isRefreshing?: boolean
  forceLive?: boolean
}

// Sortable wrapper for GPU dashboard cards
export const SortableGpuCard = memo(function SortableGpuCard({
  id,
  card,
  index,
  onRemove,
  onWidthChange,
  onRefresh,
  isRefreshing,
  forceLive,
}: SortableGpuCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const Component = CARD_COMPONENTS[card.type]

  const colSpan = Math.min(12, Math.max(3, card.width))
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${colSpan} / span ${colSpan}`,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Suspense fallback={<div className="h-64 animate-pulse bg-secondary/30 rounded-xl" />}>
        <CardWrapper
          cardId={`gpu-dash-${card.type}-${index}`}
          title={CARD_TITLES[card.type] ?? card.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          cardType={card.type}
          cardWidth={card.width}
          forceLive={forceLive}
          onRemove={onRemove}
          onWidthChange={onWidthChange}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          dragHandle={
            <button
              {...attributes}
              {...listeners}
              className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
              title="Drag to reorder"
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
          }
        >
          {Component ? (
            <Component />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <p className="text-sm font-medium">Unknown card type: {card.type}</p>
              <p className="text-xs">This card type is not registered. You can remove it.</p>
            </div>
          )}
        </CardWrapper>
      </Suspense>
    </div>
  )
})
