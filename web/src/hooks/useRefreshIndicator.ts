import { useState, useCallback, useRef, useEffect } from 'react'

// Minimum time to show the "Updating" hourglass indicator.
// Ensures the hourglass is always visible even if data returns instantly.
const MIN_REFRESH_INDICATOR_MS = 500

/**
 * Hook that guarantees the refresh/hourglass indicator is visible for at least
 * MIN_REFRESH_INDICATOR_MS in two scenarios:
 *
 * 1. On mount — when a dashboard is first opened, the hourglass shows while
 *    the data hooks perform their initial (possibly silent/cached) fetch.
 * 2. On click — when the user clicks the refresh button.
 *
 * Usage:
 *   const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
 *   const isRefreshVisible = isRefreshing || showIndicator
 *   // Use isRefreshVisible for the hourglass, triggerRefresh for onClick
 */
export function useRefreshIndicator(refetchFn: () => void) {
  // Start true so the hourglass shows immediately when a dashboard opens
  const [showIndicator, setShowIndicator] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the mount indicator after the minimum display duration
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setShowIndicator(false)
      timerRef.current = null
    }, MIN_REFRESH_INDICATOR_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

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
