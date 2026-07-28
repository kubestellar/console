import { FLEX_SPACER_STYLE } from './types'

export interface EventsPanelHeaderProps {
  unreadCount: number
  hasNotifications: boolean
  onDismissAll: () => void
}

/** Panel header: "Events" label, unread count badge, and "clear all" action. */
export function EventsPanelHeader({ unreadCount, hasNotifications, onDismissAll }: EventsPanelHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2" style={{
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
      {unreadCount > 0 && (
        <span className="px-1.5" style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--s-warning)',
          background: 'rgba(227,179,65,0.12)',
          border: '1px solid rgba(227,179,65,0.3)',
          borderRadius: 10,
        }}>
          {unreadCount} new
        </span>
      )}
      <div style={FLEX_SPACER_STYLE} />
      {hasNotifications && (
        <button
          onClick={onDismissAll}
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
  )
}
