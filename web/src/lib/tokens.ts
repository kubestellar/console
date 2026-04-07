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
// Status Colors — semantic colors for health, alerts, badges
// ============================================================================

export const STATUS_COLORS = {
  success: '#10b981',  // --color-success (emerald-500)
  warning: '#f59e0b',  // --color-warning (amber-500)
  error: '#ef4444',    // --color-error (red-500)
  info: '#06b6d4',     // --color-info (cyan-500)
  neutral: '#6b7280',  // --color-neutral (gray-500)
  pending: '#eab308',  // --color-pending (yellow-500)
} as const

// ============================================================================
// Brand Colors — KubeStellar brand palette
// ============================================================================

export const BRAND_COLORS = {
  purple: '#9333ea',  // --ks-purple
  blue: '#3b82f6',    // --ks-blue
  pink: '#ec4899',    // --ks-pink
  green: '#10b981',   // --ks-green
  cyan: '#06b6d4',    // --ks-cyan
} as const

// ============================================================================
// Chart Colors — ordered palette for multi-series charts
// ============================================================================

export const CHART_COLORS = [
  '#9333ea',  // --chart-color-1 (purple)
  '#3b82f6',  // --chart-color-2 (blue)
  '#10b981',  // --chart-color-3 (green)
  '#f59e0b',  // --chart-color-4 (amber)
  '#ef4444',  // --chart-color-5 (red)
  '#06b6d4',  // --chart-color-6 (cyan)
  '#8b5cf6',  // --chart-color-7 (violet)
  '#14b8a6',  // --chart-color-8 (teal)
] as const

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

// ============================================================================
// Z-Index Scale — matches tailwind.config.js zIndex extension
// ============================================================================

export const Z_INDEX = {
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  critical: 600,
} as const

// ============================================================================
// Spacing Constants — common named values for dynamic calculations
// ============================================================================

export const LAYOUT = {
  /** Navbar height in pixels */
  NAVBAR_HEIGHT_PX: 64,
  /** Sidebar collapsed width in pixels */
  SIDEBAR_COLLAPSED_WIDTH_PX: 64,
  /** Sidebar minimum expanded width in pixels */
  SIDEBAR_MIN_WIDTH_PX: 180,
  /** Sidebar maximum expanded width in pixels */
  SIDEBAR_MAX_WIDTH_PX: 480,
} as const
