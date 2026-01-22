import { useState, useEffect, useCallback } from 'react'

export interface DashboardCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

interface UseDashboardCardsOptions {
  storageKey: string
  defaultCards?: DashboardCard[]
  /** Default collapsed state - defaults to false (expanded) */
  defaultCollapsed?: boolean
}

export function useDashboardCards({ storageKey, defaultCards = [], defaultCollapsed = false }: UseDashboardCardsOptions) {
  const collapsedKey = `${storageKey}:collapsed`

  const [cards, setCards] = useState<DashboardCard[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : defaultCards
    } catch {
      return defaultCards
    }
  })

  // Collapsed state - persisted separately
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(collapsedKey)
      // If not stored, use default (expanded = false collapsed)
      return stored !== null ? JSON.parse(stored) : defaultCollapsed
    } catch {
      return defaultCollapsed
    }
  })

  // Save collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(collapsedKey, JSON.stringify(isCollapsed))
  }, [isCollapsed, collapsedKey])

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  // Save to localStorage when cards change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cards))
  }, [cards, storageKey])

  const addCard = useCallback((cardType: string, config: Record<string, unknown> = {}, title?: string) => {
    const newCard: DashboardCard = {
      id: `${cardType}-${Date.now()}`,
      card_type: cardType,
      config,
      title,
    }
    setCards(prev => [...prev, newCard])
    return newCard.id
  }, [])

  const removeCard = useCallback((cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }, [])

  const updateCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config: { ...c.config, ...config } } : c
    ))
  }, [])

  const replaceCards = useCallback((newCards: DashboardCard[]) => {
    setCards(newCards)
  }, [])

  const clearCards = useCallback(() => {
    setCards([])
  }, [])

  const resetToDefaults = useCallback(() => {
    setCards(defaultCards)
    localStorage.removeItem(storageKey)
  }, [defaultCards, storageKey])

  const isCustomized = useCallback(() => {
    return localStorage.getItem(storageKey) !== null
  }, [storageKey])

  return {
    cards,
    addCard,
    removeCard,
    updateCardConfig,
    replaceCards,
    clearCards,
    resetToDefaults,
    isCustomized,
    // Collapsed state
    isCollapsed,
    setIsCollapsed,
    toggleCollapsed,
    /** Convenience: showCards = !isCollapsed */
    showCards: !isCollapsed,
  }
}
