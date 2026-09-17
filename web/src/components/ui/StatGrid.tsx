import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * StatGrid - Responsive grid wrapper for stat tile layouts
 *
 * Replaces the common pattern duplicated across status cards:
 * `grid grid-cols-2 @md:grid-cols-{3,4} gap-{2,3}`
 *
 * Pairs with `StatTile` (components/cards/shared/StatTile.tsx) to build
 * the "stat overview" section found at the top of most status cards.
 */

type StatGridCols = 2 | 3 | 4
type StatGridGap = 2 | 3

interface StatGridProps {
  children: ReactNode
  className?: string
  /** Number of columns at the `@md` container breakpoint (mobile is always 2). */
  cols?: StatGridCols
  gap?: StatGridGap
}

const COLS_MAP: Record<StatGridCols, string> = {
  2: '@md:grid-cols-2',
  3: '@md:grid-cols-3',
  4: '@md:grid-cols-4',
}

const GAP_MAP: Record<StatGridGap, string> = {
  2: 'gap-2',
  3: 'gap-3',
}

export function StatGrid({ children, className, cols = 4, gap = 2 }: StatGridProps) {
  return (
    <div className={cn('grid grid-cols-2', COLS_MAP[cols], GAP_MAP[gap], className)}>
      {children}
    </div>
  )
}
