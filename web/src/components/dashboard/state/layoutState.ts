import { useCallback, useState } from 'react'
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
import { useTranslation } from 'react-i18next'
import { emitCardDragged } from '../../../lib/analytics'
import type { Card } from '../dashboardUtils'
import type { PendingDeploy } from './types'

interface UseDashboardLayoutStateProps {
  localCards: Card[]
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>
  snapshot: (cards: Card[]) => void
  setPendingDeploy: (deploy: PendingDeploy | null) => void
  moveCardToDashboard: (cardId: string, dashboardId: string) => Promise<void>
  createDashboard: (name: string) => Promise<{ id: string; name: string } | null>
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
}

export function useDashboardLayoutState({
  localCards,
  setLocalCards,
  snapshot,
  setPendingDeploy,
  moveCardToDashboard,
  createDashboard,
  showToast,
}: UseDashboardLayoutStateProps) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<Record<string, unknown> | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverDashboard, setDragOverDashboard] = useState<string | null>(null)

  const collisionDetection: CollisionDetection = useCallback(args => {
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setActiveDragData(event.active.data.current as Record<string, unknown> | null)
    setIsDragging(true)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    if (over && (String(over.id).startsWith('dashboard-drop-') || String(over.id) === 'create-new-dashboard')) {
      const dashboardId = over.data?.current?.dashboardId
      setDragOverDashboard(dashboardId || null)
      return
    }
    setDragOverDashboard(null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)

    if (!over) return

    if (active.data.current?.type === 'workload' && String(over.id).startsWith('cluster-group-')) {
      const workloadData = active.data.current.workload as {
        name: string
        namespace: string
        sourceCluster: string
        currentClusters: string[]
      }
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
        const newDashboard = await createDashboard('New Dashboard')
        if (newDashboard?.id && active.id) {
          await moveCardToDashboard(active.id as string, newDashboard.id)
          snapshot(localCards)
          setLocalCards(items => items.filter(item => item.id !== active.id))
          showToast(
            t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', {
              name: newDashboard.name || t('dashboard.toast.newDashboard', 'New Dashboard'),
            }),
            'success',
          )
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
  }, [createDashboard, localCards, moveCardToDashboard, setLocalCards, setPendingDeploy, showToast, snapshot, t])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setActiveDragData(null)
    setIsDragging(false)
    setDragOverDashboard(null)
  }, [])

  return {
    activeId,
    activeDragData,
    dragOverDashboard,
    isDragging,
    collisionDetection,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
  }
}
