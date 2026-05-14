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
export const CHART_HEIGHT_SM = 128
export const CHART_HEIGHT_LG = 192
export const CHART_MIN_HEIGHT_PX = 200
export const CHART_MIN_HEIGHT_TALL_PX = 250

// ── Recharts shared styles ──────────────────────────────────────────────
export const CHART_TOOLTIP_BG = '#1a1a2e'
export const CHART_TOOLTIP_BORDER = '#333'
/** Standard font size for chart tooltip text */
export const CHART_TOOLTIP_FONT_SIZE = '12px'
/** Compact font size for insight-card tooltips */
export const CHART_TOOLTIP_FONT_SIZE_COMPACT = '11px'
/** Shared tooltip content style — used to extract bg/border for echarts tooltip config */
export const CHART_TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: CHART_TOOLTIP_BG,
  border: `1px solid ${CHART_TOOLTIP_BORDER}`,
  borderRadius: '8px',
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
/** DataZoom slider border color */
export const CHART_DATAZOOM_BORDER = '#444'
/** DataZoom slider background overlay */
export const CHART_DATAZOOM_BG = 'rgba(50,50,50,0.3)'
/** DataZoom slider selected-range filler */
export const CHART_DATAZOOM_FILLER = 'rgba(68,114,196,0.15)'
/** DataZoom slider handle color */
export const CHART_DATAZOOM_HANDLE = '#666'
/** DataZoom label text color */
export const CHART_DATAZOOM_TEXT = '#888'
/** DataZoom data-background line color */
export const CHART_DATAZOOM_DATA_LINE = '#555'
/** DataZoom data-background area color */
export const CHART_DATAZOOM_DATA_AREA = 'rgba(100,100,100,0.2)'
/** Chart mark-line label color (secondary text on dark background) */
export const CHART_MARK_LINE_LABEL = '#888'
/** Chart mark-line stroke color (dashed guide lines) */
export const CHART_MARK_LINE_STROKE = '#666'
/** Tooltip item/content text — verified 13:1 contrast on CHART_TOOLTIP_BG (#1a1a2e) */
export const CHART_TOOLTIP_TEXT_COLOR = '#e0e0e0'
/** Tooltip label text — verified 11:1 contrast on CHART_TOOLTIP_BG (#1a1a2e) */
export const CHART_TOOLTIP_LABEL_COLOR = '#ccc'
/** White text for high-contrast labels on dark chart elements (treemap tiles, legends) */
export const CHART_TEXT_WHITE = '#fff'
/** Muted secondary text for chart labels and axis names */
export const CHART_TEXT_MUTED = '#aaa'

// ── ECharts numeric font sizes (number, not string — ECharts API) ──────
/** Axis tick label font size (ECharts numeric) */
export const CHART_AXIS_FONT_SIZE = 10
/** Small axis label font size for dense charts (ECharts numeric) */
export const CHART_AXIS_FONT_SIZE_SM = 9
/** Standard tooltip / legend font size (ECharts numeric) */
export const CHART_BODY_FONT_SIZE = 12
/** Legend text font size for chart legends (ECharts numeric) */
export const CHART_LEGEND_FONT_SIZE = 11
/** Tiny marker label font size for map cluster markers (DOM px) */
export const CLUSTER_MARKER_FONT_SIZE = 8

// ── Kubectl proxy thresholds ────────────────────────────────────────────
export const MAX_CONCURRENT_KUBECTL_REQUESTS = 4
export const POD_RESTART_ISSUE_THRESHOLD = 5

// ── Clipboard feedback ───────────────────────────────────────────────
/** Duration (ms) to show "copied" feedback before resetting the icon */
export const COPY_FEEDBACK_TIMEOUT_MS = 2000

// ── Pagination ──────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 5

// ── Layout dimensions ──────────────────────────────────────────────────
/** Height of the top navbar in pixels (h-16 = 64px) */
export const NAVBAR_HEIGHT_PX = 64
/** Height of each status banner (network, demo, offline) in pixels — matches min-h-11 (44px) dismiss buttons */
export const BANNER_HEIGHT_PX = 44
/** Collapse mobile banner stacks into a summary row once this many alerts are active. */
export const MOBILE_BANNER_COLLAPSE_THRESHOLD = 2
/**
 * Horizontal offset (in pixels) from the sidebar's right edge at which the
 * floating collapse + pin control container is anchored (see Sidebar.tsx).
 *
 * The value is negative so the container visually overlaps the sidebar's
 * `border-r` line by 1px. Without this overlap the sidebar border bleeds
 * through behind the control container (Issue 8843) — the sidebar uses a
 * translucent `glass` background and sits at `z-modal` while the control
 * container sits at `z-sticky`, so any gap between them lets the vertical
 * border line render beside/behind the icons.
 */
export const SIDEBAR_CONTROLS_LEFT_OFFSET_PX = -1

/**
 * Width reserved in the main content margin for the sidebar's floating
 * collapse + pin controls (see Sidebar.tsx). The control container is
 * anchored at `left: sidebarWidth + SIDEBAR_CONTROLS_LEFT_OFFSET_PX` with
 * `p-1` (4px padding) wrapping a `w-8` (32px) button, so the right edge
 * lands near `sidebarWidth + 39`. Main content must clear that end plus a
 * small breathing gap so page headers (e.g. the Dashboard title) are not
 * obscured by the button — issue 8891 reported the "D" in "Dashboard"
 * being visually clipped when this value was only 14px.
 *   button right edge (~39) + breathing gap (~9) = 48
 */
export const SIDEBAR_CONTROLS_OFFSET_PX = 48
