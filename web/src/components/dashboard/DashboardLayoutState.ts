import { useState, useCallback } from 'react'
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDashboardLayoutState() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<Record<string, unknown> | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const isWorkloadDrag = args.active.data.current?.type === 'workload'
    if (isWorkloadDrag) {
      const allCollisions = [
        ...pointerWithin(args),
        ...rectIntersection(args),
      ]
      const seen = new Set<string>()
      const unique = allCollisions.filter(collision => {
        const id = String(collision.id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      const targetCollision = unique.find(
        collision => String(collision.id).startsWith('cluster-group-') || String(collision.id).startsWith('cluster-drop-'),
      )
      if (targetCollision) return [targetCollision]
      const cardTarget = unique.find(collision => String(collision.id) === 'cluster-groups-card')
      if (cardTarget) return [cardTarget]
      const dashboardCollision = unique.find(
        collision => String(collision.id).startsWith('dashboard-drop-') || String(collision.id) === 'create-new-dashboard',
      )
      if (dashboardCollision) return [dashboardCollision]
      return []
    }
    const centerCollisions = closestCenter(args)
    const pointerCollisions = pointerWithin(args)
    const dashboardDropTarget = pointerCollisions.find(
      collision => String(collision.id).startsWith('dashboard-drop-') || String(collision.id) === 'create-new-dashboard',
    )
    if (dashboardDropTarget) return [dashboardDropTarget]
    return centerCollisions
  }, [])

  const beginDrag = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string
    const data = event.active.data.current as Record<string, unknown> | null
    setActiveId(id)
    setActiveDragData(data)
    setIsDragging(true)
  }, [])

  const updateDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (over && (String(over.id).startsWith('dashboard-drop-') || String(over.id) === 'create-new-dashboard')) {
      const dashboardId = over.data?.current?.dashboardId
      setDragOverDashboard(dashboardId || null)
      return
    }
    setDragOverDashboard(null)
  }, [])

  const resetDragState = useCallback(() => {
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)
  }, [])

  return {
    activeDragData,
    activeId,
    beginDrag,
    collisionDetection,
    dragOverDashboard,
    isDragging,
    resetDragState,
    sensors,
    updateDragOver,
  }
}
