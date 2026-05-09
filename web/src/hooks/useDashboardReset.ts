import { useRef, useState } from 'react'
import { safeGetItem, safeRemoveItem } from '../lib/utils/localStorage'

const RANDOM_ID_RADIX = 36
const RANDOM_ID_SLICE_START = 2
const RANDOM_ID_SLICE_END = 7

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

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`
  }

  return JSON.stringify(value)
}

function getCardSignature(card: DashboardCard): string {
  return stableSerialize({
    cardType: card.card_type,
    config: card.config ?? {},
    title: card.title ?? null,
    position: card.position ?? null,
  })
}

function getMissingDefaultCards<T extends DashboardCard>(defaultCards: T[], currentCards: T[]): T[] {
  const matchedCardIndexes = new Set<number>()

  return defaultCards.filter(defaultCard => {
    const defaultCardSignature = getCardSignature(defaultCard)
    const matchIndex = currentCards.findIndex((currentCard, index) => {
      if (matchedCardIndexes.has(index)) {
        return false
      }

      return currentCard.id === defaultCard.id || getCardSignature(currentCard) === defaultCardSignature
    })

    if (matchIndex === -1) {
      return true
    }

    matchedCardIndexes.add(matchIndex)
    return false
  })
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
  cards }: UseDashboardResetOptions<T>): UseDashboardResetReturn {
  const [isCustomized, setCustomized] = useState(() =>
    safeGetItem(storageKey) !== null
  )

  // Keep a ref to the latest cards so callbacks never read stale state
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  // Reset to only default cards (replace mode)
  const resetToDefaults = () => {
    setCards(defaultCards)
    safeRemoveItem(storageKey)
    setCustomized(false)
  }

  // Add missing default cards while keeping existing cards
  const addMissingDefaults = () => {
    const currentCards = cardsRef.current
    const missingCards = getMissingDefaultCards(defaultCards, currentCards)

    if (missingCards.length > 0) {
      // Generate new IDs for the missing cards to avoid conflicts
      const cardsToAdd = missingCards.map(card => ({
        ...card,
        id: `${card.card_type}-${Date.now()}-${Math.random().toString(RANDOM_ID_RADIX).slice(RANDOM_ID_SLICE_START, RANDOM_ID_SLICE_END)}` }))
      setCards([...currentCards, ...cardsToAdd] as T[])
    }

    return missingCards.length
  }

  // Reset with mode selection
  const reset = (mode: ResetMode) => {
    if (mode === 'replace') {
      resetToDefaults()
      return defaultCards.length
    } else {
      return addMissingDefaults()
    }
  }

  return {
    isCustomized,
    setCustomized,
    resetToDefaults,
    addMissingDefaults,
    reset }
}
