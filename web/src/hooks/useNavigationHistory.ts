import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const STORAGE_KEY = 'kubestellar-nav-history'
const MAX_HISTORY = 100

export function useNavigationHistory() {
  const location = useLocation()

  useEffect(() => {
    // Don't track auth-related pages
    if (location.pathname.startsWith('/auth') || location.pathname === '/login') {
      return
    }

    // Get existing history
    const existingHistory = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

    // Add current path to history
    const newHistory = [location.pathname, ...existingHistory].slice(0, MAX_HISTORY)

    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
  }, [location.pathname])
}

// Get analyzed behavior data
export function getNavigationBehavior() {
  const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

  // Count visits per path
  const visitCounts: Record<string, number> = {}
  history.forEach((path: string) => {
    visitCounts[path] = (visitCounts[path] || 0) + 1
  })

  // Sort by frequency
  const sortedPaths = Object.entries(visitCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([path, count]) => ({ path, count }))

  return {
    totalVisits: history.length,
    uniquePages: Object.keys(visitCounts).length,
    topPages: sortedPaths.slice(0, 10),
  }
}
