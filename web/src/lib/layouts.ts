/**
 * Shared layout utility classes for common patterns
 *
 * These constants consolidate frequently repeated Tailwind class combinations
 * to improve consistency and reduce bundle size through deduplication.
 *
 * Usage:
 * ```tsx
 * import { FLEX_CENTER_GAP_2, FLEX_COL_MIN_H_CARD } from '@/lib/layouts'
 *
 * <div className={FLEX_CENTER_GAP_2}>
 *   <Icon />
 *   <span>Label</span>
 * </div>
 * ```
 */

// Flex row layouts with centered items
export const FLEX_CENTER_GAP_0 = 'flex items-center gap-0'
export const FLEX_CENTER_GAP_1 = 'flex items-center gap-1'
export const FLEX_CENTER_GAP_2 = 'flex items-center gap-2'
export const FLEX_CENTER_GAP_3 = 'flex items-center gap-3'
export const FLEX_CENTER_GAP_4 = 'flex items-center gap-4'
export const FLEX_CENTER_GAP_6 = 'flex items-center gap-6'
export const FLEX_CENTER_GAP_8 = 'flex items-center gap-8'

// Flex row layouts with start-aligned items
export const FLEX_START_GAP_2 = 'flex items-start gap-2'
export const FLEX_START_GAP_3 = 'flex items-start gap-3'
export const FLEX_START_GAP_4 = 'flex items-start gap-4'

// Flex row layouts with centered items and justify
export const FLEX_CENTER_JUSTIFY_GAP_1 = 'flex items-center justify-center gap-1'
export const FLEX_CENTER_JUSTIFY_GAP_2 = 'flex items-center justify-center gap-2'

// Flex row layouts with wrap
export const FLEX_WRAP_CENTER_BETWEEN_GAP_2 = 'flex flex-wrap items-center justify-between gap-2'
export const FLEX_WRAP_CENTER_GAP_2 = 'flex flex-wrap items-center gap-2'

// Flex column layouts
export const FLEX_COL = 'flex flex-col'
export const FLEX_COL_GAP_2 = 'flex flex-col gap-2'
export const FLEX_COL_GAP_4 = 'flex flex-col gap-4'
export const FLEX_COL_CENTER_JUSTIFY_MIN_H_CARD_GAP_2 = 'flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2'
export const FLEX_COL_MIN_H_CARD_CONTENT_LOADED_GAP_4 = 'flex flex-col min-h-card content-loaded gap-4'

// Generic flex
export const FLEX_GAP_2 = 'flex gap-2'
export const FLEX_GAP_4 = 'flex gap-4'

// Grid layouts
export const GRID_COLS_1 = 'grid grid-cols-1'
export const GRID_COLS_2 = 'grid grid-cols-2'
export const GRID_COLS_3 = 'grid grid-cols-3'
export const GRID_COLS_4 = 'grid grid-cols-4'
export const GRID_COLS_12 = 'grid grid-cols-12'

// Responsive grid layouts
export const GRID_COLS_1_LG_3 = 'grid grid-cols-1 lg:grid-cols-3'
export const GRID_COLS_1_MD_2_LG_3 = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
export const GRID_COLS_1_MD_2 = 'grid grid-cols-1 md:grid-cols-2'
