import { useState } from 'react'
import type { StellarNotification, StellarSolve } from '../../types/stellar'

interface DigestCardProps {
  notification: StellarNotification
  solves: StellarSolve[]
  onDismiss: () => void
  onOpenEvent?: (eventId: string) => void
}

/**
 * DigestCard renders the once-a-day "overnight recap" notification pinned at
 * the top of the events panel. Expansion reveals the underlying solve list so
 * the operator can drill into individual outcomes — JARVIS would not leave
 * them counting on faith.
 */
export function DigestCard({ notification, solves, onDismiss, onOpenEvent }: DigestCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Pull a recent window of solves to render in the expanded list. The server
  // includes counts in the notification body, but the rich detail is whatever
  // the client has cached locally — so the expansion is best-effort.
  const since = Date.now() - 24 * 3600_000
  const window = (solves || []).filter(s => new Date(s.startedAt).getTime() >= since)
  const resolved = window.filter(s => s.status === 'resolved')
  const escalated = window.filter(s => s.status === 'escalated')
  const paused = window.filter(s => s.status === 'exhausted')

  return (
    <div style={{
      borderLeft: '3px solid var(--s-info)',
      background: 'rgba(99,150,237,0.08)',
      border: '1px solid rgba(99,150,237,0.25)',
      borderRadius: 'var(--s-r)',
      padding: '10px 12px',
      margin: '6px 4px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>⭐</span>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--s-info)',
        }}>Daily recap</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--s-text-muted)' }}
        >{expanded ? '▼' : '▶'}</button>
        <button
          onClick={onDismiss}
          title="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--s-text-dim)' }}
        >✕</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--s-text)', marginTop: 6, lineHeight: 1.5 }}>
        {notification.body}
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <DigestGroup label="Auto-fixed" color="var(--s-success)" items={resolved} onOpen={onOpenEvent} />
          <DigestGroup label="Escalated" color="var(--s-warning)" items={escalated} onOpen={onOpenEvent} />
          <DigestGroup label="Paused at budget" color="var(--s-warning)" items={paused} onOpen={onOpenEvent} />
        </div>
      )}
    </div>
  )
}

function DigestGroup({
  label, color, items, onOpen,
}: {
  label: string
  color: string
  items: StellarSolve[]
  onOpen?: (eventId: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div style={{
        fontFamily: 'var(--s-mono)', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color, marginBottom: 2,
      }}>
        {label} ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => item.eventId && onOpen?.(item.eventId)}
            style={{
              background: 'none', border: '1px solid var(--s-border-muted)',
              borderRadius: 'var(--s-rs)', padding: '4px 6px', textAlign: 'left',
              cursor: item.eventId ? 'pointer' : 'default', color: 'var(--s-text)',
              fontSize: 11, display: 'flex', gap: 8, alignItems: 'baseline',
            }}
          >
            <span style={{ color: 'var(--s-text-muted)', fontFamily: 'var(--s-mono)', fontSize: 10 }}>
              {item.cluster}/{item.namespace}
            </span>
            <span style={{ fontWeight: 600 }}>{item.workload || '—'}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--s-text-dim)', fontSize: 10 }}>
              {item.actionsTaken} action{item.actionsTaken === 1 ? '' : 's'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
