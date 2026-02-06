/**
 * Chart color utilities for accessing CSS custom properties
 * 
 * These functions provide access to the chart color design tokens
 * defined in index.css. Use these instead of hardcoded hex values
 * to ensure consistency with the theme system.
 */

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
    1: '#9333ea', // purple
    2: '#3b82f6', // blue
    3: '#10b981', // green
    4: '#f59e0b', // amber/warning
    5: '#ef4444', // red
    6: '#06b6d4', // cyan
    7: '#8b5cf6', // violet
    8: '#14b8a6', // teal
  }
  
  return fallbacks[colorIndex] || fallbacks[1]
}

/**
 * Get multiple chart colors as an array
 */
export function getChartColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => getChartColor(i + 1))
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
