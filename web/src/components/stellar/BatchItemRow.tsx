import { useCallback, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { BatchEvent } from './BatchMonitorModal'

const FLEX_MIN_WIDTH_STYLE = { flex: 1, minWidth: 0 } as const

function getStatusIcon(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return '⏳'
    case 'in_progress': return '⊙'
    case 'resolved': return '✓'
    case 'failed': return '✗'
    case 'skipped': return '–'
    default: return '•'
  }
}

function getStatusColor(status: BatchEvent['status']): string {
  switch (status) {
    case 'pending': return 'var(--s-text-dim)'
    case 'in_progress': return 'var(--s-info)'
    case 'resolved': return 'var(--s-success)'
    case 'failed': return 'var(--s-critical)'
    case 'skipped': return 'var(--s-text-muted)'
    default: return 'var(--s-text)'
  }
}

function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

interface BatchItemRowProps {
  event: BatchEvent
}

export function BatchItemRow({ event }: BatchItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const hasSteps = event.steps.length > 0

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (event.steps.length > 0) setExpanded(x => !x)
    }
  }, [event.steps.length])

  return (
    <div
      style={{
        border: '1px solid var(--s-border)',
        borderRadius: 'var(--s-rs)',
        background: event.status === 'in_progress' ? 'rgba(99,150,237,0.05)' : 'var(--s-surface-1)',
        overflow: 'hidden',
      }}
    >
      <div
        role={hasSteps ? 'button' : undefined}
        tabIndex={hasSteps ? 0 : undefined}
        aria-expanded={hasSteps ? expanded : undefined}
        onClick={hasSteps ? () => setExpanded(x => !x) : undefined}
        onKeyDown={hasSteps ? handleKeyDown : undefined}
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{
          cursor: hasSteps ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 14, color: getStatusColor(event.status), flexShrink: 0 }}>
          {getStatusIcon(event.status)}
        </span>

        <div style={FLEX_MIN_WIDTH_STYLE}>
          <div className="mb-0.5" style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--s-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {event.name}
          </div>
          {event.step && (
            <div style={{ fontFamily: 'var(--s-mono)', fontSize: 10, color: 'var(--s-text-muted)' }}>
              {event.step}
            </div>
          )}
          {event.failureReason && (
            <div className="mt-0.5" style={{ fontSize: 10, color: 'var(--s-critical)' }}>
              {event.failureReason}
            </div>
          )}
        </div>

        <div style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-text-dim)',
          flexShrink: 0,
        }}>
          {formatElapsedSeconds(event.durationSeconds)}
        </div>

        {hasSteps && (
          <span
            aria-hidden="true"
            style={{
              fontSize: 10,
              color: 'var(--s-text-dim)',
              flexShrink: 0,
              transition: 'transform 0.15s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            ▾
          </span>
        )}
      </div>

      {expanded && hasSteps && (
        <div className="flex flex-col gap-2 px-3 pb-3 pl-6 pt-2.5" style={{ borderTop: '1px solid var(--s-border)' }}>
          <div className="mb-1" style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--s-text-muted)',
          }}>
            {t('stellar.batch.resolutionSteps')}
          </div>
          {(event.steps || []).map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-px" style={{
                fontSize: 12,
                flexShrink: 0,
                color: step.status === 'completed' ? 'var(--s-success)'
                  : step.status === 'failed' ? 'var(--s-critical)'
                  : step.status === 'in_progress' ? 'var(--s-info)'
                  : 'var(--s-text-dim)',
              }}>
                {step.status === 'completed' ? '✓'
                  : step.status === 'failed' ? '✗'
                  : step.status === 'in_progress' ? '⊙'
                  : '○'}
              </span>
              <div style={FLEX_MIN_WIDTH_STYLE}>
                <div style={{
                  fontSize: 11,
                  color: step.status === 'pending' ? 'var(--s-text-dim)' : 'var(--s-text)',
                  fontWeight: step.status === 'in_progress' ? 600 : 400,
                }}>
                  {step.name}
                </div>
                {step.output && (
                  <div className="mt-0.5" style={{
                    fontFamily: 'var(--s-mono)',
                    fontSize: 10,
                    color: 'var(--s-text-muted)',
                    wordBreak: 'break-all',
                  }}>
                    {step.output}
                  </div>
                )}
                {step.error && (
                  <div className="mt-0.5" style={{
                    fontFamily: 'var(--s-mono)',
                    fontSize: 10,
                    color: 'var(--s-critical)',
                  }}>
                    {step.error}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
