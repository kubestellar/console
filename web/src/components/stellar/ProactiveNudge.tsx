import type { StellarObservation } from '../../types/stellar'

interface ProactiveNudgeProps {
  nudge: StellarObservation
  onDismiss: () => void
  onApplySuggestion: (suggest: string) => void
}

export function ProactiveNudge({ nudge, onDismiss, onApplySuggestion }: ProactiveNudgeProps) {
  return (
    <div style={{
      margin: '8px 10px 0',
      padding: '8px 10px',
      background: 'rgba(56,139,253,0.08)',
      border: '1px solid rgba(56,139,253,0.3)',
      borderRadius: 'var(--s-r)',
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
    }}>
      <span style={{ color: 'var(--s-brand)', fontSize: 13 }}>●</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--s-text)' }}>{nudge.summary}</div>
        {nudge.suggest && (
          <button
            onClick={() => onApplySuggestion(nudge.suggest || '')}
            style={{
              marginTop: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--s-brand)',
              padding: 0,
            }}
          >
            → {nudge.suggest}
          </button>
        )}
        {nudge.reasoning && (
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 10, color: 'var(--s-text-dim)', cursor: 'pointer', userSelect: 'none' }}>
              why Stellar flagged this
            </summary>
            <div style={{ fontSize: 11, color: 'var(--s-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              {nudge.reasoning}
            </div>
          </details>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss nudge"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--s-text-dim)',
          fontSize: 12,
        }}
      >
        ✕
      </button>
    </div>
  )
}

