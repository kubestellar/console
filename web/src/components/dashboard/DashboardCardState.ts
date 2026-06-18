import { useState } from 'react'
import { useModalState } from '../../lib/modals'
import type { Card } from './dashboardUtils'
import { getDashboardCache, initializeDashboardCards } from './DashboardPersistence'

export function useDashboardCardState(storageKey: string, defaultCards: Card[]) {
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [localCards, setLocalCards] = useState<Card[]>(() => {
    const cachedCards = getDashboardCache()?.cards
    if ((cachedCards || []).length > 0) {
      return cachedCards || []
    }
    return initializeDashboardCards(storageKey, defaultCards)
  })
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const [addCardSearch, setAddCardSearch] = useState('')

  return {
    addCardSearch,
    closeConfigureCard,
    isConfigureCardOpen,
    insertAtIndex,
    localCards,
    openConfigureCard,
    selectedCard,
    setAddCardSearch,
    setInsertAtIndex,
    setLocalCards,
    setSelectedCard,
  }
}
