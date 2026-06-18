/**
 * DashboardCardState.ts — Card state management for dashboard.
 * Extracted from DashboardState.ts per issue #19014.
 * Manages card array, selected card, insert position, and card cache.
 */
import { useState, useRef, useCallback } from 'react'
import type { Card, DashboardData } from './dashboardUtils'
import type { CachedDashboard } from './DashboardTypes'
import { loadDashboardCardsFromStorage } from '../../lib/dashboards/dashboardCardStorage'

interface UseDashboardCardStateProps {
  storageKey: string
  defaultCards: Card[]
  dashboardCacheRef: CachedDashboard | null
}

export function useDashboardCardState({
  storageKey,
  defaultCards,
  dashboardCacheRef,
}: UseDashboardCardStateProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(() => dashboardCacheRef?.dashboard || null)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>(() => {
    if (dashboardCacheRef?.cards?.length) return dashboardCacheRef.cards
    const restoredCards = loadDashboardCardsFromStorage<Card>(
      storageKey,
      defaultCards,
      { requirePosition: true, requireGridCoordinates: true },
    )
    if (restoredCards.length > 0) {
      return restoredCards
    }
    return defaultCards
  })
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)

  const localCardsRef = useRef(localCards)
  localCardsRef.current = localCards

  const expandTriggersRef = useRef<Map<string, () => void>>(new Map())
  const handleExpandCard = (cardId: string) => {
    expandTriggersRef.current.get(cardId)?.()
  }

  const handleRegisterExpandTrigger = useCallback((cardId: string, expand: () => void) => {
    expandTriggersRef.current.set(cardId, expand)
  }, [])

  const handleInsertBefore = useCallback((index: number) => {
    setInsertAtIndex(index)
  }, [])

  const handleInsertAfter = useCallback((index: number) => {
    setInsertAtIndex(index + 1)
  }, [])

  return {
    dashboard,
    setDashboard,
    selectedCard,
    setSelectedCard,
    localCards,
    setLocalCards,
    localCardsRef,
    insertAtIndex,
    setInsertAtIndex,
    expandTriggersRef,
    handleExpandCard,
    handleRegisterExpandTrigger,
    handleInsertBefore,
    handleInsertAfter,
  }
}
