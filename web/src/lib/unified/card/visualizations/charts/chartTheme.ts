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

/**
 * Shared grid/xAxis/yAxis/tooltip/legend option shape for the category-axis
 * chart renderers (Area/Line/Bar). Each renderer supplies its own `series`
 * entries, which is the only part of the ECharts option that differs
 * between chart types.
 */
export function buildCategoryAxisChartOption(
  typedData: Record<string, unknown>[],
  xField: string,
  series: CardChartSeries[],
  showLegend: boolean | undefined,
  yAxis: CardAxisConfig | undefined,
) {
  return {
    backgroundColor: 'transparent',
    grid: { left: 50, right: 10, top: 10, bottom: showLegend ? 40 : 25 },
    xAxis: {
      type: 'category' as const,
      data: typedData.map(d => d[xField]),
      axisLabel: { color: CHART_THEME_COLORS.axisLabel, fontSize: 11 },
      axisLine: { lineStyle: { color: CHART_THEME_COLORS.axisLine } },
      axisTick: { lineStyle: { color: CHART_THEME_COLORS.axisTick } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: CHART_THEME_COLORS.axisLabel, fontSize: 11 },
      axisLine: { lineStyle: { color: CHART_THEME_COLORS.axisLine } },
      axisTick: { lineStyle: { color: CHART_THEME_COLORS.axisTick } },
      splitLine: { lineStyle: { color: CHART_THEME_COLORS.gridLine, type: 'dashed' as const } },
      name: yAxis?.label,
      nameTextStyle: { color: CHART_THEME_COLORS.axisLabel },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: TOOLTIP_BG,
      borderColor: TOOLTIP_BORDER,
      textStyle: { color: CHART_THEME_COLORS.tooltipText, fontSize: 12 },
    },
    legend: showLegend ? {
      data: series.map(s => s.label ?? s.field),
      bottom: 0,
      textStyle: { color: CHART_THEME_COLORS.legendText, fontSize: 11 },
    } : undefined,
  }
}
