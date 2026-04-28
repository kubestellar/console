/**
 * Utility functions for formatting values for display
 */

import { MS_PER_SECOND, MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY, MS_PER_MONTH, MS_PER_YEAR, SECONDS_PER_MINUTE, MINUTES_PER_HOUR } from './constants/time'

/**
 * Format the elapsed time between two ISO timestamps as a compact string.
 * Used by ProwJob listings to display run duration.
 */
export function formatProwDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime)
  const end = endTime ? new Date(endTime) : new Date()
  const diffMs = end.getTime() - start.getTime()

  if (diffMs < 0) return '-'

  const seconds = Math.floor(diffMs / MS_PER_SECOND)
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)

  if (hours > 0) return `${hours}h ${minutes % MINUTES_PER_HOUR}m`
  if (minutes > 0) return `${minutes}m`
  return `${seconds}s`
}

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
interface FormatBytesOptions {
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

function toTimestamp(input: string | Date | number): number {
  if (typeof input === 'number') return input
  if (input instanceof Date) return input.getTime()
  return new Date(input).getTime()
}

interface FormatTimeAgoOptions {
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

interface CardSyncKeys {
  justNow: string
  minutesAgo: string
  hoursAgo: string
  daysAgo: string
}

/**
 * Build the standard `synced*` i18n key set for a card prefix.
 *
 * Most status cards use `<prefix>.syncedJustNow`, etc.  Pass a custom
 * {@link CardSyncKeys} object for cards that deviate (e.g. Thanos uses
 * `thanosStatus.justNow` without the `synced` prefix).
 */
function cardSyncKeys(prefix: string): CardSyncKeys {
  return {
    justNow: `${prefix}.syncedJustNow`,
    minutesAgo: `${prefix}.syncedMinutesAgo`,
    hoursAgo: `${prefix}.syncedHoursAgo`,
    daysAgo: `${prefix}.syncedDaysAgo`,
  }
}

/**
 * Create a card-specific i18n-aware relative time formatter.
 *
 * Accepts either a card prefix (uses the standard `synced*` key convention)
 * or an explicit {@link CardSyncKeys} object for non-standard cards.
 */
export function createCardSyncFormatter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any, options?: any) => string,
  keys: string | CardSyncKeys,
): (isoString: string) => string {
  const k = typeof keys === 'string' ? cardSyncKeys(keys) : keys

  return (isoString: string): string => {
    const parsed = new Date(isoString).getTime()
    if (!isoString || isNaN(parsed)) return t(k.justNow)

    const diff = Date.now() - parsed
    if (diff < 0) return t(k.justNow)

    if (diff < MS_PER_MINUTE) return t(k.justNow)
    if (diff < MS_PER_HOUR) return t(k.minutesAgo, { count: Math.floor(diff / MS_PER_MINUTE) })
    if (diff < MS_PER_DAY) return t(k.hoursAgo, { count: Math.floor(diff / MS_PER_HOUR) })
    return t(k.daysAgo, { count: Math.floor(diff / MS_PER_DAY) })
  }
}
