import type { CatchUpState } from '../../hooks/useStellar'

interface Props {
  catchUp: CatchUpState
  onDismiss: () => void
}

export function CatchUpBanner({ catchUp, onDismiss }: Props) {
  const isClean = catchUp.kind === 'clean'
  return (
    <div style={{
      margin: '8px 10px 0',
      padding: '10px 12px',
      background: isClean ? 'rgba(63,185,80,0.07)' : 'rgba(56,139,253,0.07)',
      border: `1px solid ${isClean ? 'rgba(63,185,80,0.25)' : 'rgba(56,139,253,0.25)'}`,
      borderRadius: 'var(--s-r)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span className="text-sm" style={{ flexShrink: 0 }}>{isClean ? '✦' : '◉'}</span>
        <div style={{ flex: 1 }}>
          <div
            className="font-mono text-xs"
            style={{
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isClean ? 'var(--s-success)' : 'var(--s-info)',
              marginBottom: 4,
            }}
          >
            While you were away
          </div>
          <div className="text-xs" style={{ color: 'var(--s-text)', lineHeight: 1.55 }}>
            {catchUp.summary}
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss catch-up summary"
          className="text-xs"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--s-text-dim)',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
