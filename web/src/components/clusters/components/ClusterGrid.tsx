import { memo } from 'react'
import { GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { type ClusterGridProps } from './clusterCardUtils'
import { FullClusterCard } from './FullClusterCard'
import { ListClusterCard } from './ListClusterCard'
import { CompactClusterCard } from './CompactClusterCard'

export type { ClusterLayoutMode } from './clusterCardUtils'

// Sortable wrapper for individual cluster items
function SortableClusterItem({ id, children, onReorder }: { id: string; children: (dragHandle: React.ReactNode) => React.ReactNode; onReorder?: (names: string[]) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : undefined }

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

export const ClusterGrid = memo(function ClusterGrid({
  clusters,
  gpuByCluster,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
  onRemoveCluster,
  onReorder,
  layoutMode = 'grid' }: ClusterGridProps) {
  const { t } = useTranslation()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const safeClusters = clusters || []

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !onReorder) return
    const oldIndex = safeClusters.findIndex(c => c.name === active.id)
    const newIndex = safeClusters.findIndex(c => c.name === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(safeClusters, oldIndex, newIndex)
    onReorder((reordered || []).map(c => c.name))
  }

  if (safeClusters.length === 0) {
    return (
      <div className="text-center py-12 mb-6">
        <p className="text-muted-foreground">{t('cluster.noClustersMatchFilter')}</p>
      </div>
    )
  }

  // Grid layout classes based on mode
  const gridClasses = {
    grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    list: 'flex flex-col gap-3',
    compact: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3',
    wide: 'grid grid-cols-1 lg:grid-cols-2 gap-4' }

  const sortingStrategy = layoutMode === 'list' ? verticalListSortingStrategy : rectSortingStrategy
  const clusterIds = (safeClusters || []).map(c => c.name)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clusterIds} strategy={sortingStrategy}>
        <div className={`${gridClasses[layoutMode]} mb-6 pt-1`}>
          {(safeClusters || []).map((cluster) => {
            const clusterKey = cluster.name.split('/')[0]
            const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
            const clusterIsAdmin = isClusterAdmin(cluster.name)

            return (
              <SortableClusterItem key={cluster.name} id={cluster.name} onReorder={onReorder}>
                {(dragHandle) => {
                  const removeHandler = onRemoveCluster ? () => onRemoveCluster(cluster.name) : undefined
                  if (layoutMode === 'list') {
                    return (
                      <ListClusterCard
                        cluster={cluster}
                        gpuInfo={gpuInfo}
                        isConnected={isConnected}
                        permissionsLoading={permissionsLoading}
                        isClusterAdmin={clusterIsAdmin}
                        onSelectCluster={() => onSelectCluster(cluster.name)}
                        onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
                        onRemoveCluster={removeHandler}
                        dragHandle={dragHandle}
                      />
                    )
                  }

                  if (layoutMode === 'compact') {
                    return (
                      <CompactClusterCard
                        cluster={cluster}
                        gpuInfo={gpuInfo}
                        isConnected={isConnected}
                        onSelectCluster={() => onSelectCluster(cluster.name)}
                        onRemoveCluster={removeHandler}
                        dragHandle={dragHandle}
                      />
                    )
                  }

                  // grid and wide use the full card
                  return (
                    <FullClusterCard
                      cluster={cluster}
                      gpuInfo={gpuInfo}
                      isConnected={isConnected}
                      permissionsLoading={permissionsLoading}
                      isClusterAdmin={clusterIsAdmin}
                      onSelectCluster={() => onSelectCluster(cluster.name)}
                      onRenameCluster={() => onRenameCluster(cluster.name)}
                      onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
                      onRemoveCluster={removeHandler}
                      dragHandle={dragHandle}
                    />
                  )
                }}
              </SortableClusterItem>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
})
