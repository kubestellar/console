/**
 * UI constants for charts, thresholds, and shared visual styles.
 *
 * Centralises magic numbers used across dashboard cards and chart
 * components so they can be tuned from a single location.
 */

// ── Chart dimensions ────────────────────────────────────────────────────
export const CHART_HEIGHT_STANDARD = 160
export const CHART_HEIGHT_COMPACT = 100

// ── Recharts shared styles ──────────────────────────────────────────────
export const CHART_TOOLTIP_BG = '#1a1a2e'
export const CHART_TOOLTIP_BORDER = '#333'
export const CHART_GRID_STROKE = '#333'
export const CHART_AXIS_STROKE = '#333'
export const CHART_TICK_COLOR = '#888'

// ── Kubectl proxy thresholds ────────────────────────────────────────────
export const MAX_CONCURRENT_KUBECTL_REQUESTS = 4
export const POD_RESTART_ISSUE_THRESHOLD = 5

// ── Pagination ──────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 5
