/**
 * Dashboard Scroll Tracking — tracks how far users scroll the card grid.
 *
 * Fires a debounced analytics event with 'shallow' or 'deep' depth
 * to help understand whether cards below the fold are being seen.
 */

import { useEffect, useRef } from 'react'
import { emitDashboardScrolled } from '../lib/analytics'

/** Debounce delay before firing the scroll event */
const SCROLL_DEBOUNCE_MS = 2000
/** Percentage of viewport height to consider "deep" scrolling */
const DEEP_SCROLL_THRESHOLD = 1.5

export function useDashboardScrollTracking() {
  const hasFiredShallow = useRef(false)
  const hasFiredDeep = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // The dashboard uses a <main> element with overflow-y-auto as the scroll
    // container, not the window. Listen on the actual scrollable element.
    const scrollContainer = document.querySelector('main') as HTMLElement | null

    const handleScroll = () => {
      if (hasFiredDeep.current) return // Already tracked deepest level

      if (debounceTimer.current) clearTimeout(debounceTimer.current)

      debounceTimer.current = setTimeout(() => {
        const el = scrollContainer || document.documentElement
        const scrollRatio = el.scrollTop / el.clientHeight

        if (scrollRatio >= DEEP_SCROLL_THRESHOLD && !hasFiredDeep.current) {
          hasFiredDeep.current = true
          emitDashboardScrolled('deep')
        } else if (scrollRatio > 0 && !hasFiredShallow.current) {
          hasFiredShallow.current = true
          emitDashboardScrolled('shallow')
        }
      }, SCROLL_DEBOUNCE_MS)
    }

    const target = scrollContainer || window
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      target.removeEventListener('scroll', handleScroll)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])
}
