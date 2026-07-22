import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core'

/** Minimum pointer movement (px) before a drag activates. */
export const POINTER_SENSOR_ACTIVATION_DISTANCE = 3

/**
 * Custom collision detection strategy for the dashboard.
 *
 * - Workload drags use pointer + rect intersection and target cluster-group
 *   or dashboard-drop zones exclusively.
 * - Card reorder drags use closest-center with a dashboard-drop fallback so
 *   cards can be moved to another dashboard via the drop zone.
 */
export const dashboardCollisionDetection: CollisionDetection = (args) => {
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
      collision =>
        String(collision.id).startsWith('cluster-group-') ||
        String(collision.id).startsWith('cluster-drop-'),
    )
    if (targetCollision) return [targetCollision]
    const cardTarget = unique.find(collision => String(collision.id) === 'cluster-groups-card')
    if (cardTarget) return [cardTarget]
    const dashboardCollision = unique.find(
      collision =>
        String(collision.id).startsWith('dashboard-drop-') ||
        String(collision.id) === 'create-new-dashboard',
    )
    if (dashboardCollision) return [dashboardCollision]
    return []
  }

  const centerCollisions = closestCenter(args)
  const pointerCollisions = pointerWithin(args)
  const dashboardDropTarget = pointerCollisions.find(
    collision =>
      String(collision.id).startsWith('dashboard-drop-') ||
      String(collision.id) === 'create-new-dashboard',
  )
  if (dashboardDropTarget) return [dashboardDropTarget]
  return centerCollisions
}
