const BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS = 'flex items-center gap-2'
const BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE = {
  fontFamily: 'var(--s-mono)',
  fontSize: 11,
  color: 'var(--s-text)',
} as const

interface BatchSummaryLabels {
  summary: string
  events: string
  resolved: string
  failed: string
  skipped: string
  inProgress: string
}

interface BatchSummaryProps {
  totalEvents: number
  resolved: number
  failed: number
  skipped: number
  inProgress: number
  labels: BatchSummaryLabels
  children?: ReactNode
}

export function BatchSummary({ totalEvents, resolved, failed, skipped, inProgress, labels, children }: BatchSummaryProps) {
  return (
    <>
      <div className="mb-3 flex items-center gap-4">
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 11, fontWeight: 600,
          color: 'var(--s-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {labels.summary}
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
          {totalEvents} {labels.events}
        </span>
      </div>

      {children}

      <div className="flex flex-wrap gap-4">
        {resolved > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-success)', fontSize: 14 }}>✓</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {resolved} {labels.resolved}
            </span>
          </div>
        )}
        {failed > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-critical)', fontSize: 14 }}>✗</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {failed} {labels.failed}
            </span>
          </div>
        )}
        {skipped > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-text-muted)', fontSize: 14 }}>–</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {skipped} {labels.skipped}
            </span>
          </div>
        )}
        {inProgress > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-info)', fontSize: 14 }}>⊙</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {inProgress} {labels.inProgress}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
import type { ReactNode } from 'react'
