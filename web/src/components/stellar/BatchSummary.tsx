import { useTranslation } from 'react-i18next'
import {
  BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS,
  BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE,
  type BatchProcessing,
} from './BatchMonitorModal.utils'

interface BatchSummaryProps {
  batch: BatchProcessing
  progressPercent: number
}

/**
 * Summary header for BatchMonitorModal — total event count, progress bar,
 * and the resolved/failed/skipped/in-progress breakdown chips.
 * Extracted from BatchMonitorModal.tsx — no behaviour change.
 */
export function BatchSummary({ batch, progressPercent }: BatchSummaryProps) {
  const { t } = useTranslation()

  return (
    <div className="px-5 py-4" style={{
      borderBottom: '1px solid var(--s-border)',
      background: 'var(--s-surface-1)', flexShrink: 0,
    }}>
      <div className="mb-3 flex items-center gap-4">
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 11, fontWeight: 600,
          color: 'var(--s-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {t('stellar.batch.summary')}
        </span>
        <span style={{ fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text)' }}>
          {batch.totalEvents} {t('stellar.batch.events', { count: batch.totalEvents })}
        </span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('stellar.batch.progressAriaLabel', { percent: progressPercent })}
        className="mb-3"
        style={{
          width: '100%', height: 8,
          background: 'var(--s-surface-2)',
          borderRadius: 4, overflow: 'hidden',
        }}
      >
        <div style={{
          width: `${progressPercent}%`, height: '100%',
          background: batch.status === 'completed' && batch.summary.failed === 0
            ? 'var(--s-success)'
            : batch.summary.failed > 0 ? 'var(--s-warning)' : 'var(--s-info)',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Breakdown */}
      <div className="flex flex-wrap gap-4">
        {batch.summary.resolved > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-success)', fontSize: 14 }}>✓</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {batch.summary.resolved} {t('stellar.batch.resolved')}
            </span>
          </div>
        )}
        {batch.summary.failed > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-critical)', fontSize: 14 }}>✗</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {batch.summary.failed} {t('stellar.batch.failed')}
            </span>
          </div>
        )}
        {batch.summary.skipped > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-text-muted)', fontSize: 14 }}>–</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {batch.summary.skipped} {t('stellar.batch.skipped')}
            </span>
          </div>
        )}
        {batch.summary.inProgress > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-info)', fontSize: 14 }}>⊙</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {batch.summary.inProgress} {t('stellar.batch.inProgress')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
