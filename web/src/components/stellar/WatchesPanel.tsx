import { useState } from 'react'
import type { StellarNotification, StellarSolve, StellarWatch } from '../../types/stellar'
import { WatchCard } from './WatchCard'
import type { PendingAction } from './EventCard'
import { WatchDetailModal } from './WatchDetailModal'

interface Props {
  watches: StellarWatch[]
  onResolve: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
  onAction?: (prompt: string, action?: PendingAction) => void
  allNotifications?: StellarNotification[]
  solves?: StellarSolve[]
}

export function WatchesPanel({ watches, onResolve, onDismiss, onSnooze, onAction, allNotifications, solves }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [detailWatch, setDetailWatch] = useState<StellarWatch | null>(null)
  const active = (watches || []).filter(w => w.status === 'active')

  if (active.length === 0) return null // hide panel entirely when nothing watched

  return (
    <div style={{
      borderBottom: '1px solid var(--s-border)',
      flexShrink: 0,
    }}>
      {/* Title row */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--s-text-muted)',
        }}>
          Watching
        </span>
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-info)',
          background: 'rgba(56,139,253,0.1)',
          border: '1px solid rgba(56,139,253,0.25)',
          borderRadius: 10,
          padding: '0 5px',
        }}>
          {active.length}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>
          {collapsed ? '▾' : '▴'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 8px 8px' }}>
          {active.map(w => (
            <WatchCard
              key={w.id}
              watch={w}
              allNotifications={allNotifications}
              solves={solves}
              onResolve={onResolve}
              onDismiss={onDismiss}
              onSnooze={onSnooze}
              onAction={onAction}
              onOpenDetail={setDetailWatch}
            />
          ))}
        </div>
      )}

      {detailWatch && (
        <WatchDetailModal
          watch={detailWatch}
          allNotifications={allNotifications || []}
          solves={solves || []}
          onClose={() => setDetailWatch(null)}
          onResolve={onResolve}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          onAction={onAction}
        />
      )}
    </div>
  )
}