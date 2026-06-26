/**
 * VirtualizedMissionGrid — Renders mission cards in a virtualized grid/list.
 *
 * Uses @tanstack/react-virtual to only render visible rows, dramatically
 * reducing DOM nodes and improving performance for large mission lists
 * (hundreds of installers/fixes).
 *
 * Grid mode: groups items into rows based on container width and column count,
 * then virtualizes by row.
 * List mode: each item is its own row.
 */

import { useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ViewMode } from './types'

/** Estimated height (px) for a single card in grid mode */
const GRID_CARD_HEIGHT_PX = 280
/** Estimated height (px) for a single card in list/compact mode */
const LIST_CARD_HEIGHT_PX = 48
/** Gap between cards (px), matching Tailwind gap-3 */
const CARD_GAP_PX = 12
/** Extra space around the virtualizer to pre-render off-screen rows (px) */
const OVERSCAN_PX = 300

/** Breakpoints for column counts in grid mode (min container width -> columns) */
const GRID_BREAKPOINTS: [number, number][] = [
  [1200, 4], // xl: 4 columns
  [900, 3],  // lg: 3 columns
  [600, 2],  // md: 2 columns
  [0, 1],    // sm: 1 column
]

function getColumnCount(containerWidth: number, maxColumns: number): number {
  for (const [minWidth, cols] of GRID_BREAKPOINTS) {
    if (containerWidth >= minWidth) {
      return Math.min(cols, maxColumns)
    }
  }
  return 1
}

// ============================================================================
// Generic virtualized grid for mission cards
// ============================================================================

interface VirtualizedMissionGridProps<T> {
  /** The filtered list of items to render */
  items: T[]
  /** Current view mode */
  viewMode: ViewMode
  /** Render a single card */
  renderItem: (item: T, index: number) => React.ReactNode
  /** Maximum columns in grid mode (e.g. 4 for installers, 3 for fixes) */
  maxColumns?: number
  /** Custom estimated row height for grid mode */
  gridRowHeight?: number
  /** Custom estimated row height for list mode */
  listRowHeight?: number
  /** Optional className for the scroll container */
  className?: string
  /** Optional inline style for the scroll container (e.g. fixed height) */
  style?: React.CSSProperties
}

export function VirtualizedMissionGrid<T>({
  items,
  viewMode,
  renderItem,
  maxColumns = 4,
  gridRowHeight = GRID_CARD_HEIGHT_PX,
  listRowHeight = LIST_CARD_HEIGHT_PX,
  className,
  style }: VirtualizedMissionGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Track container width for responsive column count
  useEffect(() => {
    const el = parentRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    // Set initial width
    setContainerWidth(el.clientWidth)

    return () => observer.disconnect()
  }, [])

  const isGrid = viewMode === 'grid'
  const columnCount = isGrid ? getColumnCount(containerWidth, maxColumns) : 1

  // Group items into rows
  const rows = (() => {
    if (!isGrid) {
      // List mode: each item is its own row
      return items.map((item) => [item])
    }
    // Grid mode: chunk into rows of columnCount
    const result: T[][] = []
    for (let i = 0; i < items.length; i += columnCount) {
      result.push(items.slice(i, i + columnCount))
    }
    return result
  })()

  const estimatedRowHeight = isGrid ? gridRowHeight + CARD_GAP_PX : listRowHeight + CARD_GAP_PX

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: Math.ceil(OVERSCAN_PX / estimatedRowHeight) })

  const virtualItems = virtualizer.getVirtualItems()

  // Calculate the base index for each row's items
  const getItemIndex = (rowIndex: number, colIndex: number) => rowIndex * columnCount + colIndex

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        overflow: 'auto',
        ...style }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative' }}
      >
        {virtualItems.map((virtualRow) => {
          const rowItems = rows[virtualRow.index]
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)` }}
            >
              {isGrid ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    gap: `${CARD_GAP_PX}px`,
                    paddingBottom: `${CARD_GAP_PX}px` }}
                >
                  {rowItems.map((item, colIndex) => (
                    <div key={getItemIndex(virtualRow.index, colIndex)}>
                      {renderItem(item, getItemIndex(virtualRow.index, colIndex))}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ paddingBottom: `${CARD_GAP_PX / 2}px` }}>
                  {rowItems.length > 0 && renderItem(rowItems[0], virtualRow.index)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

