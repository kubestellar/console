import { useState, useCallback, useRef } from 'react'

// Minimum time to show the "Updating" hourglass indicator.
// Ensures the hourglass is always visible even if data returns instantly.
const MIN_REFRESH_INDICATOR_MS = 500

/**
 * Hook that guarantees the refresh/hourglass indicator is visible for at least
 * MIN_REFRESH_INDICATOR_MS when the user clicks the refresh button.
 *
 * This solves the problem where cached data returns so fast that React never
 * renders the isRefreshing=true state from the data hooks.
 *
 * Usage:
 *   const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
 *   const isRefreshVisible = isRefreshing || showIndicator
 *   // Use isRefreshVisible for the hourglass, triggerRefresh for onClick
 */
export function useRefreshIndicator(refetchFn: () => void) {
  const [showIndicator, setShowIndicator] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerRefresh = useCallback(() => {
    // Always show the indicator immediately
    setShowIndicator(true)

    // Clear any existing timer (e.g. rapid clicks)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    // Call the actual data refetch
    refetchFn()

    // Ensure minimum visible duration
    timerRef.current = setTimeout(() => {
      setShowIndicator(false)
      timerRef.current = null
    }, MIN_REFRESH_INDICATOR_MS)
  }, [refetchFn])

  return { showIndicator, triggerRefresh }
}
