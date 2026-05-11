import type { StellarNotification } from '../../types/stellar'

export function EventCard({ notification, onDismiss }: { notification: StellarNotification; onDismiss: () => void }) {
  const color = { critical: 'var(--s-critical)', warning: 'var(--s-warning)', info: 'var(--s-info)' }[notification.severity] ?? 'var(--s-text-muted)'
  return (
    <div style={{ borderLeft: `3px solid ${color}`, background: notification.read ? 'transparent' : 'var(--s-surface-2)', border: notification.read ? '1px solid transparent' : '1px solid var(--s-border)', borderLeftColor: color, borderRadius: 'var(--s-r)', padding: '8px 10px', opacity: notification.read ? 0.45 : 1 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--s-text)' }}>{notification.title}</div>
      <div style={{ fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.55, marginTop: 4 }}>{notification.body}</div>
      {!notification.read && <button onClick={onDismiss} style={{ marginTop: 6, background: 'none', border: '1px solid var(--s-border-muted)', borderRadius: 'var(--s-rs)', padding: '2px 8px', fontSize: 11, color: 'var(--s-text-muted)', cursor: 'pointer' }}>Dismiss</button>}
    </div>
  )
}
