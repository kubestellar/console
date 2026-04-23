/**
 * Utility functions for formatting values for display
 */

/**
 * Parse Kubernetes resource quantity strings (e.g., "16077540Ki", "4Gi", "500Mi")
 * and convert to bytes
 */
function parseK8sQuantity(value: string): number {
  if (!value) return 0

  const match = value.match(/^(\d+(?:\.\d+)?)\s*([KMGTPE]i?)?$/i)
  if (!match) return parseInt(value, 10) || 0

  const num = parseFloat(match[1])
  const unit = (match[2] || '').toLowerCase()

  // Binary units (Ki, Mi, Gi, Ti, Pi, Ei)
  const binaryMultipliers: Record<string, number> = {
    '': 1,
    'ki': 1024,
    'mi': 1024 ** 2,
    'gi': 1024 ** 3,
    'ti': 1024 ** 4,
    'pi': 1024 ** 5,
    'ei': 1024 ** 6,
  }

  // Decimal units (K, M, G, T, P, E)
  const decimalMultipliers: Record<string, number> = {
    'k': 1000,
    'm': 1000 ** 2,
    'g': 1000 ** 3,
    't': 1000 ** 4,
    'p': 1000 ** 5,
    'e': 1000 ** 6,
  }

  if (unit in binaryMultipliers) {
    return num * binaryMultipliers[unit]
  }
  if (unit in decimalMultipliers) {
    return num * decimalMultipliers[unit]
  }

  return num
}

/**
 * Format bytes to human-readable string (GB, TB, MB, etc.)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  const value = bytes / Math.pow(k, i)

  // Use 0 decimals for whole numbers, otherwise use specified decimals
  if (value === Math.floor(value)) {
    return `${value} ${sizes[i]}`
  }
  return `${value.toFixed(decimals)} ${sizes[i]}`
}

/**
 * Format a value already in GB to a smart string, auto-converting to TB when large.
 * Returns { display, tooltip } so callers can show the short form and hover for detail.
 */
export function formatGBSmart(gb: number, decimals = 1): { display: string; tooltip: string } {
  if (!Number.isFinite(gb) || gb <= 0) return { display: '0 GB', tooltip: '0 GB' }
  if (gb >= 1024) {
    const tb = gb / 1024
    return {
      display: `${tb.toFixed(decimals)} TB`,
      tooltip: `${Math.round(gb).toLocaleString()} GB`,
    }
  }
  const rounded = gb >= 10 ? Math.round(gb) : Number(gb.toFixed(decimals))
  return { display: `${rounded} GB`, tooltip: `${gb.toFixed(2)} GB` }
}

/**
 * Format Kubernetes resource quantity (e.g., "16077540Ki") to human-readable string
 */
export function formatK8sMemory(value: string): string {
  if (!value) return '-'
  const bytes = parseK8sQuantity(value)
  return formatBytes(bytes)
}

/**
 * Format Kubernetes storage quantity to human-readable string
 */
export function formatK8sStorage(value: string): string {
  if (!value) return '-'
  const bytes = parseK8sQuantity(value)
  return formatBytes(bytes)
}

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

function toTimestamp(input: string | Date | number): number {
  if (typeof input === 'number') return input
  if (input instanceof Date) return input.getTime()
  return new Date(input).getTime()
}

/**
 * Format a timestamp as relative time (e.g., "just now", "5m ago", "3h ago", "2d ago").
 * Accepts an ISO string, Date object, or epoch millisecond number.
 */
export function formatTimeAgo(input: string | Date | number): string {
  const diff = Date.now() - toTimestamp(input)
  if (isNaN(diff) || diff < 0) return 'just now'

  if (diff < MS_PER_MINUTE) return 'just now'
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m ago`
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h ago`
  return `${Math.floor(diff / MS_PER_DAY)}d ago`
}

/** @deprecated Use {@link formatTimeAgo} instead. */
export const formatRelativeTime = formatTimeAgo

/**
 * Create an i18n-aware relative time formatter
 * Use this in components that need translated time strings
 * 
 * @example
 * const formatTime = createRelativeTimeFormatter(t)
 * formatTime(someISOString) // "2 minutes ago" or localized equivalent
 */
export function createRelativeTimeFormatter(
  t: (key: string, options?: { count?: number }) => string
): (isoString: string) => string {
  return (isoString: string): string => {
    const diff = Date.now() - new Date(isoString).getTime()
    if (isNaN(diff) || diff < 0) return t('common.justNow')
    
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour
    
    if (diff < minute) return t('common.justNow')
    if (diff < hour) return t('common.minutesAgo', { count: Math.floor(diff / minute) })
    if (diff < day) return t('common.hoursAgo', { count: Math.floor(diff / hour) })
    return t('common.daysAgo', { count: Math.floor(diff / day) })
  }
}
