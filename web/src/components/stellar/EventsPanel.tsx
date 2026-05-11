import { useMemo, useRef } from 'react'
import type { StellarAction, StellarNotification } from '../../types/stellar'
import { EventCard } from './EventCard'
import { ApprovalCard } from './ApprovalCard'

const severityOrder: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

interface EventsPanelProps {
  notifications: StellarNotification[]
  pendingActions: StellarAction[]
  acknowledgeNotification: (id: string) => Promise<void>
  approveAction: (id: string, confirmToken?: string) => Promise<void>
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
        {notifications.length > 0 && (
          <button
            onClick={() => {
              // Dismiss ALL notifications (read + unread)
              ;(notifications || []).forEach((notification) => { void acknowledgeNotification(notification.id) })
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
              onApprove={(confirmToken) => approveAction(action.id, confirmToken)}
              onReject={(reason) => rejectAction(action.id, reason)}
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
