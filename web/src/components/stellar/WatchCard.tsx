import type { StellarWatch } from '../../types/stellar'

interface Props {
  watch: StellarWatch
  onResolve: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
}

function isStale(lastChecked: string): boolean {
  return Date.now() - new Date(lastChecked).getTime() > 10 * 60 * 1000 // 10 minutes
}

function getRelativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h`
}

export function WatchCard({ watch, onResolve, onDismiss, onSnooze }: Props) {
  return (
    <div style={{
      padding: '7px 10px',
      background: 'var(--s-surface-2)',
      border: '1px solid var(--s-border)',
      borderLeftWidth: 3,
      borderLeftColor: 'var(--s-info)',
      borderRadius: 'var(--s-r)',
      marginBottom: 4,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Pulse dot */}
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: 'var(--s-info)',
          boxShadow: '0 0 0 3px rgba(56,139,253,0.15)',
          animation: 's-pulse 2s ease-in-out infinite',
        }} />
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--s-text)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {watch.namespace}/{watch.resourceName}
        </span>
        <button
          onClick={() => onSnooze(watch.id, 60)}
          title="Snooze 1h"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--s-text-dim)',
            padding: '0 3px',
          }}
        >⏸</button>
        <button
          onClick={() => onResolve(watch.id)}
          title="Mark resolved"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--s-success)',
            padding: '0 3px',
          }}
        >✓</button>
        <button
          onClick={() => onDismiss(watch.id)}
          title="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--s-text-dim)',
            padding: '0 3px',
          }}
        >✕</button>
      </div>

      {/* Meta */}
      <div style={{
        fontSize: 10,
        color: 'var(--s-text-muted)',
        marginTop: 2,
        paddingLeft: 13,
        fontFamily: 'var(--s-mono)',
      }}>
        {watch.resourceKind} · {watch.cluster}
      </div>

      {/* Reason */}
      {watch.reason && (
        <div style={{
          fontSize: 11,
          color: 'var(--s-text-dim)',
          marginTop: 3,
          paddingLeft: 13,
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          {watch.reason}
        </div>
      )}

      {/* Last update from observer */}
      {watch.lastUpdate && (
        <div style={{
          fontSize: 11,
          color: 'var(--s-text-muted)',
          marginTop: 4,
          background: 'rgba(56,139,253,0.05)',
          borderRadius: 'var(--s-rs)',
          padding: '3px 6px 3px 13px',
        }}>
          {watch.lastUpdate}
        </div>
      )}

      {/* Stale indicator */}
      {watch.lastChecked && isStale(watch.lastChecked) && (
        <div style={{ fontSize: 10, color: 'var(--s-warning)', paddingLeft: 13, marginTop: 2 }}>
          ⚠ last checked {getRelativeTime(watch.lastChecked)} ago
        </div>
      )}
    </div>
  )
}
