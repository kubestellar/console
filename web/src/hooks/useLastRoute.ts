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
 * Hook to persist and restore the last visited route and scroll position.
 * Saves the current route on navigation and scroll position on scroll/unload.
 * On initial app load, redirects to the last route and restores scroll.
 */
export function useLastRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const hasRestoredRef = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get stored scroll positions
  const getScrollPositions = useCallback((): ScrollPositions => {
    try {
      return JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY) || '{}')
    } catch {
      return {}
    }
  }, [])

  // Save scroll position for current path (debounced)
  const saveScrollPosition = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      try {
        const positions = getScrollPositions()
        positions[location.pathname] = window.scrollY
        localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions))
      } catch {
        // Ignore localStorage errors
      }
    }, 100) // Debounce for 100ms
  }, [location.pathname, getScrollPositions])

  // Restore scroll position for a path
  const restoreScrollPosition = useCallback((path: string) => {
    const positions = getScrollPositions()
    const savedPosition = positions[path]
    if (savedPosition !== undefined && savedPosition > 0) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedPosition, behavior: 'instant' })
      })
    }
  }, [getScrollPositions])

  // Save last route on path change
  useEffect(() => {
    // Don't track auth-related pages or the root path (which is a redirect target)
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
  }, [location.pathname])

  // Restore last route on initial mount
  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    // Only redirect if we're on the root path
    if (location.pathname !== '/') return

    try {
      const lastRoute = localStorage.getItem(LAST_ROUTE_KEY)
      // Always check for a first-sidebar-item override first
      const firstSidebarRoute = getFirstDashboardRoute()

      if (lastRoute && lastRoute !== '/' && lastRoute !== location.pathname) {
        // Navigate to last visited route and restore scroll after navigation
        navigate(lastRoute, { replace: true })
        // Restore scroll position after a short delay to allow page to render
        setTimeout(() => {
          restoreScrollPosition(lastRoute)
        }, 100)
      } else if (firstSidebarRoute && firstSidebarRoute !== '/') {
        // No saved route or it's root — navigate to first sidebar item
        navigate(firstSidebarRoute, { replace: true })
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Set up scroll listener
  useEffect(() => {
    window.addEventListener('scroll', saveScrollPosition, { passive: true })
    window.addEventListener('beforeunload', saveScrollPosition)

    return () => {
      window.removeEventListener('scroll', saveScrollPosition)
      window.removeEventListener('beforeunload', saveScrollPosition)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [saveScrollPosition])

  // Restore scroll when navigating to a previously visited page
  useEffect(() => {
    // Skip the initial restore which is handled separately
    if (!hasRestoredRef.current) return

    // Small delay to allow page content to render
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
