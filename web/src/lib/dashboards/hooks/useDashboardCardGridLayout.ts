/**
 * Virtualization + responsive-grid layout for the DashboardPage cards grid.
 *
 * Tracks how many cards are rendered (virtualization), the dashboard's
 * measured width (used for per-card sizing), and whether the compact grid
 * layout should be used on narrow viewports.
 *
 * Split out of useDashboardPageState (issues 22978 / 23018) to keep each
 * hook file focused and under the file-size limit.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DashboardCard } from '../types'

const DASHBOARD_VIRTUALIZATION_THRESHOLD = 60
const DASHBOARD_VIRTUALIZATION_INITIAL_COUNT = 48
const DASHBOARD_VIRTUALIZATION_STEP = 24
const DASHBOARD_VIRTUALIZATION_ROOT_MARGIN = '900px 0px'
const COMPACT_GRID_BREAKPOINT_PX = 1200

export function useDashboardCardGridLayout(cards: DashboardCard[], showCards: boolean) {
  const [visibleCardCount, setVisibleCardCount] = useState(DASHBOARD_VIRTUALIZATION_INITIAL_COUNT)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const dashboardRef = useRef<HTMLDivElement | null>(null)
  const [dashboardWidth, setDashboardWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : 0
  ))
  const cardsGridRef = useRef<HTMLDivElement | null>(null)
  const [useCompactGrid, setUseCompactGrid] = useState(false)

  const shouldVirtualizeCards = showCards && cards.length > DASHBOARD_VIRTUALIZATION_THRESHOLD
  const visibleCards = useMemo(
    () => (shouldVirtualizeCards ? cards.slice(0, Math.min(cards.length, visibleCardCount)) : cards),
    [cards, shouldVirtualizeCards, visibleCardCount],
  )

  useEffect(() => {
    if (!showCards) return
    setVisibleCardCount((prev) => {
      const nextMinimum = Math.min(cards.length, DASHBOARD_VIRTUALIZATION_INITIAL_COUNT)
      return prev < nextMinimum ? nextMinimum : prev
    })
  }, [cards.length, showCards])

  useEffect(() => {
    if (!shouldVirtualizeCards || visibleCardCount >= cards.length) return
    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some(entry => entry.isIntersecting)) return
        setVisibleCardCount(prev => Math.min(prev + DASHBOARD_VIRTUALIZATION_STEP, cards.length))
      },
      { rootMargin: DASHBOARD_VIRTUALIZATION_ROOT_MARGIN },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [cards.length, shouldVirtualizeCards, visibleCardCount])

  useEffect(() => {
    const target = dashboardRef.current
    if (!target || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width)
      setDashboardWidth(prev => (prev === nextWidth ? prev : nextWidth))
    })

    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!showCards || cards.length === 0) return
    const target = cardsGridRef.current
    if (!target || typeof ResizeObserver === 'undefined') return

    const syncGridMode = (width: number) => {
      setUseCompactGrid(width < COMPACT_GRID_BREAKPOINT_PX)
    }

    syncGridMode(target.getBoundingClientRect().width)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      syncGridMode(entry.contentRect.width)
    })

    observer.observe(target)
    return () => observer.disconnect()
  }, [cards.length, showCards])

  return {
    dashboardRef,
    dashboardWidth,
    cardsGridRef,
    useCompactGrid,
    loadMoreRef,
    shouldVirtualizeCards,
    visibleCards,
  }
}
