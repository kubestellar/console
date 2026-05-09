import { useState, useEffect, useRef } from 'react'
import {
  clearDashboardCardStorage,
  loadDashboardCardsFromStorage,
  saveDashboardCardsToStorage,
} from '../lib/dashboards/dashboardCardStorage'

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

  const [cards, setCards] = useState<DashboardCard[]>(() =>
    loadDashboardCardsFromStorage(storageKey, defaultCards),
  )

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
    saveDashboardCardsToStorage(storageKey, cards)
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
    clearDashboardCardStorage(storageKey)
  }

  const isCustomized = () => {
    const storedCards = loadDashboardCardsFromStorage(storageKey, defaultCards)
    return JSON.stringify(storedCards) !== JSON.stringify(defaultCards)
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
