/**
 * Responsive grid-column utility for stat block layouts.
 */

const SINGLE_ROW_MAX = 4
const FIVE_COL_MAX = 5
const TWO_ROW_MAX = 6
const THREE_ROW_MAX = 8

export function getResponsiveGridCols(count: number): string {
  if (count <= SINGLE_ROW_MAX) return 'grid-cols-2 md:grid-cols-4'
  if (count <= FIVE_COL_MAX) return 'grid-cols-2 md:grid-cols-5'
  if (count <= TWO_ROW_MAX) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
  if (count <= THREE_ROW_MAX) return 'grid-cols-2 md:grid-cols-4 lg:grid-cols-8'
  return 'grid-cols-2 md:grid-cols-5 lg:grid-cols-10'
}
