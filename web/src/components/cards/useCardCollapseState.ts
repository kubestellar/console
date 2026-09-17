import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useCardCollapse } from '../../lib/cards/cardHooks'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
import { COLLAPSED_CARDS_STORAGE_KEY, COLLAPSE_DELAY_MS } from './CardWrapper.constants'

export interface CardCollapseStateInput {
  cardId?: string
  cardType: string
  externalCollapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  // Signals that content is ready, so a saved collapsed state may take effect
  effectiveHasData: boolean
  initialRenderTimedOut: boolean
  skeletonTimedOut: boolean
  effectiveIsDemoData: boolean
  isDemoMode: boolean
}

export interface CardCollapseState {
  isCollapsed: boolean
  setCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void
  handleToggleCollapse: () => void
}

/**
 * Manages a card's collapse state: localStorage persistence, external control,
 * and the "wait for content before collapsing" UX guard. Extracted from
 * CardWrapper to reduce complexity (#22959).
 */
export function useCardCollapseState(input: CardCollapseStateInput): CardCollapseState {
  const {
    cardId,
    cardType,
    externalCollapsed,
    onCollapsedChange,
    effectiveHasData,
    initialRenderTimedOut,
    skeletonTimedOut,
    effectiveIsDemoData,
    isDemoMode,
  } = input

  // Use the shared collapse hook with localStorage persistence
  // cardId is required for persistence; fall back to cardType if not provided
  const collapseKey = cardId || `${cardType}-default`
  const { isCollapsed: hookCollapsed, setCollapsed: hookSetCollapsed } = useCardCollapse(collapseKey)

  // Check if this card has a previously-saved collapse state in localStorage.
  // When the user explicitly collapsed a card, we should respect that immediately
  // on page navigation (no delay) to prevent a flash of expanded state (#4895).
  const hasSavedCollapseState = useMemo(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_CARDS_STORAGE_KEY)
      if (!stored) return false
      const ids: string[] = JSON.parse(stored)
      return ids.includes(collapseKey)
    } catch {
      return false
    }
  }, [collapseKey])

  // Track whether initial data load has completed AND content has been visible
  // Skip the delay entirely if the card has a saved collapsed state — the user
  // explicitly collapsed it, so we should respect that immediately across navigations.
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(() => checkIsDemoMode() || hasSavedCollapseState)
  const [collapseDelayPassed, setCollapseDelayPassed] = useState(() => checkIsDemoMode() || hasSavedCollapseState)

  // Allow external control to override hook state
  // IMPORTANT: Don't collapse until initial data load is complete AND a brief delay has passed
  // This prevents the jarring sequence of: skeleton → collapse → show data
  // Cards stay expanded showing content briefly, then respect collapsed state
  // Exception: if the card has a saved collapse state, apply it immediately (#4895)
  const savedCollapsedState = externalCollapsed ?? hookCollapsed
  const isCollapsed = (hasCompletedInitialLoad && collapseDelayPassed) ? savedCollapsedState : false
  const isCollapsedRef = useRef(isCollapsed)
  const onCollapsedChangeRef = useRef(onCollapsedChange)

  useEffect(() => {
    isCollapsedRef.current = isCollapsed
  }, [isCollapsed])

  useEffect(() => {
    onCollapsedChangeRef.current = onCollapsedChange
  }, [onCollapsedChange])

  const setCollapsed = useCallback((collapsed: boolean | ((prev: boolean) => boolean)) => {
    const nextCollapsed = typeof collapsed === 'function'
      ? collapsed(isCollapsedRef.current)
      : collapsed

    onCollapsedChangeRef.current?.(nextCollapsed)
    // Always update the hook state for persistence
    hookSetCollapsed(nextCollapsed)
  }, [hookSetCollapsed])

  // Mark initial load as complete when data is ready or various timeouts pass
  // This allows the saved collapsed state to take effect only after content is ready
  // Conditions (any triggers completion):
  // - effectiveHasData: card reported it has data
  // - initialRenderTimedOut: 150ms passed, assume static card has content
  // - skeletonTimedOut: 5s passed, fallback for slow loading cards
  // - effectiveIsDemoData/isDemoMode: demo cards always have content immediately
  useEffect(() => {
    if (!hasCompletedInitialLoad && (effectiveHasData || initialRenderTimedOut || skeletonTimedOut || effectiveIsDemoData || isDemoMode)) {
      setHasCompletedInitialLoad(true)
    }
  }, [hasCompletedInitialLoad, effectiveHasData, initialRenderTimedOut, skeletonTimedOut, effectiveIsDemoData, isDemoMode])

  // Add a small delay before allowing collapse to ensure content is visible
  // This prevents immediate collapse for demo cards and ensures smooth UX
  useEffect(() => {
    if (hasCompletedInitialLoad && !collapseDelayPassed) {
      const timer = setTimeout(() => {
        setCollapseDelayPassed(true)
      }, COLLAPSE_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [hasCompletedInitialLoad, collapseDelayPassed])

  const handleToggleCollapse = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [setCollapsed])

  return { isCollapsed, setCollapsed, handleToggleCollapse }
}
