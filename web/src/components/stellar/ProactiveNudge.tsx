import type { StellarObservation } from '../../types/stellar'

const PROACTIVE_NUDGE_CONTAINER_STYLE = { background: 'rgba(56,139,253,0.08)', border: '1px solid rgba(56,139,253,0.3)', borderRadius: 'var(--s-r)' }
const PROACTIVE_NUDGE_ICON_STYLE = { color: 'var(--s-brand)', fontSize: 13 }
const PROACTIVE_NUDGE_CONTENT_STYLE = { flex: 1 }
const PROACTIVE_NUDGE_SUMMARY_STYLE = { fontSize: 12, color: 'var(--s-text)' }
const PROACTIVE_NUDGE_BUTTON_STYLE = { background: 'none', border: 'none', cursor: 'pointer' as const, fontSize: 11, color: 'var(--s-brand)', padding: 0 }
const PROACTIVE_NUDGE_DETAILS_SUMMARY_STYLE = { fontSize: 10, color: 'var(--s-text-dim)', cursor: 'pointer' as const, userSelect: 'none' as const }
const PROACTIVE_NUDGE_REASONING_STYLE = { fontSize: 11, color: 'var(--s-text-muted)', lineHeight: 1.5 }
const PROACTIVE_NUDGE_DISMISS_STYLE = { background: 'none', border: 'none', cursor: 'pointer' as const, color: 'var(--s-text-dim)', fontSize: 12 }

interface ProactiveNudgeProps {
  nudge: StellarObservation
  onDismiss: () => void
  onApplySuggestion: (suggest: string) => void
}

export function ProactiveNudge({ nudge, onDismiss, onApplySuggestion }: ProactiveNudgeProps) {
  return (
    <div className="mx-2.5 mt-2 flex items-start gap-2 px-2.5 py-2" style={PROACTIVE_NUDGE_CONTAINER_STYLE}>
      <span style={PROACTIVE_NUDGE_ICON_STYLE}>●</span>
      <div style={PROACTIVE_NUDGE_CONTENT_STYLE}>
        <div style={PROACTIVE_NUDGE_SUMMARY_STYLE}>{nudge.summary}</div>
        {nudge.suggest && (
          <button
            onClick={() => onApplySuggestion(nudge.suggest || '')}
            className="mt-1"
            style={PROACTIVE_NUDGE_BUTTON_STYLE}
          >
            → {nudge.suggest}
          </button>
        )}
        {nudge.reasoning && (
          <details className="mt-1">
            <summary style={PROACTIVE_NUDGE_DETAILS_SUMMARY_STYLE}>
              why Stellar flagged this
            </summary>
            <div className="mt-1" style={PROACTIVE_NUDGE_REASONING_STYLE}>
              {nudge.reasoning}
            </div>
          </details>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss nudge"
        style={PROACTIVE_NUDGE_DISMISS_STYLE}
      >
        ✕
      </button>
    </div>
  )
}

