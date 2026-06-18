import { closestCenter, pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core'

export const workloadCollisionDetection: CollisionDetection = (args) => {
  const isWorkloadDrag = args.active.data.current?.type === 'workload'
  if (isWorkloadDrag) {
    const allCollisions = [...pointerWithin(args), ...rectIntersection(args)]
    const seen = new Set<string>()
    const unique = allCollisions.filter(collision => {
      const id = String(collision.id)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    const targetCollision = unique.find(collision => String(collision.id).startsWith('cluster-group-') || String(collision.id).startsWith('cluster-drop-'))
    if (targetCollision) return [targetCollision]
    const cardTarget = unique.find(collision => String(collision.id) === 'cluster-groups-card')
    if (cardTarget) return [cardTarget]
    const dashboardCollision = unique.find(collision => String(collision.id).startsWith('dashboard-drop-') || String(collision.id) === 'create-new-dashboard')
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
}
