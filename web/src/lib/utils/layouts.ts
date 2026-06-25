/**
 * Common layout utility functions for consistent flex patterns across the app.
 * Centralizes the most frequently used flex combinations to reduce duplication.
 * 
 * These patterns appear hundreds of times across the codebase (from Auto-QA scan):
 * - flex items-center gap-2: 802 occurrences
 * - flex items-center gap-1: 772 occurrences
 * - flex items-center gap-3: 79 occurrences
 * - flex items-start gap-2: 76 occurrences
 */

/**
 * Creates a horizontal flex container with centered items and custom gap
 * @param gap - Gap size (1-4 or custom value like '0.5')
 * @returns className string for flex layout
 */
export function flexCenter(gap: number | string = 2): string {
  return `flex items-center gap-${gap}`
}

/**
 * Creates a horizontal flex container with items aligned to start and custom gap
 * @param gap - Gap size (1-4 or custom value)
 * @returns className string for flex layout
 */
export function flexStart(gap: number | string = 2): string {
  return `flex items-start gap-${gap}`
}

/**
 * Creates a flex container with wrapping, centered items, and space-between justification
 * @param gap - Gap size (default: 2)
 * @returns className string for flex layout
 */
export function flexWrapBetween(gap: number | string = 2): string {
  return `flex flex-wrap items-center justify-between gap-${gap}`
}

/**
 * Creates a flex container with centered items and centered justification
 * @param gap - Gap size (default: 1)
 * @returns className string for flex layout
 */
export function flexCenterJustify(gap: number | string = 1): string {
  return `flex items-center justify-center gap-${gap}`
}

/**
 * Creates a vertical flex column with custom gap
 * @param gap - Gap size (default: 4)
 * @returns className string for flex column layout
 */
export function flexCol(gap: number | string = 4): string {
  return `flex flex-col gap-${gap}`
}

/**
 * Creates a vertical flex column with centered items and centered content
 * Used for empty states and loading indicators
 * @param gap - Gap size (default: 2)
 * @returns className string for centered column layout
 */
export function flexColCenter(gap: number | string = 2): string {
  return `flex flex-col items-center justify-center min-h-card text-muted-foreground gap-${gap}`
}

/**
 * Common pre-composed layout patterns as constants for direct use
 */
export const LAYOUTS = {
  /** Most common: flex items-center gap-2 (802 occurrences) */
  CENTER_GAP_2: 'flex items-center gap-2',
  /** Second most common: flex items-center gap-1 (772 occurrences) */
  CENTER_GAP_1: 'flex items-center gap-1',
  /** flex items-center gap-3 (79 occurrences) */
  CENTER_GAP_3: 'flex items-center gap-3',
  /** flex items-start gap-2 (76 occurrences) */
  START_GAP_2: 'flex items-start gap-2',
  /** flex flex-wrap items-center justify-between gap-2 (102 occurrences) */
  WRAP_BETWEEN_GAP_2: 'flex flex-wrap items-center justify-between gap-2',
  /** flex items-center justify-center gap-1 (38 occurrences) */
  CENTER_JUSTIFY_GAP_1: 'flex items-center justify-center gap-1',
  /** Empty state / loading centered column */
  COL_CENTER_EMPTY: 'flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2',
  /** Card content column */
  COL_CARD_CONTENT: 'flex flex-col min-h-card content-loaded gap-4',
  /** Simple flex with gap-2 */
  FLEX_GAP_2: 'flex gap-2',
} as const
