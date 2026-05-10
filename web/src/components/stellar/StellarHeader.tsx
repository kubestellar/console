interface Props {
  isConnected: boolean
  unreadCount: number
  clusterCount: number
  onCollapse: () => void
}

export function StellarHeader({ isConnected, unreadCount, clusterCount, onCollapse }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '9px 12px',
      background: 'var(--s-bg)',
      borderBottom: '1px solid var(--s-border)',
      flexShrink: 0,
    }}>
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        flexShrink: 0,
        background: isConnected ? 'var(--s-success)' : 'var(--s-text-dim)',
        boxShadow: isConnected ? '0 0 6px var(--s-success)' : 'none',
        transition: 'all 0.3s',
      }} />

      <span style={{
        fontFamily: 'var(--s-mono)',
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: '0.12em',
        color: 'var(--s-brand)',
      }}>
        STELLAR
      </span>

      {clusterCount > 0 && (
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-text-muted)',
          background: 'var(--s-surface-2)',
          border: '1px solid var(--s-border-muted)',
          borderRadius: 'var(--s-rs)',
          padding: '1px 6px',
        }}>
          {clusterCount} cluster{clusterCount !== 1 ? 's' : ''}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {unreadCount > 0 && (
        <div style={{
          background: 'var(--s-critical)',
          color: '#fff',
          borderRadius: 10,
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 6px',
          minWidth: 18,
          textAlign: 'center',
        }}>
          {unreadCount}
        </div>
      )}

      <button
        onClick={onCollapse}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--s-text-dim)',
          fontSize: 14,
          padding: 2,
          lineHeight: 1,
          borderRadius: 'var(--s-rs)',
          transition: 'color var(--s-t)',
        }}
        title="Collapse"
      >
        ▸
      </button>
    </div>
  )
}
