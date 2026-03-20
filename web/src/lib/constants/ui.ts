/**
 * UI constants for charts, thresholds, and shared visual styles.
 *
 * Centralises magic numbers used across dashboard cards and chart
 * components so they can be tuned from a single location.
 */

import type React from 'react'

// ── Chart dimensions ────────────────────────────────────────────────────
export const CHART_HEIGHT_STANDARD = 160
export const CHART_HEIGHT_COMPACT = 100

// ── Recharts shared styles ──────────────────────────────────────────────
export const CHART_TOOLTIP_BG = '#1a1a2e'
export const CHART_TOOLTIP_BORDER = '#333'
/** Standard border-radius for chart tooltip containers (Tailwind rounded-lg equivalent) */
export const CHART_TOOLTIP_BORDER_RADIUS = '8px'
/** Standard font size for chart tooltip text */
export const CHART_TOOLTIP_FONT_SIZE = '12px'
/** Compact font size for insight-card tooltips */
export const CHART_TOOLTIP_FONT_SIZE_COMPACT = '11px'
/** Shared Recharts Tooltip contentStyle — eliminates repeated inline objects */
export const CHART_TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: CHART_TOOLTIP_BG,
  border: `1px solid ${CHART_TOOLTIP_BORDER}`,
  borderRadius: CHART_TOOLTIP_BORDER_RADIUS,
  fontSize: CHART_TOOLTIP_FONT_SIZE,
}
/** Tailwind-gray tooltip style for unified card system charts */
const UNIFIED_CHART_TOOLTIP_BG = '#1f2937'
const UNIFIED_CHART_TOOLTIP_BORDER = '#374151'
const UNIFIED_CHART_TOOLTIP_RADIUS = '0.375rem'
export const CHART_TOOLTIP_CONTENT_STYLE_GRAY: React.CSSProperties = {
  backgroundColor: UNIFIED_CHART_TOOLTIP_BG,
  border: `1px solid ${UNIFIED_CHART_TOOLTIP_BORDER}`,
  borderRadius: UNIFIED_CHART_TOOLTIP_RADIUS,
}
export const CHART_GRID_STROKE = '#333'
export const CHART_AXIS_STROKE = '#333'
export const CHART_TICK_COLOR = '#888'
/** Tooltip item/content text — verified 13:1 contrast on CHART_TOOLTIP_BG (#1a1a2e) */
export const CHART_TOOLTIP_TEXT_COLOR = '#e0e0e0'
/** Tooltip label text — verified 11:1 contrast on CHART_TOOLTIP_BG (#1a1a2e) */
export const CHART_TOOLTIP_LABEL_COLOR = '#ccc'

// ── Kubectl proxy thresholds ────────────────────────────────────────────
export const MAX_CONCURRENT_KUBECTL_REQUESTS = 4
export const POD_RESTART_ISSUE_THRESHOLD = 5

// ── Pagination ──────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 5
