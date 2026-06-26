import { useState, useEffect } from 'react'

// ============================================================================
// useCardCollapse - Manage card collapsed state with persistence
// ============================================================================

const COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'

/**
 * Module-level subscriber set so multiple `useCardCollapse` instances for the
 * same `cardId` stay in sync when one of them toggles. Without this, calling
 * the hook from both `SortableCard` (for grid layout) and `CardWrapper`
 * (for the actual collapse UI) would leave them out of sync — collapsing the
 * card via the chevron button would not update the grid row span (#6072).
 */
const collapseSubscribers = new Set<() => void>()

function subscribeToCollapseChanges(listener: () => void): () => void {
  collapseSubscribers.add(listener)
  return () => { collapseSubscribers.delete(listener) }
}

function notifyCollapseSubscribers() {
  collapseSubscribers.forEach((listener) => listener())
}

/**
 * Get all collapsed card IDs from localStorage
 */
function getCollapsedCards(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Save collapsed card IDs to localStorage and notify all hook subscribers so
 * that components reading the same card's collapse state stay in sync.
 */
function saveCollapsedCards(collapsed: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]))
  } catch {
    // Silently ignore quota errors or private browsing restrictions
  }
  notifyCollapseSubscribers()
}

export interface UseCardCollapseResult {
  /** Whether the card is collapsed */
  isCollapsed: boolean
  /** Toggle collapsed state */
  toggleCollapsed: () => void
  /** Set collapsed state explicitly */
  setCollapsed: (collapsed: boolean) => void
  /** Expand the card (shorthand for setCollapsed(false)) */
  expand: () => void
  /** Collapse the card (shorthand for setCollapsed(true)) */
  collapse: () => void
}

/**
 * Hook to manage card collapse state with localStorage persistence.
 * Each card remembers its collapsed state across page reloads.
 *
 * @param cardId - Unique identifier for the card
 * @param defaultCollapsed - Default collapsed state (defaults to false = expanded)
 */
export function useCardCollapse(
  cardId: string,
  defaultCollapsed: boolean = false
): UseCardCollapseResult {
  const [isCollapsed, setIsCollapsedState] = useState(() => {
    const collapsed = getCollapsedCards()
    return collapsed.has(cardId) || defaultCollapsed
  })

  // Subscribe to module-level collapse changes so multiple hook instances
  // for the same cardId stay in sync (#6072 — grid row span needs to react
  // when the chevron button inside CardWrapper toggles collapse). Only the
  // persisted localStorage value drives this sync — `defaultCollapsed` is
  // intentionally not consulted here so that an explicit user expand/collapse
  // is never overwritten by the seed default after the first toggle.
  useEffect(() => {
    const sync = () => {
      const collapsed = getCollapsedCards()
      const next = collapsed.has(cardId)
      setIsCollapsedState((prev) => (prev === next ? prev : next))
    }
    return subscribeToCollapseChanges(sync)
  }, [cardId])

  const setCollapsed = (collapsed: boolean) => {
    setIsCollapsedState(collapsed)
    const collapsedCards = getCollapsedCards()
    if (collapsed) {
      collapsedCards.add(cardId)
    } else {
      collapsedCards.delete(cardId)
    }
    saveCollapsedCards(collapsedCards)
  }

  const toggleCollapsed = () => {
    setCollapsed(!isCollapsed)
  }

  const expand = () => setCollapsed(false)
  const collapse = () => setCollapsed(true)

  return {
    isCollapsed,
    toggleCollapsed,
    setCollapsed,
    expand,
    collapse }
}

/**
 * Hook to manage collapse state for multiple cards at once.
 * Useful for "collapse all" / "expand all" functionality.
 */
export function useCardCollapseAll(cardIds: string[]) {
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(() => getCollapsedCards())

  const collapseAll = () => {
    const newSet = new Set([...collapsedSet, ...cardIds])
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }

  const expandAll = () => {
    const newSet = new Set([...collapsedSet].filter(id => !cardIds.includes(id)))
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }

  const isCardCollapsed = (cardId: string) => {
    return collapsedSet.has(cardId)
  }

  const toggleCard = (cardId: string) => {
    const newSet = new Set(collapsedSet)
    if (newSet.has(cardId)) {
      newSet.delete(cardId)
    } else {
      newSet.add(cardId)
    }
    setCollapsedSet(newSet)
    saveCollapsedCards(newSet)
  }

  const allCollapsed = cardIds.every(id => collapsedSet.has(id))
  const allExpanded = cardIds.every(id => !collapsedSet.has(id))

  return {
    collapseAll,
    expandAll,
    isCardCollapsed,
    toggleCard,
    allCollapsed,
    allExpanded,
    collapsedCount: cardIds.filter(id => collapsedSet.has(id)).length }
}
