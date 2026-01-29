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

interface ScrollPositions {
  [path: string]: number
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

  // Save scroll position for a given path immediately (no debounce)
  const saveScrollPositionNow = useCallback((path: string) => {
    try {
      const container = getScrollContainer()
      const scrollTop = container ? container.scrollTop : 0
      if (scrollTop > 0) {
        const positions = getScrollPositions()
        positions[path] = scrollTop
        localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [getScrollPositions])

  // Restore scroll position for a path
  const restoreScrollPosition = useCallback((path: string) => {
    const positions = getScrollPositions()
    const savedPosition = positions[path]
    if (savedPosition !== undefined && savedPosition > 0) {
      requestAnimationFrame(() => {
        const container = getScrollContainer()
        if (container) {
          container.scrollTo({ top: savedPosition, behavior: 'instant' })
        }
      })
    }
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
