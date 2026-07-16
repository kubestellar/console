import { useEffect, useMemo } from 'react'
import type { StellarNotification, StellarSolve, StellarWatch } from '../../types/stellar'
import type { PendingAction } from './EventCard'
import { getWatchAttemptSummary } from './lib/derive'
import { WatchDetailHeader } from './watchDetail/WatchDetailHeader'
import { WatchDetailContent } from './watchDetail/WatchDetailContent'
import { WatchDetailFooter } from './watchDetail/WatchDetailFooter'
import {
  FREQUENCY_WINDOW_HOURS,
  RECURRING_EVENT_THRESHOLD,
  STALE_THRESHOLD_MS,
  deploymentNameFromPodName,
  matchesWatch,
  severityColor,
} from './watchDetail/helpers'

interface WatchDetailModalProps {
  watch: StellarWatch
  allNotifications: StellarNotification[]
  solves?: StellarSolve[]
  onClose: () => void
  onResolve: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

export function WatchDetailModal({
  watch,
  allNotifications,
  solves = [],
  onClose,
  onResolve,
  onDismiss,
  onSnooze,
  onAction,
}: WatchDetailModalProps) {
  const attemptSummary = useMemo(() => getWatchAttemptSummary(watch, solves), [watch, solves])
  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const deploymentName = watch.resourceKind === 'Pod'
    ? deploymentNameFromPodName(watch.resourceName)
    : watch.resourceName

  // Find all events that mention this resource
  const relatedEvents = useMemo(() => {
    return allNotifications
      .filter(n => matchesWatch(n, watch, deploymentName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allNotifications, watch, deploymentName])

  // Stats
  const totalEvents = relatedEvents.length
  const last24h = useMemo(() => {
    const cutoff = Date.now() - FREQUENCY_WINDOW_HOURS * 3600_000
    return relatedEvents.filter(n => new Date(n.createdAt).getTime() >= cutoff).length
  }, [relatedEvents])
  const criticalCount = relatedEvents.filter(n => n.severity === 'critical').length
  const warningCount = relatedEvents.filter(n => n.severity === 'warning').length

  const watchAgeMs = Date.now() - new Date(watch.createdAt).getTime()
  const isStale = Boolean(
    watch.lastChecked && (Date.now() - new Date(watch.lastChecked).getTime() > STALE_THRESHOLD_MS)
  )
  const isRecurring = totalEvents >= RECURRING_EVENT_THRESHOLD

  // Pick a dominant color based on highest severity of recent events
  const dominantSeverity = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'info'
  const color = severityColor(dominantSeverity)

  // Build recommendations
  const investigatePrompt =
    `Investigate ${watch.namespace}/${watch.resourceName} on cluster ${watch.cluster}. ` +
    `I've been watching this because: ${watch.reason || 'recurring issues'}. ` +
    `What's wrong and what should I do?`
  const restartPrompt =
    `Restart the deployment for ${watch.namespace}/${deploymentName} on cluster ${watch.cluster}.`

  const canRestart = watch.resourceKind === 'Pod' || watch.resourceKind === 'Deployment'
  const titleId = `watch-detail-title-${watch.id}`

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="p-5"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 720, maxHeight: '90vh',
          background: 'var(--s-bg)',
          border: `1px solid var(--s-border)`,
          borderLeft: `4px solid ${color}`,
          borderRadius: 'var(--s-r)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--s-sans)', color: 'var(--s-text)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        <WatchDetailHeader
          watch={watch}
          titleId={titleId}
          color={color}
          dominantSeverity={dominantSeverity}
          isRecurring={isRecurring}
          isStale={isStale}
          canRestart={canRestart}
          watchAgeMs={watchAgeMs}
          onClose={onClose}
        />

        <WatchDetailContent
          watch={watch}
          relatedEvents={relatedEvents}
          attemptSummary={attemptSummary}
          totalEvents={totalEvents}
          last24h={last24h}
          criticalCount={criticalCount}
          warningCount={warningCount}
          color={color}
          isStale={isStale}
          isRecurring={isRecurring}
          canRestart={canRestart}
          deploymentName={deploymentName}
          investigatePrompt={investigatePrompt}
          restartPrompt={restartPrompt}
          onAction={onAction}
          onClose={onClose}
        />

        <WatchDetailFooter
          watchId={watch.id}
          onResolve={onResolve}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
