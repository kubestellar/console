import { useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const LAST_ROUTE_KEY = 'kubestellar-last-route'
const SCROLL_POSITIONS_KEY = 'kubestellar-scroll-positions'
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
      if (scrollTop <= 0) return

      // Snap to the top of the first card visible in the viewport.
      // Cards use data-tour="card". We use getBoundingClientRect to get
      // the absolute position within the scroll container (offsetTop is
      // relative to offsetParent, which may not be the scroll container).
      let snapped = scrollTop
      let cardTitle: string | undefined
      const cards = container.querySelectorAll('[data-tour="card"]')
      if (cards.length > 0) {
        const containerRect = container.getBoundingClientRect()
        let bestCard: Element | null = null
        let best = scrollTop
        for (let i = 0; i < cards.length; i++) {
          const cardRect = cards[i].getBoundingClientRect()
          const cardAbsTop = cardRect.top - containerRect.top + scrollTop
          if (cardAbsTop <= scrollTop + 8) {
            best = cardAbsTop
            bestCard = cards[i]
          } else {
            break
          }
        }
        snapped = Math.max(0, best - 12) // 12px breathing room above card
        // Save the card title for identity-based restore
        if (bestCard) {
          const titleEl = bestCard.querySelector('h3')
          if (titleEl) cardTitle = titleEl.textContent?.trim()
        }
      }

      const positions = getScrollPositions()
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
    const maxAttempts = 40 // 40 × 150ms = 6s max (dashboard cards are lazy-loaded)
    const minAttempts = 8  // min attempts to let lazy content stabilize
    let lastTarget = -1
    isRestoringRef.current = true

    const tryRestore = () => {
      let target = savedPosition

      // Prefer card-based restore for robustness across layout shifts
      if (cardTitle) {
        const cards = container.querySelectorAll('[data-tour="card"]')
        const containerRect = container.getBoundingClientRect()
        for (let i = 0; i < cards.length; i++) {
          const titleEl = cards[i].querySelector('h3')
          if (titleEl?.textContent?.trim() === cardTitle) {
            const cardRect = cards[i].getBoundingClientRect()
            target = Math.max(0, cardRect.top - containerRect.top + container.scrollTop - 12)
            break
          }
        }
      }

      container.scrollTo({ top: target, behavior: 'instant' })
      attempts++

      if (attempts >= maxAttempts) {
        isRestoringRef.current = false
        return
      }

      // After minimum attempts, stop when position stabilizes.
      // But don't stabilize early if the target is far below the saved pixel
      // position — that means lazy cards above haven't loaded yet, and the
      // card we found is at a temporarily low position.
      const contentStillLoading = target < savedPosition * 0.8
      if (attempts >= minAttempts && Math.abs(target - lastTarget) < 2 && !contentStillLoading) {
        isRestoringRef.current = false
        return
      }
      lastTarget = target

      // Content is lazy-loaded — scrolling reveals more cards which grows height.
      // Wait for new content to render, then try again.
      requestAnimationFrame(() => {
        setTimeout(tryRestore, 150)
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
  // The scrollTop <= 0 guard in saveScrollPositionNow prevents overwriting
  // with 0 when navigation resets the scroll.
  useEffect(() => {
    const container = getScrollContainer()
    if (!container) return

    let timeoutId: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        saveScrollPositionNow(pathnameRef.current)
      }, 500)
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

  // Restore scroll when navigating to a previously visited page
  useEffect(() => {
    if (!hasRestoredRef.current) return

    const timeoutId = setTimeout(() => {
      restoreScrollPosition(location.pathname)
    }, 50)

    return () => clearTimeout(timeoutId)
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
