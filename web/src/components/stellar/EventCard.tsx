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

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  investigate: { label: 'Investigate', icon: '🔍', color: 'var(--s-info)' },
  restart: { label: 'Restart', icon: '↻', color: 'var(--s-warning)' },
  scale: { label: 'Scale', icon: '↕', color: 'var(--s-info)' },
}

function buildActionPrompt(hint: string, notification: StellarNotification): string {
  const resource = notification.title
  const cluster = notification.cluster ? ` on cluster ${notification.cluster}` : ''
  switch (hint) {
    case 'investigate':
      return `Investigate ${resource}${cluster}. Pull the logs and tell me what's wrong.`
    case 'restart':
      return `Restart the affected deployment for ${resource}${cluster}. What's the safest approach?`
    case 'scale':
      return `Should we scale the deployment for ${resource}${cluster}? What replica count makes sense?`
    default:
      return `Help me with "${hint}" for ${resource}${cluster}.`
  }
}

/** Derive action hints from event type/severity when not provided by the backend. */
function deriveActionHints(notification: StellarNotification): string[] {
  if (notification.actionHints && notification.actionHints.length > 0) {
    return notification.actionHints
  }
  if (notification.type !== 'event' || notification.read) return []
  const title = notification.title.toLowerCase()
  if (title.includes('crashloopbackoff') || title.includes('oomkill')) {
    return ['investigate', 'restart']
  }
  if (title.includes('failedscheduling')) {
    return ['investigate', 'scale']
  }
  if (title.includes('backoff') || title.includes('failed') || title.includes('failedmount')) {
    return ['investigate']
  }
  if (notification.severity === 'critical') {
    return ['investigate', 'restart']
  }
  if (notification.severity === 'warning') {
    return ['investigate']
  }
  return []
}

export function EventCard({
  notification,
  onDismiss,
  onRollback,
  onAction,
}: {
  notification: StellarNotification
  onDismiss: () => void
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string) => void
}) {
  const color = { critical: 'var(--s-critical)', warning: 'var(--s-warning)', info: 'var(--s-info)' }[notification.severity] ?? 'var(--s-text-muted)'
  const showRollback = isCompletedReversibleAction(notification)
  const hints = deriveActionHints(notification)

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
          {hints.map(hint => {
            const cfg = ACTION_CONFIG[hint] ?? { label: hint.charAt(0).toUpperCase() + hint.slice(1), icon: '→', color: 'var(--s-text-muted)' }
            return (
              <button
                key={hint}
                onClick={() => onAction?.(buildActionPrompt(hint, notification))}
                title={`${cfg.label}: ${notification.title}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  background: 'none',
                  border: `1px solid ${cfg.color}`,
                  borderRadius: 'var(--s-rs)',
                  padding: '2px 8px',
                  fontSize: 11,
                  color: cfg.color,
                  cursor: 'pointer',
                }}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
