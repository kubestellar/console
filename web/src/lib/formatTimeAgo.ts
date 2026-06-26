/**
 * Format a timestamp as a relative time string (e.g., "2m ago", "just now").
 * Used for freshness indicators showing when cached data was last updated.
 *
 * @param date - ISO string or Date object to format
 * @returns Human-readable relative time string
 */
export function formatTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return ''
  
  const now = new Date()
  const then = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
