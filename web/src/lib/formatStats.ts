/**
 * Utility functions for formatting stats display
 * - Never shows negative numbers
 * - Shows '-' when data is unavailable (undefined, null, or explicitly marked unavailable)
 */

const GIGABYTES_PER_TERABYTE = 1024
const TERABYTES_PER_PETABYTE = 1024
const MEMORY_PROMPT_DECIMAL_PLACES = 2

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
 * Format memory size for display
 * @param gb - Size in gigabytes
 * @param hasData - Whether we have valid data
 */
export function formatMemoryStat(gb: number | undefined | null, hasData = true): string {
  if (!hasData || gb === undefined || gb === null) {
    return '-'
  }

  const safeValue = Math.max(0, gb)
  const gigabytesPerPetabyte = GIGABYTES_PER_TERABYTE * TERABYTES_PER_PETABYTE

  if (safeValue >= gigabytesPerPetabyte) {
    return `${(safeValue / gigabytesPerPetabyte).toFixed(1)} PB`
  }
  if (safeValue >= GIGABYTES_PER_TERABYTE) {
    return `${(safeValue / GIGABYTES_PER_TERABYTE).toFixed(1)} TB`
  }
  if (safeValue >= 1) {
    return `${Math.round(safeValue)} GB`
  }
  if (safeValue >= 0.001) {
    return `${Math.round(safeValue * GIGABYTES_PER_TERABYTE)} MB`
  }
  return '0 GB'
}

function trimTrailingZeroes(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

/**
 * Format memory size for prompts with readable precision.
 * @param gb - Size in gigabytes
 */
export function formatMemoryPromptStat(gb: number | undefined | null): string {
  if (gb === undefined || gb === null) {
    return '0 GB'
  }

  const safeValue = Math.max(0, gb)
  const gigabytesPerPetabyte = GIGABYTES_PER_TERABYTE * TERABYTES_PER_PETABYTE

  if (safeValue >= gigabytesPerPetabyte) {
    return `${(safeValue / gigabytesPerPetabyte).toFixed(1)} PB`
  }
  if (safeValue >= GIGABYTES_PER_TERABYTE) {
    return `${(safeValue / GIGABYTES_PER_TERABYTE).toFixed(1)} TB`
  }
  if (safeValue >= 1) {
    return `${trimTrailingZeroes(safeValue.toFixed(MEMORY_PROMPT_DECIMAL_PLACES))} GB`
  }
  if (safeValue >= 0.001) {
    return `${Math.round(safeValue * GIGABYTES_PER_TERABYTE)} MB`
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

