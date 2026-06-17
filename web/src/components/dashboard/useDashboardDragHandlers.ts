import { useCallback } from 'react'
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { emitCardDragged } from '../../lib/analytics'
import type { CardEvent, DeployResultPayload } from '../../lib/cardEvents'
import type { Card, DashboardData } from './dashboardUtils'

interface PendingDeploy {
  workloadName: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName: string
}

export interface DragHandlersDeps {
  localCards: Card[]
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>
  pendingDeploy: PendingDeploy | null
  setActiveId: (id: string | null) => void
  setActiveDragData: (data: Record<string, unknown> | null) => void
  setIsDragging: (v: boolean) => void
  setDragOverDashboard: (v: string | null) => void
  setPendingDeploy: (v: PendingDeploy | null) => void
  snapshot: (cards: Card[]) => void
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
  t: (key: string, fallback?: string, opts?: Record<string, unknown>) => string
  moveCardToDashboard: (cardId: string, dashboardId: string) => Promise<DashboardData | undefined>
  createDashboard: (name: string) => Promise<DashboardData | undefined>
  deployWorkload: (req: { workloadName: string; namespace: string; sourceCluster: string; targetClusters: string[] }, opts?: { onSuccess?: (result: unknown) => void }) => void
  publishCardEvent: (event: CardEvent) => void
}

export function useDashboardDragHandlers({
  localCards,
  setLocalCards,
  pendingDeploy,
  setActiveId,
  setActiveDragData,
  setIsDragging,
  setDragOverDashboard,
  setPendingDeploy,
  snapshot,
  showToast,
  t,
  moveCardToDashboard,
  createDashboard,
  deployWorkload,
  publishCardEvent,
}: DragHandlersDeps) {

  const collisionDetection: CollisionDetection = useCallback((args) => {
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
      const targetCollision = unique.find(
        c => String(c.id).startsWith('cluster-group-') || String(c.id).startsWith('cluster-drop-')
      )
      if (targetCollision) return [targetCollision]
      const cardTarget = unique.find(c => String(c.id) === 'cluster-groups-card')
      if (cardTarget) return [cardTarget]
      const dashboardCollision = unique.find(
        c => String(c.id).startsWith('dashboard-drop-') || String(c.id) === 'create-new-dashboard'
      )
      if (dashboardCollision) return [dashboardCollision]
      return []
    }
    const centerCollisions = closestCenter(args)
    const pointerCollisions = pointerWithin(args)
    const dashboardDropTarget = pointerCollisions.find(
      c => String(c.id).startsWith('dashboard-drop-') || String(c.id) === 'create-new-dashboard'
    )
    if (dashboardDropTarget) return [dashboardDropTarget]
    return centerCollisions
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setActiveDragData(event.active.data.current as Record<string, unknown> | null)
    setIsDragging(true)
  }, [setActiveId, setActiveDragData, setIsDragging])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (over && (String(over.id).startsWith('dashboard-drop-') || String(over.id) === 'create-new-dashboard')) {
      setDragOverDashboard(over.data?.current?.dashboardId || null)
      return
    }
    setDragOverDashboard(null)
  }, [setDragOverDashboard])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)

    if (!over) return

    if (active.data.current?.type === 'workload' && String(over.id).startsWith('cluster-group-')) {
      const workloadData = active.data.current.workload as { name: string; namespace: string; sourceCluster: string; currentClusters: string[] }
      const groupData = over.data.current as { groupName: string; clusters: string[] }
      if (groupData?.clusters?.length > 0) {
        setPendingDeploy({
          workloadName: workloadData.name,
          namespace: workloadData.namespace,
          sourceCluster: workloadData.sourceCluster,
          targetClusters: groupData.clusters,
          groupName: groupData.groupName,
        })
      }
      return
    }

    if (String(over.id).startsWith('dashboard-drop-')) {
      const targetDashboardId = over.data?.current?.dashboardId
      const targetDashboardName = over.data?.current?.dashboardName
      if (targetDashboardId && active.id) {
        try {
          await moveCardToDashboard(active.id as string, targetDashboardId)
          snapshot(localCards)
          setLocalCards(items => items.filter(item => item.id !== active.id))
          showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: targetDashboardName }), 'success')
        } catch (error: unknown) {
          console.error('Failed to move card:', error)
          showToast(t('dashboard.toast.moveCardFailed', 'Failed to move card'), 'error')
        }
      }
      return
    }

    if (String(over.id) === 'create-new-dashboard') {
      try {
        const newDash = await createDashboard('New Dashboard')
        if (newDash?.id && active.id) {
          await moveCardToDashboard(active.id as string, newDash.id)
          snapshot(localCards)
          setLocalCards(items => items.filter(item => item.id !== active.id))
          showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: newDash.name || t('dashboard.toast.newDashboard', 'New Dashboard') }), 'success')
        }
      } catch (error: unknown) {
        console.error('Failed to create dashboard and move card:', error)
        showToast(t('dashboard.toast.createDashboardFailed', 'Failed to create dashboard'), 'error')
      }
      return
    }

    if (active.id !== over.id) {
      const draggedCard = localCards.find(card => card.id === active.id)
      if (draggedCard) emitCardDragged(draggedCard.card_type)
      snapshot(localCards)
      setLocalCards(items => {
        const oldIndex = items.findIndex(item => item.id === active.id)
        const newIndex = items.findIndex(item => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }, [createDashboard, localCards, moveCardToDashboard, setActiveId, setActiveDragData, setDragOverDashboard, setIsDragging, setLocalCards, setPendingDeploy, showToast, snapshot, t])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)
  }, [setActiveId, setActiveDragData, setDragOverDashboard, setIsDragging])

  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy
    setPendingDeploy(null)

    const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    publishCardEvent({
      type: 'deploy:started',
      payload: { id: deployId, workload: workloadName, namespace, sourceCluster, targetClusters, groupName, timestamp: Date.now() },
    })

    showToast(
      t('dashboard.toast.deploying', 'Deploying {{workload}} to {{count}} cluster(s) in "{{group}}"', { workload: workloadName, count: targetClusters.length, group: groupName }),
      'success',
    )

    try {
      await deployWorkload({ workloadName, namespace, sourceCluster, targetClusters }, {
        onSuccess: (result) => {
          const resp = result as unknown as {
            success?: boolean; message?: string; deployedTo?: string[]; failedClusters?: string[]
            dependencies?: { kind: string; name: string; action: string }[]; warnings?: string[]
          }
          if (resp && typeof resp === 'object') {
            publishCardEvent({
              type: 'deploy:result',
              payload: {
                id: deployId,
                success: resp.success ?? true,
                message: resp.message ?? '',
                deployedTo: resp.deployedTo,
                failedClusters: resp.failedClusters,
                dependencies: resp.dependencies as DeployResultPayload['dependencies'],
                warnings: resp.warnings,
              },
            })
          }
        },
      })
    } catch (error: unknown) {
      console.error('Deploy failed:', error)
      showToast(
        t('dashboard.toast.deployFailed', 'Deploy failed: {{detail}}', { detail: error instanceof Error ? error.message : t('dashboard.toast.unknownError', 'Unknown error') }),
        'error',
      )
    }
  }, [deployWorkload, pendingDeploy, publishCardEvent, setPendingDeploy, showToast, t])

  return { collisionDetection, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel, handleConfirmDeploy }
}
