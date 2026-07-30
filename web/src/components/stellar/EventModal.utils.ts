import type { StellarNotification, StellarSolve } from '../../types/stellar'

export const RELATED_EVENT_LIMIT = 6
export const TIMELINE_ENTRY_LIMIT = 8
export const INVESTIGATION_ACTIVITY_LIMIT = 6
export const INVESTIGATION_TEXTAREA_ROWS = 3
export const CONFIRMATION_TEXTAREA_ROWS = 4

export interface TimelineEntry {
  ts: string
  label: string
  detail: string
}

export function severityColor(severity: string): string {
  if (severity === 'critical') return 'var(--s-critical)'
  if (severity === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

export function statusLabel(status?: string): string {
  switch (status) {
    case 'investigating':
      return 'Investigating'
    case 'resolved':
      return 'Resolved'
    case 'dismissed':
      return 'Removed'
    case 'exhausted':
      return 'Paused'
    case 'open':
      return 'Open'
    case 'escalated':
    default:
      return 'Escalated'
  }
}

export function extractResourceName(notification: StellarNotification): string {
  if (!notification.dedupeKey) return ''
  const parts = notification.dedupeKey.split(':')
  const offset = parts[0] === 'ev' ? 1 : 0
  if (parts.length >= offset + 3) {
    return parts[offset + 2]
  }
  return ''
}

export function formatAbsoluteUtc(value?: string): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC'
}

export function formatRelative(value?: string): string {
  if (!value) return 'just now'
  const ms = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function buildInvestigatePrompt(notification: StellarNotification): string {
  const cluster = notification.cluster ? ` on cluster ${notification.cluster}` : ''
  const namespace = notification.namespace ? ` in namespace ${notification.namespace}` : ''
  return `Investigate ${notification.title}${cluster}${namespace}. Pull logs, related events, retry history, and summarize the likely root cause.`
}

export function matchesSolve(notification: StellarNotification, solve: StellarSolve): boolean {
  if ((notification.cluster || '') !== solve.cluster) return false
  if ((notification.namespace || '') !== solve.namespace) return false
  const resourceName = extractResourceName(notification)
  if (!resourceName) return notification.id === solve.eventId
  return resourceName.startsWith(solve.workload) || solve.workload === resourceName
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response
    if (response?.data?.error) return response.data.error
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}
