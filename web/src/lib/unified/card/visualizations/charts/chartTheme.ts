/**
 * chartTheme - Shared color palette, theme constants, axis normalization,
 * and shared prop types for per-chart-type renderers under charts/.
 *
 * Extracted from ChartVisualization.tsx so each chart renderer module can
 * import only what it needs.
 */

import { CHART_TOOLTIP_CONTENT_STYLE_GRAY } from '../../../../constants'
import type { CardAxisConfig, CardChartSeries } from '../../../types'

// Default color palette for series
export const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
]

// ECharts does not consistently resolve the app's CSS custom properties, so keep
// these contrast-safe fallbacks centralized until token-aware colors are supported.
export const CHART_THEME_COLORS = {
  axisLabel: '#9ca3af',
  axisLine: '#4b5563',
  axisTick: '#4b5563',
  gridLine: '#374151',
  legendText: '#e5e7eb',
  tooltipText: '#e5e7eb',
  gaugeCritical: '#ef4444',
  gaugeWarning: '#f59e0b',
  gaugeHealthy: '#22c55e',
  gaugeRemaining: '#374151',
} as const

/** Extract tooltip style from the GRAY constant */
export const TOOLTIP_BG = (CHART_TOOLTIP_CONTENT_STYLE_GRAY as Record<string, unknown>).backgroundColor as string
export const TOOLTIP_BORDER = (CHART_TOOLTIP_CONTENT_STYLE_GRAY as Record<string, unknown>).borderColor as string

export interface ChartRendererProps {
  data: unknown[]
  series: CardChartSeries[]
  xAxis?: CardAxisConfig | string
  yAxis?: CardAxisConfig | string | string[]
  showLegend?: boolean
  height: number
}

/**
 * Normalize axis config to full CardAxisConfig object
 */
export function normalizeAxisConfig(axis?: CardAxisConfig | string | string[]): CardAxisConfig | undefined {
  if (!axis) return undefined
  if (typeof axis === 'string') {
    return { field: axis }
  }
  if (Array.isArray(axis)) {
    return { field: axis[0] }
  }
  return axis
}
