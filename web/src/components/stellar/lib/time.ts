const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_YEAR = 365
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR
const MINUTES_PER_BATCH = 60

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

export function getNextBatchCountdown(now = new Date()): string {
  const nextBatch = new Date(now)
  nextBatch.setMinutes(0, 0, 0)
  if (nextBatch.getTime() <= now.getTime()) {
    nextBatch.setHours(nextBatch.getHours() + 1)
  }

  const minutesRemaining = Math.ceil((nextBatch.getTime() - now.getTime()) / MS_PER_MINUTE)
  return `${Math.min(MINUTES_PER_BATCH, Math.max(1, minutesRemaining))}m`
}
