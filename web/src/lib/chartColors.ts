/**
 * Chart color utilities for accessing CSS custom properties
 *
 * These functions provide access to the chart color design tokens
 * defined in index.css. Use these instead of hardcoded hex values
 * to ensure consistency with the theme system.
 */

/** Chart fallback colors — used when CSS custom properties are unavailable */
const CHART_PURPLE = '#9333ea'  // chart-color-1: primary accent
const CHART_BLUE = '#3b82f6'    // chart-color-2: info / secondary
const CHART_GREEN = '#10b981'   // chart-color-3: success
const CHART_AMBER = '#f59e0b'   // chart-color-4: warning
const CHART_RED = '#ef4444'     // chart-color-5: error / danger
const CHART_CYAN = '#06b6d4'    // chart-color-6: supplementary
const CHART_VIOLET = '#8b5cf6'  // chart-color-7: alt purple
const CHART_TEAL = '#14b8a6'    // chart-color-8: alt green

/**
 * Get a chart color by index (1-8)
 * Falls back to computed CSS variable value or hardcoded value
 */
export function getChartColor(index: number): string {
  // Ensure index is between 1-8
  const colorIndex = ((index - 1) % 8) + 1
  
  // Try to get from CSS variable
  if (typeof window !== 'undefined' && typeof getComputedStyle !== 'undefined') {
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(`--chart-color-${colorIndex}`)
      .trim()
    
    if (color) {
      return color
    }
  }
  
  // Fallback to default values matching index.css
  const fallbacks: Record<number, string> = {
    1: CHART_PURPLE,
    2: CHART_BLUE,
    3: CHART_GREEN,
    4: CHART_AMBER,
    5: CHART_RED,
    6: CHART_CYAN,
    7: CHART_VIOLET,
    8: CHART_TEAL,
  }
  
  return fallbacks[colorIndex] || fallbacks[1]
}

/**
 * Get a chart color by index (1-8) as an `rgba()` string with the given alpha.
 *
 * ECharts gradient `colorStops` need a color with an alpha channel, which the
 * `--chart-color-*` tokens don't carry. This resolves the token and applies the
 * alpha so gradients stay in sync with the theme instead of duplicating literal
 * `rgba(...)` values in components.
 */
export function getChartColorRgba(index: number, alpha: number): string {
  const color = getChartColor(index)
  const hex = color.replace('#', '')
  const expanded = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return color
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Get chart color by semantic name
 */
export function getChartColorByName(name: 'warning' | 'success' | 'error' | 'info' | 'primary'): string {
  const colorMap: Record<string, number> = {
    'primary': 1,   // purple
    'info': 2,      // blue
    'success': 3,   // green
    'warning': 4,   // amber
    'error': 5,     // red
  }
  
  return getChartColor(colorMap[name] || 1)
}
