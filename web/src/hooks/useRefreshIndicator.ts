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
 *   const isRefreshVisible = isFetching  // use isFetching to sync hourglass with spin icon
 *
 * For components that are reused across route changes (e.g. CustomDashboard
 * rendered at /custom-dashboard/:id), pass a resetKey so the mount indicator
 * re-triggers when the key changes:
 *   const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch, id)
 */
export function useRefreshIndicator(refetchFn: () => void, resetKey?: string) {
  // Start true so the hourglass shows immediately when a dashboard opens
  const [showIndicator, setShowIndicator] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show the indicator on mount, and re-trigger when resetKey changes
  // (handles route reuse where the component doesn't unmount/remount)
  useEffect(() => {
    setShowIndicator(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setShowIndicator(false)
      timerRef.current = null
    }, MIN_REFRESH_INDICATOR_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [resetKey])

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
