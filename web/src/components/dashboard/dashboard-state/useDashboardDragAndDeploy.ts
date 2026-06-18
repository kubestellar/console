import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { closestCenter, pointerWithin, rectIntersection, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { emitCardDragged } from '../../../lib/analytics'
import type { Card } from '../dashboardUtils'
import type { PendingDeploy } from './constants'
import type { DeployResultPayload } from '../../../lib/cardEvents'

interface DashboardLike {
  id?: string
  name?: string
}

interface UseDashboardDragAndDeployParams {
  localCards: Card[]
  snapshot: (cards: Card[]) => void
  setLocalCards: Dispatch<SetStateAction<Card[]>>
  moveCardToDashboard: (cardId: string, dashboardId: string) => Promise<void>
  createDashboard: (name: string) => Promise<DashboardLike | undefined>
  showToast: (message: string, kind: 'success' | 'error') => void
  t: (key: string, fallback?: string, options?: Record<string, unknown>) => string
  deployWorkload: (
    params: { workloadName: string; namespace: string; sourceCluster: string; targetClusters: string[] },
    options: { onSuccess: (result: unknown) => void },
  ) => Promise<void>
  publishCardEvent: (event: { type: 'deploy:started' | 'deploy:result'; payload: Record<string, unknown> }) => void
}

export function useDashboardDragAndDeploy({
  localCards,
  snapshot,
  setLocalCards,
  moveCardToDashboard,
  createDashboard,
  showToast,
  t,
  deployWorkload,
  publishCardEvent,
}: UseDashboardDragAndDeployParams) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<Record<string, unknown> | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingDeploy, setPendingDeploy] = useState<PendingDeploy | null>(null)

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
      const targetCollision = unique.find(collision => String(collision.id).startsWith('cluster-group-') || String(collision.id).startsWith('cluster-drop-'))
      if (targetCollision) return [targetCollision]
      const cardTarget = unique.find(collision => String(collision.id) === 'cluster-groups-card')
      if (cardTarget) return [cardTarget]
      const dashboardCollision = unique.find(collision => String(collision.id).startsWith('dashboard-drop-') || String(collision.id) === 'create-new-dashboard')
      return dashboardCollision ? [dashboardCollision] : []
    }
    const pointerCollisions = pointerWithin(args)
    const dashboardDropTarget = pointerCollisions.find(collision => String(collision.id).startsWith('dashboard-drop-') || String(collision.id) === 'create-new-dashboard')
    return dashboardDropTarget ? [dashboardDropTarget] : closestCenter(args)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setActiveDragData(event.active.data.current as Record<string, unknown> | null)
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    return undefined
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)

    if (!over) return

    if (active.data.current?.type === 'workload' && String(over.id).startsWith('cluster-group-')) {
      const workloadData = active.data.current.workload as { name: string; namespace: string; sourceCluster: string }
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
      const targetDashboardId = over.data?.current?.dashboardId as string | undefined
      const targetDashboardName = over.data?.current?.dashboardName as string | undefined
      if (targetDashboardId && active.id) {
        try {
          await moveCardToDashboard(active.id as string, targetDashboardId)
          snapshot(localCards)
          setLocalCards(items => items.filter(item => item.id !== active.id))
          showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: targetDashboardName }), 'success')
        } catch (error) {
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
      } catch (error) {
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
  }, [createDashboard, localCards, moveCardToDashboard, setLocalCards, showToast, snapshot, t])

  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy
    setPendingDeploy(null)
    const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    publishCardEvent({
      type: 'deploy:started',
      payload: { id: deployId, workload: workloadName, namespace, sourceCluster, targetClusters, groupName, timestamp: Date.now() },
    })

    showToast(t('dashboard.toast.deploying', 'Deploying {{workload}} to {{count}} cluster(s) in "{{group}}"', {
      workload: workloadName,
      count: targetClusters.length,
      group: groupName,
    }), 'success')

    try {
      await deployWorkload({ workloadName, namespace, sourceCluster, targetClusters }, {
        onSuccess: (result) => {
          const response = result as { success?: boolean; message?: string; deployedTo?: string[]; failedClusters?: string[]; dependencies?: DeployResultPayload['dependencies']; warnings?: string[] }
          publishCardEvent({
            type: 'deploy:result',
            payload: {
              id: deployId,
              success: response.success ?? true,
              message: response.message ?? '',
              deployedTo: response.deployedTo,
              failedClusters: response.failedClusters,
              dependencies: response.dependencies,
              warnings: response.warnings,
            },
          })
        },
      })
    } catch (error) {
      console.error('Deploy failed:', error)
      showToast(t('dashboard.toast.deployFailed', 'Deploy failed: {{detail}}', {
        detail: error instanceof Error ? error.message : t('dashboard.toast.unknownError', 'Unknown error'),
      }), 'error')
    }
  }, [deployWorkload, pendingDeploy, publishCardEvent, showToast, t])

  return {
    activeDragData,
    activeId,
    collisionDetection,
    handleConfirmDeploy,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    isDragging,
    pendingDeploy,
    setPendingDeploy,
  }
}
