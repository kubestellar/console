import { useMemo } from 'react'
import type { StellarAction, StellarNotification, StellarSolve } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { BaseModal } from '../../lib/modals'
import type { PendingAction } from './EventCard'
import {
  RELATED_EVENT_LIMIT,
  TIMELINE_ENTRY_LIMIT,
  INVESTIGATION_ACTIVITY_LIMIT,
  INVESTIGATION_TEXTAREA_ROWS,
  type TimelineEntry,
  severityColor,
  statusLabel,
  extractResourceName,
  formatAbsoluteUtc,
  buildInvestigatePrompt,
  matchesSolve,
} from './EventModal.utils'
import { Badge, Section, Timeline, ListBlock, ActionButton, ConfirmationPanel } from './EventModal.parts'
import { useEventModalActions } from './useEventModalActions'

interface EventModalProps {
  notification: StellarNotification
  allNotifications: StellarNotification[]
  pendingActions: StellarAction[]
  solveStatus?: import('./lib/derive').SolveStatus | null
  solves?: StellarSolve[]
  onClose: () => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

export function EventModal({ notification, allNotifications, pendingActions, solveStatus, solves = [], onClose, onAction }: EventModalProps) {
  const { notifications } = useStellar()

  const liveNotification = useMemo(() => {
    return (notifications || []).find(item => item.id === notification.id) || notification
  }, [notification, notifications])

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
    if (latestSolve.status === 'resolved') return { status: 'Succeeded', detail: summary }
    if (latestSolve.status === 'running') return { status: 'In progress', detail: summary }
    if (latestSolve.status === 'escalated') return { status: 'Escalated', detail: summary }
    if (latestSolve.status === 'exhausted') return { status: 'Paused', detail: summary }
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
      `Solve attempts: ${(matchingSolves || []).map(item => `${formatAbsoluteUtc(item.startedAt)} — ${item.status}: ${item.summary || item.error || 'No summary'}`).join('\n') || 'None'}`,
      `Raw detail: ${liveNotification.body || 'None'}`,
    ]
    return (sections || []).join('\n\n')
  }, [affectedResource, autoResolutionSummary.detail, autoResolutionSummary.status, errorMessage, liveNotification, matchingSolves, pendingActions, relatedEvents, rootCause])

  const {
    activity,
    view,
    setView,
    confirmAction,
    setConfirmAction,
    investigationSummary,
    setInvestigationSummary,
    dismissalReason,
    setDismissalReason,
    isSubmitting,
    handleCopyDetails,
    handleMarkInvestigating,
    handleResolve,
    handleDismiss,
  } = useEventModalActions({ liveNotification, investigationCopyText, onClose })

  const relatedActivity = useMemo(() => {
    const resName = extractResourceName(liveNotification)
    return (activity || [])
      .filter(entry => entry.eventId === liveNotification.id || (
        Boolean(resName) &&
        entry.cluster === liveNotification.cluster &&
        entry.namespace === liveNotification.namespace &&
        entry.workload === resName
      ))
      .slice(0, INVESTIGATION_ACTIVITY_LIMIT)
  }, [activity, liveNotification])

  const color = severityColor(liveNotification.severity)
  const solveAttemptCount = matchingSolves.length

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
          {view === 'overview' ? (
            <div className="space-y-4">
              <Section title="Root cause">{rootCause}</Section>
              <Section title="Affected resource">{affectedResource}</Section>
              <Section title="Error message">{errorMessage}</Section>
              <Section title="Event history">
                <Timeline entries={timelineEntries} />
              </Section>
              <Section title="Auto-resolution attempt">
                <div className="text-sm">
                  <div className="mb-1 font-medium">Status: {autoResolutionSummary.status}</div>
                  <div className="text-[var(--s-text-muted)]">{autoResolutionSummary.detail}</div>
                </div>
              </Section>
              <Section title="Batch metadata">Batch window: {formatAbsoluteUtc(liveNotification.batchTimestamp || liveNotification.createdAt)}</Section>
            </div>
          ) : (
            <div className="space-y-4">
              <Section title="Investigation summary">
                <textarea
                  value={investigationSummary}
                  onChange={(event) => setInvestigationSummary(event.target.value)}
                  rows={INVESTIGATION_TEXTAREA_ROWS}
                  className="w-full rounded border border-[var(--s-border)] bg-[var(--s-surface)] px-3 py-2 text-sm text-[var(--s-text)]"
                  placeholder="Optional note for the team"
                />
              </Section>
              <Section title="Full event logs">
                <pre className="whitespace-pre-wrap rounded border border-[var(--s-border)] bg-[var(--s-surface)] p-3 text-xs text-[var(--s-text-muted)]">{liveNotification.body || errorMessage}</pre>
              </Section>
              <Section title={`Related events (${relatedEvents.length})`}>
                <ListBlock
                  items={(relatedEvents || []).slice(0, RELATED_EVENT_LIMIT).map(item => ({
                    id: item.id,
                    title: item.title,
                    subtitle: `${formatAbsoluteUtc(item.createdAt)} · ${statusLabel(item.status)}`,
                  }))}
                  emptyText="No related events found in the current feed."
                />
              </Section>
              <Section title={`Retry history (${solveAttemptCount})`}>
                <ListBlock
                  items={(matchingSolves || []).map(item => ({
                    id: item.id,
                    title: `${statusLabel(item.status)} · ${item.actionsTaken} action(s)`,
                    subtitle: `${formatAbsoluteUtc(item.startedAt)} · ${item.summary || item.error || 'No summary available'}`,
                  }))}
                  emptyText="No automatic retries recorded."
                />
              </Section>
              <Section title={`Related activity (${relatedActivity.length})`}>
                <ListBlock
                  items={(relatedActivity || []).map(item => ({
                    id: item.id,
                    title: item.title,
                    subtitle: `${formatAbsoluteUtc(item.ts)} · ${item.detail || 'No additional detail'}`,
                  }))}
                  emptyText="No related activity recorded yet."
                />
              </Section>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--s-border)] px-5 py-4">
          {confirmAction === 'resolve' && (
            <ConfirmationPanel
              title="Start AI mission"
              description="This will trigger an AI mission to autonomously fix this event."
              value=""
              onChange={() => {}}
              placeholder=""
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => { void handleResolve() }}
              confirmLabel="Start Mission"
              isSubmitting={isSubmitting}
            />
          )}
          {confirmAction === 'dismiss' && (
            <ConfirmationPanel
              title="Confirm removal"
              description="This event will be removed from the escalated list."
              value={dismissalReason}
              onChange={setDismissalReason}
              placeholder="Dismissal reason (optional)"
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => { void handleDismiss() }}
              confirmLabel="Remove"
              isSubmitting={isSubmitting}
            />
          )}

          {confirmAction === null && view === 'overview' && (
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => setView('investigate')} color="var(--s-info)">Investigate</ActionButton>
              <ActionButton onClick={() => setConfirmAction('resolve')} color="var(--s-success)">Solve</ActionButton>
              <ActionButton onClick={() => setConfirmAction('dismiss')} color="var(--s-critical)">Remove</ActionButton>
            </div>
          )}

          {confirmAction === null && view === 'investigate' && (
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={() => setView('overview')} color="var(--s-text-muted)">Back</ActionButton>
              <ActionButton onClick={() => { void handleCopyDetails() }} color="var(--s-text-muted)">Copy Details</ActionButton>
              {onAction && (
                <ActionButton
                  onClick={() => onAction(buildInvestigatePrompt(liveNotification), {
                    prompt: buildInvestigatePrompt(liveNotification),
                    actionType: 'investigate',
                    cluster: liveNotification.cluster || '',
                    namespace: liveNotification.namespace || '',
                    name: resourceName,
                  })}
                  color="var(--s-warning)"
                >
                  Open in Chat
                </ActionButton>
              )}
              <ActionButton onClick={() => { void handleMarkInvestigating() }} color="var(--s-info)" disabled={isSubmitting}>
                Mark as Investigating
              </ActionButton>
            </div>
          )}

          {solveStatus && view === 'overview' && confirmAction === null && (
            <div className="mt-3 text-xs text-[var(--s-text-muted)]">
              Stellar status: <span style={{ color: solveStatus.color }}>{solveStatus.label}</span>
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  )
}
