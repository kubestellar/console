import { useState, useEffect, useRef } from 'react'

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

  // Track whether a reset just happened so the persistence effect can skip one cycle
  const skipPersistRef = useRef(false)

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

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev)
  }

  // Save to localStorage when cards change — skip if resetToDefaults just fired
  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    localStorage.setItem(storageKey, JSON.stringify(cards))
  }, [cards, storageKey])

  const addCard = (cardType: string, config: Record<string, unknown> = {}, title?: string) => {
    const newCard: DashboardCard = {
      id: `${cardType}-${Date.now()}`,
      card_type: cardType,
      config,
      title }
    setCards(prev => [...prev, newCard])
    return newCard.id
  }

  const removeCard = (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  const updateCardConfig = (cardId: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config: { ...c.config, ...config } } : c
    ))
  }

  const replaceCards = (newCards: DashboardCard[]) => {
    setCards(newCards)
  }

  const clearCards = () => {
    setCards([])
  }

  const resetToDefaults = () => {
    skipPersistRef.current = true
    setCards(defaultCards)
    localStorage.removeItem(storageKey)
  }

  const isCustomized = () => {
    const stored = localStorage.getItem(storageKey)
    if (stored === null) return false
    // Compare actual content to defaults — key existence alone is not sufficient
    // because the persistence effect may have re-written the default state
    try {
      const parsed = JSON.parse(stored)
      return JSON.stringify(parsed) !== JSON.stringify(defaultCards)
    } catch {
      return false
    }
  }

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
    showCards: !isCollapsed }
}
