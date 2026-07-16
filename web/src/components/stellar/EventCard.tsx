import type { StellarNotification } from '../../types/stellar'
import {
  countRelated,
  deriveImportance,
  deriveShortReason,
  deriveTags,
  importanceColor,
  type SolveStatus,
} from './lib/derive'
import { formatRelativeTime } from './lib/time'
import { EventCardActions } from './event-card/EventCardActions'
import { EventCardHeader, type EventCardStatusBadge } from './event-card/EventCardHeader'
import {
  EventCardMonitoringBadge,
  EventCardSolveStatus,
} from './event-card/EventCardSolveStatus'
import {
  deriveActionHints,
  isCompletedReversibleAction,
  type PendingAction,
} from './event-card/eventCardHelpers'
import {
  EVENT_CARD_ATTEMPT_BADGE_STYLE,
  EVENT_CARD_BODY_STYLE,
  EVENT_CARD_CONTAINER_BASE_STYLE,
  EVENT_CARD_REASON_STYLE,
  EVENT_CARD_TAG_STYLE,
} from './event-card/eventCardStyles'
import { useTranslation } from 'react-i18next'

export type { PendingAction } from './event-card/eventCardHelpers'

function statusBadgeFor(notification: StellarNotification): EventCardStatusBadge | null {
  if (notification.status === 'investigating') {
    return { label: 'Investigating', color: 'var(--s-info)' }
  }
  if (notification.status === 'resolved') {
    return { label: 'Resolved', color: 'var(--s-success)' }
  }
  if (notification.status === 'dismissed') {
    return { label: 'Removed', color: 'var(--s-text-muted)' }
  }
  return null
}

export function EventCard({
  notification,
  allNotifications,
  solveStatus,
  attemptCount,
  onSolve,
  onDismiss,
  onRollback,
  onAction,
  onOpenDetail,
}: {
  notification: StellarNotification
  allNotifications?: StellarNotification[]
  solveStatus?: SolveStatus | null
  /** Number of Stellar solve attempts on this workload, used to render the
   *  "Tried N×" body badge. 0 means no badge. */
  attemptCount?: number
  onSolve?: (eventID: string) => Promise<unknown>
  onDismiss: () => void
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
  onOpenDetail?: (n: StellarNotification) => void
}) {
  const { t } = useTranslation()
  const color =
    { critical: 'var(--s-critical)', warning: 'var(--s-warning)', info: 'var(--s-info)' }[
      notification.severity
    ] ?? 'var(--s-text-muted)'
  const showRollback = isCompletedReversibleAction(notification)
  const hints = deriveActionHints(notification)
  const relatedCount = allNotifications ? countRelated(notification, allNotifications) : 0
  const tags = deriveTags(notification, relatedCount)
  const importance = deriveImportance(notification, relatedCount)
  const importanceCol = importanceColor(importance.label)
  const shortReason = deriveShortReason(notification)
  const relativeCreatedAt = formatRelativeTime(notification.createdAt)
  const statusBadge = statusBadgeFor(notification)

  return (
    <div
      onClick={() => onOpenDetail?.(notification)}
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${notification.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail?.(notification)
        }
      }}
      className="px-2.5 py-2"
      style={{
        ...EVENT_CARD_CONTAINER_BASE_STYLE,
        borderLeft: `3px solid ${color}`,
        background: notification.read ? 'transparent' : 'var(--s-surface-2)',
        border: notification.read ? '1px solid transparent' : '1px solid var(--s-border)',
        borderLeftColor: color,
        opacity: notification.read ? 0.45 : 1,
        cursor: onOpenDetail ? 'pointer' : 'default',
      }}
    >
      <EventCardHeader
        notification={notification}
        importance={importance}
        importanceCol={importanceCol}
        statusBadge={statusBadge}
        relativeCreatedAt={relativeCreatedAt}
        onOpenDetail={onOpenDetail}
      />
      {tags.length > 0 && !notification.read && (
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map(tag => (
            <span className="px-1.5 py-0.5 text-[9px] font-mono" key={tag} style={EVENT_CARD_TAG_STYLE}>
              {tag}
            </span>
          ))}
        </div>
      )}
      {shortReason && !notification.read && (
        <div
          className="mt-1 text-[11px]"
          style={{
            ...EVENT_CARD_REASON_STYLE,
            color: color,
          }}
        >
          ✦ {shortReason}
        </div>
      )}
      {solveStatus && <EventCardSolveStatus solveStatus={solveStatus} />}
      {solveStatus?.phase === 'resolved_monitored' && (
        <EventCardMonitoringBadge solveStatus={solveStatus} notification={notification} />
      )}
      {attemptCount && attemptCount > 0 ? (
        <div
          className="mt-1 inline-flex items-center gap-1 rounded-[10px] px-1.5 text-[10px] font-mono"
          style={EVENT_CARD_ATTEMPT_BADGE_STYLE}
        >
          <span>{t('stellar.eventCard.attemptCount', { count: attemptCount })}</span>
        </div>
      ) : null}
      <div className="mt-1 text-xs" style={EVENT_CARD_BODY_STYLE}>
        {notification.body}
      </div>
      {!notification.read && (
        <EventCardActions
          notification={notification}
          solveStatus={solveStatus}
          hints={hints}
          showRollback={showRollback}
          onSolve={onSolve}
          onDismiss={onDismiss}
          onRollback={onRollback}
          onAction={onAction}
        />
      )}
    </div>
  )
}
