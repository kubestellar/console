/**
 * useEventModalData — owns EventModal's state, derived data (related
 * events/solves/activity, timeline, auto-resolution summary, investigation
 * copy text), and action handlers (mark investigating / resolve / dismiss /
 * copy details), so `EventModal.tsx` can stay a thin presentational
 * component. Extracted from EventModal.tsx — no behaviour change.
 */

import { useEffect, useMemo, useState } from 'react'
import type { StellarAction, StellarNotification, StellarSolve } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { useToast } from '../ui/Toast'
import { copyToClipboard } from '../../lib/clipboard'
import {
  TIMELINE_ENTRY_LIMIT,
  INVESTIGATION_ACTIVITY_LIMIT,
  type TimelineEntry,
  severityColor,
  statusLabel,
  extractResourceName,
  formatAbsoluteUtc,
  matchesSolve,
  getErrorMessage,
} from './EventModal.utils'

export type ModalView = 'overview' | 'investigate'
export type ConfirmAction = 'resolve' | 'dismiss' | null

interface UseEventModalDataArgs {
  notification: StellarNotification
  allNotifications: StellarNotification[]
  pendingActions: StellarAction[]
  solves: StellarSolve[]
  onClose: () => void
}

export function useEventModalData({ notification, allNotifications, pendingActions, solves, onClose }: UseEventModalDataArgs) {
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
  const solveAttemptCount = matchingSolves.length

  return {
    liveNotification,
    view, setView,
    confirmAction, setConfirmAction,
    investigationSummary, setInvestigationSummary,
    dismissalReason, setDismissalReason,
    isSubmitting,
    relatedEvents,
    matchingSolves,
    relatedActivity,
    resourceName,
    affectedResource,
    rootCause,
    errorMessage,
    autoResolutionSummary,
    timelineEntries,
    color,
    solveAttemptCount,
    handleCopyDetails,
    handleMarkInvestigating,
    handleResolve,
    handleDismiss,
  }
}
