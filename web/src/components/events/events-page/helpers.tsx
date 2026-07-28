import type { ClusterEvent } from '../../../hooks/mcp/types'
import type { TranslateFn } from './types'

// Event-related constants
export const EVENT_LIMIT = 100 // Maximum number of events to fetch
export const HOURS_IN_DAY = 24 // Number of hours to display in timeline
export const MAX_PREVIEW_EVENTS = 10 // Maximum events shown in preview before "View more"
export const MAX_RECENT_WARNINGS_PREVIEW = 5 // Max recent warnings shown on overview
export const MILLISECONDS_PER_MINUTE = 60 * 1000 // Milliseconds in a minute
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE // Milliseconds in an hour
export const MAX_TOP_REASONS = 6 // Top reasons shown in donut chart
export const DONUT_COLOR_BUCKETS = 6 // Number of palette slots for charts
export const DONUT_SIZE = 150 // Donut chart diameter in px
export const DONUT_THICKNESS = 20 // Donut ring thickness in px
export const DONUT_EMPTY_HEIGHT = 150 // Empty-state placeholder height in px
export const BAR_CHART_HEIGHT = 200 // Bar chart height in px
// Threshold for treating a cached hook as "failed" so we can render an
// explicit error state with a retry button instead of an indefinite spinner.
export const EVENTS_FAILURE_THRESHOLD = 1

export const EVENTS_CARDS_KEY = 'kubestellar-events-cards'

export function getTimeAgo(timestamp: string | undefined, t: TranslateFn): string {
  if (!timestamp) return t('events.timeAgo.unknown')
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / MILLISECONDS_PER_MINUTE)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / HOURS_IN_DAY)
  if (diffDays > 0) return t('events.timeAgo.days', { count: diffDays })
  if (diffHours > 0) return t('events.timeAgo.hours', { count: diffHours })
  if (diffMins > 0) return t('events.timeAgo.minutes', { count: diffMins })
  return t('events.timeAgo.justNow')
}

export function getEventIcon(type: string, reason: string): React.ReactNode {
  if (type === 'Warning') {
    return <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  }
  if (reason === 'Scheduled' || reason === 'Created') {
    return <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
  }
  if (reason === 'Started' || reason === 'Pulled') {
    return <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  }
  if (reason === 'Killing' || reason === 'Deleted') {
    return <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
  }
  return <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}

export function getEventSeverity(eventType: string): 'high' | 'info' {
  return eventType === 'Warning' ? 'high' : 'info'
}

export function matchesEventQuery(event: ClusterEvent, query: string): boolean {
  const searchableFields = [event.reason, event.message, event.object, event.namespace, event.cluster || '']
  return searchableFields.some(value => (value || '').toLowerCase().includes(query))
}

// Helper: parse an event's timestamp as a Date, or return null for missing/invalid.
// Events without a valid lastSeen should never be falsely bucketed as recent (bug #9039).
export function parseEventTime(ts: string | undefined): Date | null {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d
}
