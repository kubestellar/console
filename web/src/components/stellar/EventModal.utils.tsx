import type { StellarNotification, StellarSolve } from '../../types/stellar'
import type { ReactNode } from 'react'
import { formatAbsoluteUtc } from './EventDetailPanel'

export function severityColor(severity: string): string {
  if (severity === 'critical') return 'var(--s-critical)'
  if (severity === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

export function statusLabel(status?: string): string {
  switch (status) {
    case 'investigating': return 'Investigating'
    case 'resolved': return 'Resolved'
    case 'dismissed': return 'Removed'
    case 'exhausted': return 'Paused'
    case 'open': return 'Open'
    case 'escalated':
    default: return 'Escalated'
  }
}

export function extractResourceName(notification: StellarNotification): string {
  if (!notification.dedupeKey) return ''
  const parts = notification.dedupeKey.split(':')
  const offset = parts[0] === 'ev' ? 1 : 0
  if (parts.length >= offset + 3) return parts[offset + 2]
  return ''
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

export function buildInvestigationCopyText(options: {
  liveNotification: StellarNotification
  affectedResource: string
  rootCause: string
  errorMessage: string
  autoResolutionSummary: { status: string; detail: string }
  pendingActions: import('../../types/stellar').StellarAction[]
  relatedEvents: StellarNotification[]
  relatedActivity: Array<{ id: string; ts: string; title: string; detail?: string; cluster?: string; namespace?: string; workload?: string; eventId?: string }>
  matchingSolves: StellarSolve[]
}): string {
  const { liveNotification, affectedResource, rootCause, errorMessage, autoResolutionSummary, pendingActions, relatedEvents, relatedActivity, matchingSolves } = options
  const pendingApprovalCount = (pendingActions || []).filter(action => action.cluster === liveNotification.cluster && action.namespace === liveNotification.namespace).length
  const sections = [
    `Event ID: ${liveNotification.id}`,
    `Title: ${liveNotification.title}`,
    `Status: ${statusLabel(liveNotification.status)}`,
    `Severity: ${liveNotification.severity}`,
    `Timestamp: ${formatAbsoluteUtc(liveNotification.updatedAt || liveNotification.createdAt)}`,
    `Affected resource: ${affectedResource}`,
    `Root cause: ${rootCause}`,
    `Error message: ${errorMessage}`,
    `Batch window: ${formatAbsoluteUtc(liveNotification.batchTimestamp || liveNotification.createdAt)}`,
    `Auto-resolution: ${autoResolutionSummary.status} — ${autoResolutionSummary.detail}`,
    `Pending approvals: ${pendingApprovalCount}`,
    `Related events: ${(relatedEvents || []).map(item => `${formatAbsoluteUtc(item.createdAt)} — ${item.title}`).join('\n') || 'None'}`,
    `Related activity: ${(relatedActivity || []).map(item => `${formatAbsoluteUtc(item.ts)} — ${item.title}: ${item.detail || ''}`).join('\n') || 'None'}`,
    `Solve attempts: ${(matchingSolves || []).map(item => `${formatAbsoluteUtc(item.startedAt)} — ${item.status}: ${item.summary || item.error || 'No summary'}`).join('\n') || 'None'}`,
    `Raw detail: ${liveNotification.body || 'None'}`,
  ]
  return (sections || []).join('\n\n')
}

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="px-2 py-0.5" style={{
      border: `1px solid ${color}`,
      color,
      borderRadius: 999,
      background: 'var(--s-surface-2)',
    }}>
      {children}
    </span>
  )
}
