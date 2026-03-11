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
  // Intentionally has no dependency array — must run on every render
  // to capture height changes from page navigation, data updates, etc.
  //
  // Safety: updatesInBatchRef prevents cascading useLayoutEffect → setState
  // loops. Each React commit batch allows one height update; subsequent
  // layout effects in the same batch skip the setState to avoid triggering
  // React error #185 (Maximum update depth exceeded).  The counter resets
  // via a microtask so the next user-initiated render batch starts fresh.
  const updatesInBatchRef = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const effectivePageSize = typeof pageSize === 'number' ? pageSize : Infinity
    if (totalItems <= effectivePageSize) return // no pagination active

    const height = el.scrollHeight
    if (height > maxHeightRef.current) {
      // Allow at most one setState per React commit batch to prevent
      // infinite layout-effect cascades with other useLayoutEffect hooks
      // (e.g. useReportCardDataState) that also trigger re-renders.
      const MAX_HEIGHT_UPDATES_PER_BATCH = 1
      if (updatesInBatchRef.current >= MAX_HEIGHT_UPDATES_PER_BATCH) return
      updatesInBatchRef.current++
      // Reset counter after this batch completes (microtask runs between batches)
      queueMicrotask(() => { updatesInBatchRef.current = 0 })

      maxHeightRef.current = height
      setStableMinHeight(height)
    }
  })

  const containerStyle = stableMinHeight > 0
    ? { minHeight: `${stableMinHeight}px` }
    : undefined

  return { containerRef, containerStyle }
}
