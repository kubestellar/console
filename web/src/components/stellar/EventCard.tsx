import type { StellarNotification } from '../../types/stellar'

const REVERSIBLE_ACTION_TYPES = ['ScaleDeployment', 'RestartDeployment']

function isCompletedReversibleAction(notification: StellarNotification): boolean {
  if (notification.type !== 'action') return false
  if (!notification.title.startsWith('Action completed')) return false
  return REVERSIBLE_ACTION_TYPES.some(t => notification.title.includes(t) || notification.body.includes(t))
}

function buildRollbackPrompt(notification: StellarNotification): string {
  for (const actionType of REVERSIBLE_ACTION_TYPES) {
    if (notification.title.includes(actionType) || notification.body.includes(actionType)) {
      const ns = notification.namespace ? `${notification.namespace}/` : ''
      return `Undo the last ${actionType} on ${ns}${notification.cluster} — restore previous state`
    }
  }
  return `Undo the last action on ${notification.cluster}`
}

export function EventCard({
  notification,
  onDismiss,
  onRollback,
}: {
  notification: StellarNotification
  onDismiss: () => void
  onRollback?: (prompt: string) => void
}) {
  const color = { critical: 'var(--s-critical)', warning: 'var(--s-warning)', info: 'var(--s-info)' }[notification.severity] ?? 'var(--s-text-muted)'
  const showRollback = isCompletedReversibleAction(notification)

  return (
    <div style={{ borderLeft: `3px solid ${color}`, background: notification.read ? 'transparent' : 'var(--s-surface-2)', border: notification.read ? '1px solid transparent' : '1px solid var(--s-border)', borderLeftColor: color, borderRadius: 'var(--s-r)', padding: '8px 10px', opacity: notification.read ? 0.45 : 1 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--s-text)' }}>{notification.title}</div>
      <div style={{ fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.55, marginTop: 4 }}>{notification.body}</div>
      {!notification.read && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <button onClick={onDismiss} style={{ background: 'none', border: '1px solid var(--s-border-muted)', borderRadius: 'var(--s-rs)', padding: '2px 8px', fontSize: 11, color: 'var(--s-text-muted)', cursor: 'pointer' }}>Dismiss</button>
          {showRollback && onRollback && (
            <button
              onClick={() => onRollback(buildRollbackPrompt(notification))}
              style={{ background: 'none', border: '1px solid var(--s-border-muted)', borderRadius: 'var(--s-rs)', padding: '2px 8px', fontSize: 11, color: 'var(--s-text-muted)', cursor: 'pointer' }}
            >
              ↩ Undo this
            </button>
          )}
        </div>
      )}
    </div>
  )
}
