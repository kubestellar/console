const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_YEAR = 365
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR

export const STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
export const STELLAR_BATCH_INTERVAL_THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
export const STELLAR_BATCH_INTERVAL_ONE_HOUR_MS = MS_PER_HOUR
export const STELLAR_BATCH_INTERVAL_TWO_HOURS_MS = 2 * MS_PER_HOUR
export const STELLAR_BATCH_INTERVAL_FOUR_HOURS_MS = 4 * MS_PER_HOUR
export const STELLAR_BATCH_INTERVAL_EIGHT_HOURS_MS = 8 * MS_PER_HOUR
export const STELLAR_DEFAULT_BATCH_INTERVAL_MS = STELLAR_BATCH_INTERVAL_ONE_HOUR_MS

export const STELLAR_BATCH_INTERVAL_OPTIONS = [
  { value: STELLAR_BATCH_INTERVAL_FIFTEEN_MINUTES_MS, labelKey: 'stellar.header.batchIntervals.fifteenMinutes' },
  { value: STELLAR_BATCH_INTERVAL_THIRTY_MINUTES_MS, labelKey: 'stellar.header.batchIntervals.thirtyMinutes' },
  { value: STELLAR_BATCH_INTERVAL_ONE_HOUR_MS, labelKey: 'stellar.header.batchIntervals.oneHour' },
  { value: STELLAR_BATCH_INTERVAL_TWO_HOURS_MS, labelKey: 'stellar.header.batchIntervals.twoHours' },
  { value: STELLAR_BATCH_INTERVAL_FOUR_HOURS_MS, labelKey: 'stellar.header.batchIntervals.fourHours' },
  { value: STELLAR_BATCH_INTERVAL_EIGHT_HOURS_MS, labelKey: 'stellar.header.batchIntervals.eightHours' },
] as const

export function formatRelativeTime(isoDate: string): string {
  const eventMs = new Date(isoDate).getTime()
  if (Number.isNaN(eventMs)) return ''

  const ageMs = Math.max(0, Date.now() - eventMs)
  if (ageMs < MS_PER_MINUTE) return 'just now'

  const ageMinutes = Math.floor(ageMs / MS_PER_MINUTE)
  if (ageMinutes < MINUTES_PER_HOUR) return `${ageMinutes}m ago`

  const ageHours = Math.floor(ageMs / MS_PER_HOUR)
  if (ageHours < HOURS_PER_DAY) return `${ageHours}h ago`

  const ageDays = Math.floor(ageMs / MS_PER_DAY)
  if (ageDays < DAYS_PER_YEAR) return `${ageDays}d ago`

  return `${Math.floor(ageDays / DAYS_PER_YEAR)}y ago`
}

export function resolveStellarBatchIntervalMs(value: number | string | null | undefined): number {
  const parsedValue = typeof value === 'number' ? value : Number(value)
  return STELLAR_BATCH_INTERVAL_OPTIONS.some(option => option.value === parsedValue)
    ? parsedValue
    : STELLAR_DEFAULT_BATCH_INTERVAL_MS
}

export function getNextBatchTime(intervalMs: number, fromMs = Date.now()): number {
  return fromMs + resolveStellarBatchIntervalMs(intervalMs)
}

export function getNextBatchCountdown(nextBatchAtMs: number, nowMs = Date.now()): string {
  const remainingMs = Math.max(0, nextBatchAtMs - nowMs)
  if (remainingMs < MS_PER_MINUTE) {
    return `${Math.max(1, Math.ceil(remainingMs / MS_PER_SECOND))}s`
  }

  const hoursRemaining = Math.floor(remainingMs / MS_PER_HOUR)
  const minutesRemaining = Math.ceil((remainingMs % MS_PER_HOUR) / MS_PER_MINUTE)

  if (hoursRemaining > 0) {
    return minutesRemaining > 0 ? `${hoursRemaining}h ${minutesRemaining}m` : `${hoursRemaining}h`
  }

  return `${Math.max(1, Math.ceil(remainingMs / MS_PER_MINUTE))}m`
}
