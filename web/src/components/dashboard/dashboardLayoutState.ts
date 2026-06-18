import { useState, useEffect, useRef, useCallback } from 'react'
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { STORAGE_KEY_DASHBOARD_AUTO_REFRESH } from '../../lib/constants'
import { useCardGridNavigation } from '../../hooks/useCardGridNavigation'
import { setAutoRefreshPaused } from '../../lib/cache'
import type { Card } from './dashboardUtils'

const AUTO_REFRESH_INTERVAL_MS = 30_000

interface UseDashboardLayoutStateArgs {
  cards: Card[]
  isLoading: boolean
  refetch: () => void
}

export function useDashboardLayoutState({ cards, isLoading, refetch }: UseDashboardLayoutStateArgs) {
  const [autoRefresh, setAutoRefresh] = useState(() => {
    const stored = safeGetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH)
    return stored !== null ? stored === 'true' : true
  })
  const autoRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    safeSetItem(STORAGE_KEY_DASHBOARD_AUTO_REFRESH, String(autoRefresh))
    setAutoRefreshPaused(!autoRefresh)
    return () => {
      setAutoRefreshPaused(false)
    }
  }, [autoRefresh])

  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  useEffect(() => {
    if (!autoRefresh) return
    autoRefreshIntervalRef.current = setInterval(() => {
      if (!isLoadingRef.current) {
        refetch()
      }
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
        autoRefreshIntervalRef.current = null
      }
    }
  }, [autoRefresh, refetch])

  const expandTriggersRef = useRef<Map<string, () => void>>(new Map())
  const handleExpandCard = useCallback((cardId: string) => {
    expandTriggersRef.current.get(cardId)?.()
  }, [])

  const { registerCardRef, handleGridKeyDown } = useCardGridNavigation({
    cards,
    onExpandCard: handleExpandCard,
  })

  const handleRegisterExpandTrigger = useCallback((cardId: string, expand: () => void) => {
    expandTriggersRef.current.set(cardId, expand)
  }, [])

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

  return {
    autoRefresh,
    setAutoRefresh,
    registerCardRef,
    handleGridKeyDown,
    handleRegisterExpandTrigger,
    sensors,
    collisionDetection,
  }
}
