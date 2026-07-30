import { memo } from 'react'
import type { ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ClusterInfo } from '../../../hooks/useMCP'
import type { ClusterLayoutMode } from './ClusterGrid.types'

export const ClusterDragReorder = memo(function ClusterDragReorder({
  clusters,
  layoutMode,
  onReorder,
  children,
}: {
  clusters: ClusterInfo[]
  layoutMode: ClusterLayoutMode
  onReorder?: (clusterNames: string[]) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return

    const oldIndex = clusters.findIndex((cluster) => cluster.name === active.id)
    const newIndex = clusters.findIndex((cluster) => cluster.name === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(clusters, oldIndex, newIndex)
    onReorder((reordered || []).map((cluster) => cluster.name))
  }

  const clusterIds = (clusters || []).map((cluster) => cluster.name)
  const sortingStrategy = layoutMode === 'list' ? verticalListSortingStrategy : rectSortingStrategy

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clusterIds} strategy={sortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
})

export function SortableClusterItem({
  id,
  children,
  onReorder,
}: {
  id: string
  children: (dragHandle: ReactNode) => ReactNode
  onReorder?: (clusterNames: string[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : undefined,
  }

  const dragHandle = onReorder ? (
    <button
      {...attributes}
      {...listeners}
      className="p-0.5 rounded hover:bg-secondary/80 cursor-grab active:cursor-grabbing shrink-0 touch-none"
      title="Drag to reorder"
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
    </button>
  ) : null

  return (
    <div ref={setNodeRef} style={style} data-testid={`cluster-row-${id}`}>
      {children(dragHandle)}
    </div>
  )
}
