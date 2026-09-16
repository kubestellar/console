import { useState, useRef } from 'react'

// Note: Lazy mounting and eager mount scheduling have been removed.
// Cards now render immediately to show cached data without delay.
// This trades some initial render performance for better UX with cached data.

/**
 * Hook for lazy mounting - only renders content when visible in viewport.
 *
 * IMPORTANT: Cards start visible (isVisible=true) to show cached data immediately.
 * IntersectionObserver is only used for off-screen cards that scroll into view later.
 * This prevents the "empty cards on page load" issue when cached data is available.
 */
export function useLazyMount(_rootMargin = '100px') {
  // Start visible - show cached content immediately on page load.
  // This is intentional: we prioritize showing cached data over lazy loading performance.
  const [isVisible] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  // No lazy mounting - all cards render immediately.
  // The eager mount and IntersectionObserver logic has been removed because:
  // 1. It caused "empty cards" flash on page load even with cached data
  // 2. With only 4-8 cards visible at once, the performance impact is minimal
  // 3. Cached data should be shown instantly for good UX

  return { ref, isVisible }
}
