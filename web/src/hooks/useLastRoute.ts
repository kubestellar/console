import { useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const LAST_ROUTE_KEY = 'kubestellar-last-route'
const SCROLL_POSITIONS_KEY = 'kubestellar-scroll-positions'
const REMEMBER_POSITION_KEY = 'kubestellar-remember-position'
const SIDEBAR_CONFIG_KEY = 'kubestellar-sidebar-config-v5'

/**
 * Get the first dashboard route from sidebar configuration.
 * Falls back to '/' if no sidebar config exists.
 */
function getFirstDashboardRoute(): string {
  try {
    const sidebarConfig = localStorage.getItem(SIDEBAR_CONFIG_KEY)
    if (sidebarConfig) {
      const config = JSON.parse(sidebarConfig)
      if (config.primaryNav && config.primaryNav.length > 0) {
        return config.primaryNav[0].href || '/'
      }
    }
  } catch {
    // Fall through to default
  }
  return '/'
}

interface ScrollEntry {
  position: number
  cardTitle?: string // title of card at viewport top, for robust restore
}

interface ScrollPositions {
  [path: string]: ScrollEntry | number // number for backward compat
}

/**
 * Get the scrollable main content element.
 * The layout uses a <main> with overflow-y-auto, not window scroll.
 */
function getScrollContainer(): Element | null {
  return document.querySelector('main')
}

/**
 * Hook to persist and restore the last visited route and scroll position.
 * Saves the current route on navigation and scroll position on scroll/unload.
 * On initial app load, redirects to the last route and restores scroll.
 */
export function useLastRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const hasRestoredRef = useRef(false)
  const isRestoringRef = useRef(false) // true while iterative restore is running
  const pathnameRef = useRef(location.pathname)

  // Keep pathnameRef in sync for use in cleanup functions
  pathnameRef.current = location.pathname

  // Get stored scroll positions
  const getScrollPositions = useCallback((): ScrollPositions => {
    try {
      return JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY) || '{}')
    } catch {
      return {}
    }
  }, [])

  // Save scroll position for a given path immediately (no debounce).
  // Snaps to the nearest card top boundary so restoration shows full cards.
  // Also saves the card title for robust restore across layout shifts.
  const saveScrollPositionNow = useCallback((path: string) => {
    try {
      if (isRestoringRef.current) return
      const container = getScrollContainer()
      if (!container) return
      const scrollTop = container.scrollTop

      const positions = getScrollPositions()

      // At the top — clear saved position so next visit starts at top.
      // This ensures scrolling to top is "sticky" when Pin is on.
      if (scrollTop <= 0) {
        delete positions[path]
        localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions))
        return
      }

      // Find the first card visible at the viewport top.
      // Cards are in a grid so multiple cards can share the same row.
      // We want the first card (left-most in DOM) on the row nearest
      // the viewport top, using a 20px tolerance for breathing room.
      //
      // OPTIMIZATION: Only check the first few cards to avoid forced reflow
      // on every card. Most users don't scroll past the first ~10 cards.
      let snapped = scrollTop
      let cardTitle: string | undefined
      const cards = container.querySelectorAll('[data-tour="card"]')
      const maxCardsToCheck = Math.min(cards.length, 12) // Only check first 12 cards
      if (maxCardsToCheck > 0) {
        const containerRect = container.getBoundingClientRect()
        // Find the last row whose top is at or above the viewport top + tolerance.
        // Then pick the FIRST card on that row (first in DOM order).
        let bestRowTop = -1
        let bestCard: Element | null = null
        for (let i = 0; i < maxCardsToCheck; i++) {
          const cardRect = cards[i].getBoundingClientRect()
          const cardAbsTop = cardRect.top - containerRect.top + scrollTop
          if (cardAbsTop <= scrollTop + 20) {
            // New row detected (position differs by more than 2px from last row)
            if (Math.abs(cardAbsTop - bestRowTop) > 2) {
              bestRowTop = cardAbsTop
              bestCard = cards[i] // first card on this new row
            }
            // Same row — keep the first card (don't update bestCard)
          } else {
            break
          }
        }
        if (bestCard && bestRowTop >= 0) {
          snapped = Math.max(0, bestRowTop - 12) // 12px breathing room above card
          const titleEl = bestCard.querySelector('h3')
          if (titleEl) cardTitle = titleEl.textContent?.trim()
        }
      }

      positions[path] = { position: snapped, cardTitle }
      localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions))
    } catch {
      // Ignore localStorage errors
    }
  }, [getScrollPositions])

  // Restore scroll position for a path, iterating as lazy content loads.
  // Uses card title for identity-based restore (robust across layout shifts),
  // falling back to pixel position. Retries to let lazy content stabilize.
  const restoreScrollPosition = useCallback((path: string) => {
    const positions = getScrollPositions()
    const entry = positions[path]
    if (entry === undefined) return

    // Handle backward compat (old format was just a number)
    const savedPosition = typeof entry === 'number' ? entry : entry.position
    const cardTitle = typeof entry === 'number' ? undefined : entry.cardTitle
    if (savedPosition <= 0) return

    const container = getScrollContainer()
    if (!container) return

    let attempts = 0
    const maxAttempts = 10 // 10 × 100ms = 1s max (reduced from 6s)
    const minAttempts = 3  // min attempts to let content stabilize
    let lastTarget = -1
    isRestoringRef.current = true

    const tryRestore = () => {
      let target = savedPosition

      // Prefer card-based restore for robustness across layout shifts
      // Only do expensive DOM queries if we have a card title to find
      // OPTIMIZATION: Check title text FIRST (cheap) before calling getBoundingClientRect (expensive)
      if (cardTitle) {
        const cards = container.querySelectorAll('[data-tour="card"]')
        // Find the card by title first without measuring
        let targetCard: Element | null = null
        for (let i = 0; i < cards.length; i++) {
          const titleEl = cards[i].querySelector('h3')
          if (titleEl?.textContent?.trim() === cardTitle) {
            targetCard = cards[i]
            break
          }
        }
        // Only measure if we found the card
        if (targetCard) {
          const containerRect = container.getBoundingClientRect()
          const scrollTop = container.scrollTop
          const cardRect = targetCard.getBoundingClientRect()
          target = Math.max(0, cardRect.top - containerRect.top + scrollTop - 12)
        }
      }

      container.scrollTo({ top: target, behavior: 'instant' })
      attempts++

      if (attempts >= maxAttempts) {
        isRestoringRef.current = false
        return
      }

      // Stop early when position stabilizes (within 5px tolerance)
      if (attempts >= minAttempts && Math.abs(target - lastTarget) < 5) {
        isRestoringRef.current = false
        return
      }
      lastTarget = target

      // Use shorter delay for faster convergence
      requestAnimationFrame(() => {
        setTimeout(tryRestore, 100)
      })
    }

    tryRestore()
  }, [getScrollPositions])

  // Save last route and scroll position on path change
  useEffect(() => {
    // Don't track auth-related pages or the root path
    if (location.pathname.startsWith('/auth') ||
        location.pathname === '/login' ||
        location.pathname === '/onboarding' ||
        location.pathname === '/') {
      return
    }

    try {
      localStorage.setItem(LAST_ROUTE_KEY, location.pathname)
    } catch {
      // Ignore localStorage errors
    }

    // On cleanup (path change), save scroll position of the page being left
    return () => {
      saveScrollPositionNow(location.pathname)
    }
  }, [location.pathname, saveScrollPositionNow])

  // Restore last route on initial mount
  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    if (location.pathname !== '/') return

    try {
      const lastRoute = localStorage.getItem(LAST_ROUTE_KEY)
      const firstSidebarRoute = getFirstDashboardRoute()

      if (lastRoute && lastRoute !== '/' && lastRoute !== location.pathname) {
        navigate(lastRoute, { replace: true })
        setTimeout(() => {
          restoreScrollPosition(lastRoute)
        }, 150)
      } else if (firstSidebarRoute && firstSidebarRoute !== '/') {
        navigate(firstSidebarRoute, { replace: true })
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Continuously save scroll position on scroll (debounced).
  // This ensures the latest position is in localStorage even if the component
  // unmounts abruptly (e.g. sign-out clears auth before cleanup runs).
  // The isRestoringRef guard prevents overwriting when navigation resets scroll.
  useEffect(() => {
    const container = getScrollContainer()
    if (!container) return

    let timeoutId: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      clearTimeout(timeoutId)
      // Longer debounce (2s) to reduce forced reflows from getBoundingClientRect
      // This is only for scroll persistence, so longer delay is acceptable
      timeoutId = setTimeout(() => {
        saveScrollPositionNow(pathnameRef.current)
      }, 2000)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      clearTimeout(timeoutId)
      container.removeEventListener('scroll', handleScroll)
    }
  }, [saveScrollPositionNow])

  // Save scroll position on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveScrollPositionNow(pathnameRef.current)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveScrollPositionNow])

  // On navigation: restore scroll if "remember position" is on, otherwise scroll to top
  useEffect(() => {
    if (!hasRestoredRef.current) return

    const container = getScrollContainer()
    if (!container) return

    if (getRememberPosition(location.pathname)) {
      const timeoutId = setTimeout(() => {
        restoreScrollPosition(location.pathname)
      }, 50)
      return () => clearTimeout(timeoutId)
    } else {
      // Pin is off - just scroll to top immediately with no delay.
      // We don't need to protect against scroll save since Pin is off
      // and we won't restore the position anyway.
      container.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [location.pathname, restoreScrollPosition])

  return {
    lastRoute: localStorage.getItem(LAST_ROUTE_KEY),
    scrollPositions: getScrollPositions(),
  }
}

/**
 * Get the last visited route without using the hook.
 * Useful for checking the last route outside of React components.
 */
export function getLastRoute(): string | null {
  try {
    return localStorage.getItem(LAST_ROUTE_KEY)
  } catch {
    return null
  }
}

/**
 * Clear the last route and scroll positions.
 * Useful for logout or reset scenarios.
 */
export function clearLastRoute(): void {
  try {
    localStorage.removeItem(LAST_ROUTE_KEY)
    localStorage.removeItem(SCROLL_POSITIONS_KEY)
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get the "remember scroll position" preference for a dashboard path.
 * Defaults to false (off) — pages scroll to top on navigation.
 * Users can toggle "Pin" on per-dashboard to preserve position.
 */
export function getRememberPosition(path: string): boolean {
  try {
    const stored = localStorage.getItem(REMEMBER_POSITION_KEY)
    if (stored) {
      const prefs = JSON.parse(stored)
      if (path in prefs) return prefs[path]
    }
  } catch {
    // Ignore
  }
  return false // Default: off — scroll to top on navigation
}

/**
 * Set the "remember scroll position" preference for a dashboard path.
 */
export function setRememberPosition(path: string, enabled: boolean): void {
  try {
    const stored = localStorage.getItem(REMEMBER_POSITION_KEY)
    const prefs = stored ? JSON.parse(stored) : {}
    prefs[path] = enabled
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore localStorage errors
  }
}
