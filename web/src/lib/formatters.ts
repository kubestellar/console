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

/** Options for {@link formatBytes}. */
export interface FormatBytesOptions {
  /** Number of decimal places (default: 1). */
  decimals?: number
  /** Use IEC binary units — KiB, MiB, GiB, TiB, PiB (default: false → KB, MB, …). */
  binary?: boolean
  /** String returned when the input is zero, negative, or non-finite (default: `'0 B'`). */
  zeroLabel?: string
}

const SI_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
const BYTES_PER_KIBIBYTE = 1024

/**
 * Format bytes to a human-readable string.
 *
 * @example
 * formatBytes(1536)                       // "1.5 KB"
 * formatBytes(1536, { binary: true })     // "1.5 KiB"
 * formatBytes(0, { zeroLabel: '—' })      // "—"
 */
export function formatBytes(
  bytes: number,
  optsOrDecimals: FormatBytesOptions | number = {},
): string {
  // Backward-compatible: accept a plain number as the decimals shorthand.
  const opts: FormatBytesOptions =
    typeof optsOrDecimals === 'number'
      ? { decimals: optsOrDecimals }
      : optsOrDecimals

  const { decimals = 1, binary = false, zeroLabel = '0 B' } = opts

  if (!Number.isFinite(bytes) || bytes <= 0) return zeroLabel

  const units = binary ? IEC_UNITS : SI_UNITS
  const i = Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KIBIBYTE))
  const value = bytes / Math.pow(BYTES_PER_KIBIBYTE, i)

  // Use 0 decimals for whole numbers, otherwise use specified decimals
  if (value === Math.floor(value)) {
    return `${value} ${units[i]}`
  }
  return `${value.toFixed(decimals)} ${units[i]}`
}

// ---------------------------------------------------------------------------
// Numeric formatters
// ---------------------------------------------------------------------------

const THOUSAND = 1_000
const MILLION = 1_000_000
const BILLION = 1_000_000_000

/**
 * Compact-format a large number: 1 234 → "1.2K", 5 600 000 → "5.6M".
 * Returns the raw number as a string when it is below 1 000.
 */
export function formatStatNumber(value: number): string {
  if (Math.abs(value) >= BILLION) return `${(value / BILLION).toFixed(1)}B`
  if (Math.abs(value) >= MILLION) return `${(value / MILLION).toFixed(1)}M`
  if (Math.abs(value) >= THOUSAND) return `${(value / THOUSAND).toFixed(1)}K`
  return value.toString()
}

/** Round a ratio / percentage and append `%`. */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

/**
 * Format a monetary value with a `$` prefix.
 * Large amounts are compacted: $1.2K, $5.6M.
 */
export function formatCurrency(value: number): string {
  if (value >= MILLION) return `$${(value / MILLION).toFixed(1)}M`
  if (value >= THOUSAND) return `$${(value / THOUSAND).toFixed(1)}K`
  return `$${value.toFixed(2)}`
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
const MS_PER_MONTH = 30 * MS_PER_DAY
const MS_PER_YEAR = 365 * MS_PER_DAY

function toTimestamp(input: string | Date | number): number {
  if (typeof input === 'number') return input
  if (input instanceof Date) return input.getTime()
  return new Date(input).getTime()
}

export interface FormatTimeAgoOptions {
  /** Omit the " ago" suffix (e.g. "5m" instead of "5m ago"). */
  compact?: boolean
  /** Include month/year ranges for older timestamps (default: false — stops at days). */
  extended?: boolean
  /** Label returned when the input is invalid/NaN (default: "just now"). */
  invalidLabel?: string
}

/**
 * Format a timestamp as relative time (e.g., "just now", "5m ago", "3h ago", "2d ago").
 * Accepts an ISO string, Date object, or epoch millisecond number.
 */
export function formatTimeAgo(input: string | Date | number, opts: FormatTimeAgoOptions = {}): string {
  const { compact = false, extended = false, invalidLabel = 'just now' } = opts
  const suffix = compact ? '' : ' ago'

  const ts = toTimestamp(input)
  const diff = Date.now() - ts
  if (isNaN(diff) || diff < 0) return compact ? 'now' : invalidLabel

  if (diff < MS_PER_MINUTE) return compact ? 'now' : 'just now'
  if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m${suffix}`
  if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h${suffix}`

  if (extended) {
    if (diff < MS_PER_MONTH) return `${Math.floor(diff / MS_PER_DAY)}d${suffix}`
    if (diff < MS_PER_YEAR) return `${Math.floor(diff / MS_PER_MONTH)}mo${suffix}`
    return `${Math.floor(diff / MS_PER_YEAR)}y${suffix}`
  }

  return `${Math.floor(diff / MS_PER_DAY)}d${suffix}`
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
