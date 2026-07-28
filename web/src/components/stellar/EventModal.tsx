import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StellarAction, StellarNotification, StellarSolve } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { useToast } from '../ui/Toast'
import { BaseModal } from '../../lib/modals'
import { copyToClipboard } from '../../lib/clipboard'
import type { PendingAction } from './EventCard'
import { EventDetailPanel } from './EventDetailPanel'
import { ActionButtons } from './ActionButtons'

const TIMELINE_ENTRY_LIMIT = 8
const INVESTIGATION_ACTIVITY_LIMIT = 6

interface EventModalProps {
  notification: StellarNotification
  allNotifications: StellarNotification[]
  pendingActions: StellarAction[]
  solveStatus?: import('./lib/derive').SolveStatus | null
  solves?: StellarSolve[]
  onClose: () => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

type ModalView = 'overview' | 'investigate'
type ConfirmAction = 'resolve' | 'dismiss' | null

interface TimelineEntry {
  ts: string
  label: string
  detail: string
}

function severityColor(severity: string): string {
  if (severity === 'critical') return 'var(--s-critical)'
  if (severity === 'warning') return 'var(--s-warning)'
  return 'var(--s-info)'
}

function statusLabel(status?: string): string {
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

function extractResourceName(notification: StellarNotification): string {
  if (!notification.dedupeKey) return ''
  const parts = notification.dedupeKey.split(':')
  const offset = parts[0] === 'ev' ? 1 : 0
  if (parts.length >= offset + 3) {
    return parts[offset + 2]
  }
  return ''
}

function formatAbsoluteUtc(value?: string): string {
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

function formatRelative(value?: string): string {
  if (!value) return 'just now'
  const ms = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function buildInvestigatePrompt(notification: StellarNotification): string {
  const cluster = notification.cluster ? ` on cluster ${notification.cluster}` : ''
  const namespace = notification.namespace ? ` in namespace ${notification.namespace}` : ''
  return `Investigate ${notification.title}${cluster}${namespace}. Pull logs, related events, retry history, and summarize the likely root cause.`
}

function matchesSolve(notification: StellarNotification, solve: StellarSolve): boolean {
  if ((notification.cluster || '') !== solve.cluster) return false
  if ((notification.namespace || '') !== solve.namespace) return false
  const resourceName = extractResourceName(notification)
  if (!resourceName) return notification.id === solve.eventId
  return resourceName.startsWith(solve.workload) || solve.workload === resourceName
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response
    if (response?.data?.error) return response.data.error
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function EventModal({ notification, allNotifications, pendingActions, solveStatus, solves = [], onClose, onAction }: EventModalProps) {
  const {
    notifications,
    activity,
    investigateNotification,
    dismissNotification,
    startSolve,
  } = useStellar()
  const { showToast } = useToast()

  const liveNotification = useMemo(() => {
    return (notifications || []).find(item => item.id === notification.id) || notification
  }, [notification, notifications])

  const [view, setView] = useState<ModalView>('overview')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [investigationSummary, setInvestigationSummary] = useState(liveNotification.investigationSummary || '')
  const [dismissalReason, setDismissalReason] = useState(liveNotification.dismissalReason || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setView('overview')
    setConfirmAction(null)
    setInvestigationSummary(liveNotification.investigationSummary || '')
    setDismissalReason(liveNotification.dismissalReason || '')
  }, [liveNotification.id, liveNotification.dismissalReason, liveNotification.investigationSummary])

  const allKnownNotifications = useMemo(() => {
    const merged = [...(notifications || []), ...(allNotifications || [])]
    return merged.filter((item, index) => merged.findIndex(candidate => candidate.id === item.id) === index)
  }, [allNotifications, notifications])

  const relatedEvents = useMemo(() => {
    const resourceName = extractResourceName(liveNotification)
    return allKnownNotifications
      .filter(item => item.id !== liveNotification.id)
      .filter(item => {
        if (liveNotification.dedupeKey && item.dedupeKey === liveNotification.dedupeKey) return true
        return Boolean(resourceName) && extractResourceName(item) === resourceName && item.cluster === liveNotification.cluster && item.namespace === liveNotification.namespace
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [allKnownNotifications, liveNotification])

  const matchingSolves = useMemo(() => {
    return (solves || [])
      .filter(solve => matchesSolve(liveNotification, solve))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }, [liveNotification, solves])

  const relatedActivity = useMemo(() => {
    const resourceName = extractResourceName(liveNotification)
    return (activity || [])
      .filter(entry => entry.eventId === liveNotification.id || (
        Boolean(resourceName) &&
        entry.cluster === liveNotification.cluster &&
        entry.namespace === liveNotification.namespace &&
        entry.workload === resourceName
      ))
      .slice(0, INVESTIGATION_ACTIVITY_LIMIT)
  }, [activity, liveNotification])

  const resourceName = extractResourceName(liveNotification)
  const affectedResource = liveNotification.affectedResource || [liveNotification.cluster, liveNotification.namespace, resourceName].filter(Boolean).join(' / ') || 'Unknown resource'
  const rootCause = liveNotification.rootCause || liveNotification.investigationSummary || matchingSolves[0]?.summary || 'Pending Analysis'
  const errorMessage = liveNotification.errorMessage || liveNotification.body || 'No error message recorded.'
  const autoResolutionSummary = useMemo(() => {
    const latestSolve = matchingSolves[0]
    if (!latestSolve) {
      return {
        status: 'Not attempted',
        detail: 'No automatic remediation attempt has been recorded for this event yet.',
      }
    }
    const summary = latestSolve.error || latestSolve.summary || 'Manual intervention is still required.'
    if (latestSolve.status === 'resolved') {
      return { status: 'Succeeded', detail: summary }
    }
    if (latestSolve.status === 'running') {
      return { status: 'In progress', detail: summary }
    }
    if (latestSolve.status === 'escalated') {
      return { status: 'Escalated', detail: summary }
    }
    if (latestSolve.status === 'exhausted') {
      return { status: 'Paused', detail: summary }
    }
    return { status: latestSolve.status, detail: summary }
  }, [matchingSolves])

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      {
        ts: liveNotification.createdAt,
        label: 'Detected',
        detail: liveNotification.title,
      },
    ]
    if (liveNotification.updatedAt && liveNotification.updatedAt !== liveNotification.createdAt) {
      entries.push({
        ts: liveNotification.updatedAt,
        label: statusLabel(liveNotification.status),
        detail: liveNotification.investigationSummary || liveNotification.resolutionNote || liveNotification.dismissalReason || 'Event status updated from the modal.',
      })
    }
    relatedEvents.forEach(item => {
      entries.push({ ts: item.createdAt, label: 'Related event', detail: item.title })
    })
    matchingSolves.forEach(solve => {
      entries.push({
        ts: solve.endedAt || solve.startedAt,
        label: `Auto-resolution ${statusLabel(solve.status)}`,
        detail: solve.error || solve.summary || `${solve.actionsTaken} action(s) taken`,
      })
    })
    return entries
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, TIMELINE_ENTRY_LIMIT)
  }, [liveNotification, matchingSolves, relatedEvents])

  const investigationCopyText = useMemo(() => {
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
  }, [affectedResource, autoResolutionSummary.detail, autoResolutionSummary.status, errorMessage, liveNotification, matchingSolves, pendingActions, relatedActivity, relatedEvents, rootCause])

  const handleCopyDetails = async () => {
    const copied = await copyToClipboard(investigationCopyText)
    showToast(copied ? 'Investigation details copied' : 'Failed to copy investigation details', copied ? 'success' : 'error')
  }

  const handleMarkInvestigating = async () => {
    setIsSubmitting(true)
    try {
      await investigateNotification(liveNotification.id, investigationSummary.trim() || undefined)
      showToast('Event marked as investigating', 'info')
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to mark event as investigating'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResolve = async () => {
    setIsSubmitting(true)
    try {
      await startSolve(liveNotification.id)
      showToast('Attempt started in AI mission', 'success')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to start AI mission'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDismiss = async () => {
    setIsSubmitting(true)
    try {
      await dismissNotification(liveNotification.id, dismissalReason.trim() || undefined)
      showToast('Event removed from escalated list', 'success')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to remove event'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const color = severityColor(liveNotification.severity)
  return (
    <BaseModal isOpen onClose={onClose} size="lg" closeOnBackdrop={false} testId="stellar-event-modal">
      <div className="flex min-h-0 flex-col bg-[var(--s-bg)] text-[var(--s-text)]">
        <BaseModal.Header
          title={liveNotification.title}
          description={`Event ID: ${liveNotification.id}`}
          onClose={onClose}
          badges={(
            <>
              <Badge color={color}>{liveNotification.severity}</Badge>
              <Badge color={liveNotification.status === 'investigating' ? 'var(--s-info)' : color}>{statusLabel(liveNotification.status)}</Badge>
              <Badge color="var(--s-text-muted)">{formatAbsoluteUtc(liveNotification.updatedAt || liveNotification.createdAt)}</Badge>
            </>
          )}
        >
          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--s-text-muted)]">
            Escalated event details
          </div>
        </BaseModal.Header>

        <div className="s-scroll flex-1 overflow-y-auto px-5 py-4">
          <EventDetailPanel
            view={view}
            rootCause={rootCause}
            affectedResource={affectedResource}
            errorMessage={errorMessage}
            timelineEntries={timelineEntries}
            autoResolutionSummary={autoResolutionSummary}
            batchWindow={formatAbsoluteUtc(liveNotification.batchTimestamp || liveNotification.createdAt)}
            investigationSummary={investigationSummary}
            setInvestigationSummary={setInvestigationSummary}
            relatedEvents={relatedEvents}
            matchingSolves={matchingSolves}
            relatedActivity={relatedActivity}
            formatAbsoluteUtc={formatAbsoluteUtc}
            formatRelative={formatRelative}
            statusLabel={statusLabel}
            rawPayload={liveNotification.body || errorMessage}
          />
        </div>

        <div className="border-t border-[var(--s-border)] px-5 py-4">
          <ActionButtons
            view={view}
            confirmAction={confirmAction}
            isSubmitting={isSubmitting}
            dismissalReason={dismissalReason}
            setDismissalReason={setDismissalReason}
            solveStatus={solveStatus || null}
            liveNotification={liveNotification}
            resourceName={resourceName}
            buildInvestigatePrompt={buildInvestigatePrompt}
            onAction={onAction}
            onSetView={setView}
            onSetConfirmAction={setConfirmAction}
            onResolve={() => { void handleResolve() }}
            onDismiss={() => { void handleDismiss() }}
            onCopyDetails={() => { void handleCopyDetails() }}
            onMarkInvestigating={() => { void handleMarkInvestigating() }}
          />
        </div>
      </div>
    </BaseModal>
  )
}

function Badge({ color, children }: { color: string; children: ReactNode }) {
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
