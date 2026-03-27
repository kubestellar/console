import { useCallback, useRef, useState } from 'react'

export interface DashboardCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

export type ResetMode = 'replace' | 'add_missing'

interface UseDashboardResetOptions<T extends DashboardCard> {
  /** LocalStorage key for this dashboard's cards */
  storageKey: string
  /** Default cards for this dashboard */
  defaultCards: T[]
  /** Current cards state setter */
  setCards: (cards: T[]) => void
  /** Current cards (needed for add_missing mode) */
  cards: T[]
}

interface UseDashboardResetReturn {
  /** Whether the dashboard has been customized */
  isCustomized: boolean
  /** Set customized state (call when cards are saved) */
  setCustomized: (value: boolean) => void
  /** Reset to defaults - replaces all cards with defaults */
  resetToDefaults: () => void
  /** Add missing default cards while keeping custom cards */
  addMissingDefaults: () => number
  /** Reset with mode selection */
  reset: (mode: ResetMode) => number
}

/**
 * Shared hook for dashboard reset functionality.
 * Supports two modes:
 * - replace: Reset to ONLY default cards (removes custom cards)
 * - add_missing: Add default cards that are missing (keeps custom cards)
 */
export function useDashboardReset<T extends DashboardCard>({
  storageKey,
  defaultCards,
  setCards,
  cards,
}: UseDashboardResetOptions<T>): UseDashboardResetReturn {
  const [isCustomized, setCustomized] = useState(() =>
    localStorage.getItem(storageKey) !== null
  )

  // Keep a ref to the latest cards so callbacks never read stale state
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  // Reset to only default cards (replace mode)
  const resetToDefaults = useCallback(() => {
    setCards(defaultCards)
    localStorage.removeItem(storageKey)
    setCustomized(false)
  }, [storageKey, defaultCards, setCards])

  // Add missing default cards while keeping existing cards
  const addMissingDefaults = useCallback(() => {
    const currentCards = cardsRef.current
    const existingTypes = new Set(currentCards.map(c => c.card_type))
    const missingCards = defaultCards.filter(d => !existingTypes.has(d.card_type))

    if (missingCards.length > 0) {
      // Generate new IDs for the missing cards to avoid conflicts
      const cardsToAdd = missingCards.map(card => ({
        ...card,
        id: `${card.card_type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      }))
      setCards([...currentCards, ...cardsToAdd] as T[])
    }

    return missingCards.length
  }, [defaultCards, setCards])

  // Reset with mode selection
  const reset = useCallback((mode: ResetMode) => {
    if (mode === 'replace') {
      resetToDefaults()
      return defaultCards.length
    } else {
      return addMissingDefaults()
    }
  }, [resetToDefaults, addMissingDefaults, defaultCards.length])

  return {
    isCustomized,
    setCustomized,
    resetToDefaults,
    addMissingDefaults,
    reset,
  }
}
