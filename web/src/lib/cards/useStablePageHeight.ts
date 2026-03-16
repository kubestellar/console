import { useRef, useState, useEffect, useLayoutEffect } from 'react'

/**
 * Maintains stable container height across paginated pages.
 * Tracks the max observed scrollHeight and applies it as minHeight
 * so partial pages (last page with fewer items) don't shrink the card.
 * Resets when pageSize changes or when pagination is no longer needed.
 */
export function useStablePageHeight(pageSize: number | string, totalItems: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const maxHeightRef = useRef(0)
  const [stableMinHeight, setStableMinHeight] = useState(0)

  // Reset when pageSize changes
  useEffect(() => {
    maxHeightRef.current = 0
    setStableMinHeight(0)
  }, [pageSize])

  // Reset when pagination is no longer needed (totalItems <= pageSize)
  useEffect(() => {
    const effectivePageSize = typeof pageSize === 'number' ? pageSize : Infinity
    if (totalItems <= effectivePageSize) {
      maxHeightRef.current = 0
      setStableMinHeight(0)
    }
  }, [totalItems, pageSize])

  // Measure after each render and track max height.
  // Uses a post-render effect to read scrollHeight and update minHeight
  // when a taller page is observed. The guard prevents calling setState
  // when the height hasn't actually changed (avoiding re-render loops).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const effectivePageSize = typeof pageSize === 'number' ? pageSize : Infinity
    if (totalItems <= effectivePageSize) return // no pagination active

    const height = el.scrollHeight
    if (height > maxHeightRef.current) {
      maxHeightRef.current = height
      // Only call setState if the value actually changed — prevents
      // infinite useLayoutEffect → setState → re-render → useLayoutEffect
      // loops that cause "Maximum call stack size exceeded" (28 GA4 errors).
      if (height !== stableMinHeight) {
        setStableMinHeight(height)
      }
    }
  }) // no deps: must measure on every render

  const containerStyle = stableMinHeight > 0
    ? { minHeight: `${stableMinHeight}px` }
    : undefined

  return { containerRef, containerStyle }
}
