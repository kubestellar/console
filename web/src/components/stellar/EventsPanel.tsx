import { useMemo, useRef } from 'react'
import type { StellarAction, StellarNotification } from '../../types/stellar'

const severityOrder: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

interface EventsPanelProps {
  notifications: StellarNotification[]
  pendingActions: StellarAction[]
  acknowledgeNotification: (id: string) => Promise<void>
  approveAction: (id: string) => Promise<void>
  rejectAction: (id: string, reason: string) => Promise<void>
}

export function EventsPanel({
  notifications,
  pendingActions,
  acknowledgeNotification,
  approveAction,
  rejectAction,
}: EventsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { unread, sorted } = useMemo(() => {
    const unreadItems = notifications.filter(n => !n.read)
    const readItems = notifications.filter(n => n.read)
    const sortedUnread = unreadItems.slice().sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
    return { unread: unreadItems, sorted: [...sortedUnread, ...readItems] }
  }, [notifications])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
        flexShrink: 0,
        borderBottom: '1px solid var(--s-border)',
      }}>
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--s-text-muted)',
        }}>
          Events
        </span>
        {unread.length > 0 && (
          <span style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--s-warning)',
            background: 'rgba(227,179,65,0.12)',
            border: '1px solid rgba(227,179,65,0.3)',
            borderRadius: 10,
            padding: '0 5px',
          }}>
            {unread.length} new
          </span>
        )}
        <div style={{ flex: 1 }} />
        {sorted.length > 0 && (
          <button
            onClick={() => {
              unread.forEach((notification) => { void acknowledgeNotification(notification.id) })
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--s-text-dim)',
              padding: 0,
            }}
          >
            clear all
          </button>
        )}
      </div>

      {pendingActions.length > 0 && (
        <div style={{
          padding: '8px 10px',
          flexShrink: 0,
          borderBottom: '1px solid var(--s-border)',
          background: 'rgba(227,179,65,0.05)',
        }}>
          <div style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--s-warning)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            ⚠ Approval required
          </div>
          {pendingActions.map(action => (
            <ApprovalCard
              key={action.id}
              action={action}
              onApprove={() => { void approveAction(action.id) }}
              onReject={() => { void rejectAction(action.id, 'Rejected by user') }}
            />
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="s-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minHeight: 0,
        }}
      >
        {sorted.length === 0 ? (
          <EmptyState icon="✦" text="No events — all clear" />
        ) : (
          sorted.map(notification => (
            <EventCard
              key={notification.id}
              notification={notification}
              onDismiss={() => { void acknowledgeNotification(notification.id) }}
            />
          ))
        )}
      </div>
    </div>
  )
}

function EventCard({
  notification,
  onDismiss,
}: {
  notification: StellarNotification
  onDismiss: () => void
}) {
  const color = {
    critical: 'var(--s-critical)',
    warning: 'var(--s-warning)',
    info: 'var(--s-info)',
  }[notification.severity] ?? 'var(--s-text-muted)'
  const age = getRelativeTime(notification.createdAt)

  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: notification.read ? 'transparent' : 'var(--s-surface-2)',
      border: notification.read ? '1px solid transparent' : '1px solid var(--s-border)',
      borderLeftColor: color,
      borderRadius: 'var(--s-r)',
      padding: '8px 10px',
      opacity: notification.read ? 0.45 : 1,
      transition: 'opacity var(--s-t), background var(--s-t)',
    }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--s-text)',
          lineHeight: 1.3,
          wordBreak: 'break-word',
        }}>
          {notification.title}
        </span>
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-text-dim)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          {age}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        <Badge color={color} text={notification.severity.toUpperCase()} />
        {notification.cluster && <Badge text={notification.cluster} mono />}
        {notification.namespace && <Badge text={notification.namespace} mono />}
      </div>

      <div style={{
        fontSize: 12,
        color: 'var(--s-text-muted)',
        lineHeight: 1.55,
        marginBottom: notification.read ? 0 : 6,
      }}>
        {notification.body}
      </div>

      {!notification.read && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: '1px solid var(--s-border-muted)',
            borderRadius: 'var(--s-rs)',
            padding: '2px 8px',
            fontSize: 11,
            color: 'var(--s-text-muted)',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  )
}

function ApprovalCard({
  action,
  onApprove,
  onReject,
}: {
  action: StellarAction
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div style={{
      background: 'var(--s-surface-2)',
      border: '1px solid rgba(227,179,65,0.4)',
      borderRadius: 'var(--s-r)',
      padding: '8px 10px',
      marginBottom: 4,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--s-text)', marginBottom: 3 }}>
        {action.description}
      </div>
      <div style={{
        fontFamily: 'var(--s-mono)',
        fontSize: 10,
        color: 'var(--s-text-muted)',
        marginBottom: 8,
      }}>
        {action.actionType} · {action.cluster}{action.namespace ? `/${action.namespace}` : ''}
        {action.scheduledAt ? ` · ${new Date(action.scheduledAt).toLocaleString()}` : ' · immediately'}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onApprove}
          style={{
            background: 'var(--s-success)',
            color: '#0a0e14',
            border: 'none',
            borderRadius: 'var(--s-rs)',
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Approve
        </button>
        <button
          onClick={onReject}
          style={{
            background: 'none',
            color: 'var(--s-critical)',
            border: '1px solid var(--s-critical)',
            borderRadius: 'var(--s-rs)',
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reject
        </button>
      </div>
    </div>
  )
}

function Badge({ text, color, mono }: { text: string; color?: string; mono?: boolean }) {
  return (
    <span style={{
      fontFamily: mono ? 'var(--s-mono)' : undefined,
      fontSize: 10,
      fontWeight: color ? 700 : 400,
      color: color ?? 'var(--s-text-muted)',
      background: color ? `${color}18` : 'var(--s-bg)',
      border: `1px solid ${color ? `${color}40` : 'var(--s-border)'}`,
      borderRadius: 'var(--s-rs)',
      padding: '1px 5px',
      letterSpacing: color ? '0.05em' : undefined,
    }}>
      {text}
    </span>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      color: 'var(--s-text-dim)',
    }}>
      <span style={{ fontSize: 22, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  )
}

function getRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
