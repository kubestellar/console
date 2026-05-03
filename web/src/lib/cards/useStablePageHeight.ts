import { useRef, useState, useEffect, useLayoutEffect } from 'react'

/**
 * Maintains stable container height across paginated pages.
 * Tracks the max observed scrollHeight and applies it as minHeight
 * so partial pages (last page with fewer items) don't shrink the card.
 * Resets when pageSize changes or when pagination is no longer needed.
 *
 * FIX (#185): Previous implementation used useLayoutEffect with no deps
 * and called setState on every render, which caused "Maximum update depth
 * exceeded" when scrollHeight oscillated due to minHeight changes.
 * Now uses a measured flag to ensure only one setState per measurement
 * cycle and compares against the ref (not stale state) to break loops.
 */
export function useStablePageHeight(pageSize: number | string, totalItems: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const maxHeightRef = useRef(0)
  const [stableMinHeight, setStableMinHeight] = useState(0)
  // Track whether we've completed initial measurement to avoid re-measuring loops
  const hasMeasuredRef = useRef(false)

  // Reset when pageSize changes
  useEffect(() => {
    maxHeightRef.current = 0
    hasMeasuredRef.current = false
    setStableMinHeight(0)
  }, [pageSize])

  // Reset when pagination is no longer needed (totalItems <= pageSize)
  useEffect(() => {
    const effectivePageSize = typeof pageSize === 'number' ? pageSize : Infinity
    if (totalItems <= effectivePageSize) {
      maxHeightRef.current = 0
      hasMeasuredRef.current = false
      setStableMinHeight(0)
    }
  }, [totalItems, pageSize])

  // Measure after render and track max height.
  // Only measures ONCE per reset cycle to avoid oscillation loops where
  // setting minHeight causes scrollHeight to change, which triggers another
  // setState, ad infinitum (React #185).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const effectivePageSize = typeof pageSize === 'number' ? pageSize : Infinity
    if (totalItems <= effectivePageSize) return

    // Once we've measured and set the height, stop re-measuring.
    // This breaks the oscillation loop entirely.
    if (hasMeasuredRef.current) return

    // Temporarily clear minHeight so we measure natural content height
    const prevMinHeight = el.style.minHeight
    el.style.minHeight = ''
    const height = el.scrollHeight
    el.style.minHeight = prevMinHeight

    if (height > 0 && height > maxHeightRef.current) {
      maxHeightRef.current = height
      hasMeasuredRef.current = true
      setStableMinHeight(height)
    } else if (height > 0) {
      // Height didn't grow but we still have a valid measurement — mark done
      hasMeasuredRef.current = true
    }
  }) // no deps: must run after every render until measured

  const containerStyle = stableMinHeight > 0
    ? { minHeight: `${stableMinHeight}px` }
    : undefined

  return { containerRef, containerStyle }
}
