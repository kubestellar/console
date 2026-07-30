/**
 * Shared styles and constants for widget export modal previews.
 */

import type { CSSProperties } from 'react'

// Inline style constants
export const WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX = 260
export const WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX = 220
export const WIDGET_EXPORT_MODAL_DIV_STYLE_2: CSSProperties = { flex: 1 }
export const WIDGET_EXPORT_MODAL_SPAN_STYLE_1: CSSProperties = { fontWeight: 500, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
export const WIDGET_EXPORT_MODAL_SPAN_STYLE_2: CSSProperties = { fontWeight: 500 }
export const WIDGET_EXPORT_MODAL_SPAN_STYLE_3: CSSProperties = { fontWeight: 500, flex: 1 }
export const WIDGET_EXPORT_MODAL_SPAN_STYLE_4: CSSProperties = { width: '24px', fontWeight: 600, color: '#9ca3af' }

// Spacing constants aligned to the 4px grid – centralise magic values used throughout widget previews
export const PREV_XS = '4px'           // 1 × 4px: tight gaps and small padding
export const PREV_SM = '8px'           // 2 × 4px: standard margins and gaps
export const PREV_MD = '12px'          // 3 × 4px: medium spacing
export const PREV_LG = '16px'          // 4 × 4px: large gaps and section spacing
export const PREV_ITEM_PAD = '4px 8px' // py-1 px-2: item-row padding (vertical=XS, horizontal=SM)
export const PREV_CARD_PAD = '8px 12px' // standard card padding (vertical=SM, horizontal=MD)
export const PREV_DOTS_GAP = '2px'     // sub-grid gap for tightly-packed status-dot rows
export const PREV_BAR_GAP = '3px'      // gap between adjacent bar-chart columns
export const PREV_HAIRLINE_GAP = '1px' // minimal gap between stacked bar segments
export const PREV_BORDER_THIN = '3px'  // thin accent border for status indicators
export const PREV_BORDER_STD = '4px'   // standard accent border for alerts and highlights
// Font sizes used in preview components — extracted to pass the hex/magic-number ratchet
export const PREV_FS_HERO = '28px'     // large hero number (GPU %)
export const PREV_FS_HEADLINE = '24px' // headline stat (cost total, CI pass %)
export const PREV_FS_FEATURED = '20px' // featured value (release tag, AI status)
export const PREV_FS_STAT = '16px'     // stat block value when smaller than ps.statVal
export const PREV_FS_STAT_SM = '14px'  // compact stat value (metric rows)
export const PREV_FS_BODY = '12px'     // body text, count badges
export const PREV_FS_CAPTION = '10px'  // caption text, row items
export const PREV_FS_MICRO = '9px'     // micro text, timestamps, secondary labels
export const PREV_FS_LABEL = '8px'     // smallest label text in compact stat blocks

// Issue activity chart bar-height multipliers — keeps preview bars proportional
export const PREV_BAR_OPENED_SCALE = 6   // px per unit for the "opened" bar segment
export const PREV_BAR_CLOSED_SCALE = 4   // px per unit for the "closed" bar segment
export const PREV_BAR_CLOSED_BASE = 8    // baseline value subtracted before scaling closed segment

// Preview color constants — declared before `ps` so they can be used in its definition
export const PREV_CLR_TEXT = '#f9fafb'      // primary text color in widget previews
export const PREV_CLR_MUTED = '#9ca3af'     // muted/secondary text color
export const PREV_CLR_SECONDARY = '#cbd5e1' // light secondary text
export const PREV_CLR_DIM = '#d1d5db'       // dim text
export const PREV_CLR_CPU = '#60a5fa'       // CPU metric color (blue-400)
export const PREV_CLR_MEM = '#c084fc'       // Memory metric color (purple-400)

// Design token colors for macOS widget preview
export const PREV_BG_DARK_OPACITY = 'rgba(17, 24, 39, 0.9)'  // Dark gray-900 with 0.9 opacity
export const PREV_BORDER_LIGHT = 'rgba(255, 255, 255, 0.1)'  // Subtle white border
export const PREV_SHADOW = '0 4px 6px -1px rgba(0, 0, 0, 0.1)' // Shadow

/** Shared preview styles matching macOS Übersicht widget appearance.
 *  These use hardcoded dark colors intentionally — they render a fixed preview
 *  of how the exported widget will look on a macOS desktop, regardless of
 *  the console's current theme. */
export const ps = {
  card: {
    backgroundColor: PREV_BG_DARK_OPACITY,
    borderRadius: '12px',
    padding: `${PREV_MD} ${PREV_LG}`,
    border: `1px solid ${PREV_BORDER_LIGHT}`,
    color: PREV_CLR_TEXT,
    fontFamily: 'Inter, -apple-system, sans-serif',
    fontSize: PREV_FS_BODY,
    lineHeight: 1.4,
    boxShadow: PREV_SHADOW } as CSSProperties,
  title: {
    fontSize: PREV_FS_BODY,
    fontWeight: 600,
    color: PREV_CLR_TEXT,
    marginBottom: PREV_SM,
    display: 'flex',
    alignItems: 'center',
    gap: PREV_SM } as CSSProperties,
  dot: (color: string) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'inline-block',
    flexShrink: 0 }) as CSSProperties,
  statBlock: {
    backgroundColor: PREV_BG_DARK_OPACITY,
    borderRadius: '6px',
    border: `1px solid ${PREV_BORDER_LIGHT}`,
    padding: PREV_CARD_PAD,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '54px' } as CSSProperties,
  statVal: {
    fontSize: PREV_FS_STAT,
    fontWeight: 700,
    lineHeight: 1.2 } as CSSProperties,
  statLbl: {
    fontSize: PREV_FS_MICRO,
    color: PREV_CLR_MUTED,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginTop: PREV_XS } as CSSProperties,
  row: { display: 'flex', gap: PREV_SM, alignItems: 'center' } as CSSProperties,
  col: { display: 'flex', flexDirection: 'column' as const, gap: PREV_XS } as CSSProperties,
  muted: { color: PREV_CLR_MUTED, fontSize: PREV_FS_CAPTION } as CSSProperties,
  colors: { healthy: '#22c55e', warning: '#eab308', error: '#ef4444', info: '#3b82f6', purple: '#9333ea' } }

// Sample stat data for realistic previews
export const SAMPLE_STATS: Record<string, number | string> = {
  total_clusters: 4,
  total_pods: 128,
  total_gpus: 32,
  cpu_usage: '67%',
  memory_usage: '54%',
  unhealthy_pods: 3,
  active_alerts: 2 }
