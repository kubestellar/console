/**
 * Design Tokens — single source of truth for design values used in JS/TS code.
 *
 * CSS variables (index.css) remain the canonical source for Tailwind classes.
 * This file provides the same values for:
 * - Chart libraries (Recharts, D3) that need hex values
 * - Canvas rendering (games, animations)
 * - Dynamic style calculations
 *
 * IMPORTANT: Keep these in sync with CSS variables in index.css.
 * When adding a new color, add it to index.css first, then reference it here.
 */

// ============================================================================
// Stat Block Colors — color name → hex mapping for StatsOverview charts
// ============================================================================

export const STAT_BLOCK_COLORS: Record<string, string> = {
  purple: '#9333ea',
  green: '#10b981',   // Matches --color-success
  orange: '#f97316',
  yellow: '#eab308',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  red: '#ef4444',     // Matches --color-error
  gray: '#6b7280',
}
