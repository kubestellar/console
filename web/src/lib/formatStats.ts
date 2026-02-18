/**
 * Utility functions for formatting stats display
 * - Never shows negative numbers
 * - Shows '-' when data is unavailable (undefined, null, or explicitly marked unavailable)
 */

/**
 * Format a numeric stat for display
 * @param value - The numeric value to display
 * @param options - Formatting options
 * @returns Formatted string for display
 */
export function formatStat(
  value: number | undefined | null,
  options?: {
    /** Show '-' when value is 0 (default: false) */
    dashOnZero?: boolean
    /** Custom formatter function */
    formatter?: (n: number) => string
    /** Suffix to append (e.g., '%', ' GB') */
    suffix?: string
  }
): string {
  const { dashOnZero = false, formatter, suffix = '' } = options || {}

  // Handle unavailable data
  if (value === undefined || value === null) {
    return '-'
  }

  // Handle zero with optional dash
  if (value === 0 && dashOnZero) {
    return '-'
  }

  // Never show negative numbers - clamp to 0
  const safeValue = Math.max(0, value)

  // Apply custom formatter or auto-scale large numbers to fit stat blocks
  let formatted: string
  if (formatter) {
    formatted = formatter(safeValue)
  } else if (safeValue >= 1_000_000) {
    formatted = `${(safeValue / 1_000_000).toFixed(1)}M`
  } else if (safeValue >= 10_000) {
    formatted = `${(safeValue / 1000).toFixed(1)}K`
  } else {
    formatted = String(safeValue)
  }

  return formatted + suffix
}

/**
 * Format a stat only if data is available (clusters are reachable)
 * @param value - The numeric value
 * @param hasData - Whether we have valid data (e.g., clusters are reachable)
 * @param options - Formatting options
 */
export function formatStatIfAvailable(
  value: number | undefined | null,
  hasData: boolean,
  options?: {
    formatter?: (n: number) => string
    suffix?: string
  }
): string {
  if (!hasData) {
    return '-'
  }
  return formatStat(value, options)
}

/**
 * Format memory size for display
 * @param gb - Size in gigabytes
 * @param hasData - Whether we have valid data
 */
export function formatMemoryStat(gb: number | undefined | null, hasData = true): string {
  if (!hasData || gb === undefined || gb === null) {
    return '-'
  }

  const safeValue = Math.max(0, gb)

  if (safeValue >= 1024 * 1024) {
    return `${(safeValue / (1024 * 1024)).toFixed(1)} PB`
  }
  if (safeValue >= 1024) {
    return `${(safeValue / 1024).toFixed(1)} TB`
  }
  if (safeValue >= 1) {
    return `${Math.round(safeValue)} GB`
  }
  if (safeValue >= 0.001) {
    return `${Math.round(safeValue * 1024)} MB`
  }
  return '0 GB'
}

/**
 * Format storage size for display
 * @param gb - Size in gigabytes
 * @param hasData - Whether we have valid data
 */
export function formatStorageStat(gb: number | undefined | null, hasData = true): string {
  return formatMemoryStat(gb, hasData)
}

/**
 * Format percentage for display
 * @param value - Percentage value (0-100)
 * @param hasData - Whether we have valid data
 */
export function formatPercentStat(value: number | undefined | null, hasData = true): string {
  if (!hasData || value === undefined || value === null) {
    return '-'
  }

  // Clamp between 0 and 100
  const safeValue = Math.max(0, Math.min(100, value))
  return `${safeValue.toFixed(0)}%`
}
