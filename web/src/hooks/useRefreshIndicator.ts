import { useState, useCallback, useRef } from 'react'
import { triggerAllRefetches } from '../lib/modeTransition'

// Minimum time to show the refresh indicator on user-triggered refreshes.
// Kept short for snappy feedback without causing visible flicker.
const MIN_REFRESH_INDICATOR_MS = 300

/**
 * Hook that shows a brief refresh indicator when the user clicks the refresh
 * button. Does NOT show on mount — cached data should render instantly.
 *
 * Usage:
 *   const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
 */
export function useRefreshIndicator(refetchFn: () => void, _resetKey?: string) {
  const [showIndicator, setShowIndicator] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerRefresh = useCallback(() => {
    setShowIndicator(true)

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Call the primary refetch function (e.g., cluster data)
    refetchFn()

    // Also trigger all registered cache refetches so individual card data
    // hooks (useCachedPods, useCachedDeployments, etc.) reload their data (#4909).
    triggerAllRefetches()

    timerRef.current = setTimeout(() => {
      setShowIndicator(false)
      timerRef.current = null
    }, MIN_REFRESH_INDICATOR_MS)
  }, [refetchFn])

  return { showIndicator, triggerRefresh }
}
