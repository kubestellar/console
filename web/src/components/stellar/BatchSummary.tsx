import { useTranslation } from 'react-i18next'
import { BatchProgressBar } from './BatchProgressBar'

const BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS = 'flex items-center gap-2'
const BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE = {
  fontFamily: 'var(--s-mono)',
  fontSize: 11,
  color: 'var(--s-text)',
} as const

interface BatchSummaryProps {
  summary: {
    resolved: number
    failed: number
    skipped: number
    inProgress: number
  }
  totalEvents: number
  status: 'in_progress' | 'completed' | 'failed'
  progressPercent: number
}

export function BatchSummary({ summary, totalEvents, status, progressPercent }: BatchSummaryProps) {
  const { t } = useTranslation()
  const hasFailed = summary.failed > 0

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
          {totalEvents} {t('stellar.batch.events', { count: totalEvents })}
        </span>
      </div>

      <BatchProgressBar
        progressPercent={progressPercent}
        status={status}
        hasFailed={hasFailed}
        progressLabel={t('stellar.batch.progressAriaLabel', { percent: progressPercent })}
      />

      <div className="flex flex-wrap gap-4">
        {summary.resolved > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-success)', fontSize: 14 }}>✓</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {summary.resolved} {t('stellar.batch.resolved')}
            </span>
          </div>
        )}
        {summary.failed > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-critical)', fontSize: 14 }}>✗</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {summary.failed} {t('stellar.batch.failed')}
            </span>
          </div>
        )}
        {summary.skipped > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-text-muted)', fontSize: 14 }}>–</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {summary.skipped} {t('stellar.batch.skipped')}
            </span>
          </div>
        )}
        {summary.inProgress > 0 && (
          <div className={BATCH_SUMMARY_BREAKDOWN_ITEM_CLASS}>
            <span aria-hidden="true" style={{ color: 'var(--s-info)', fontSize: 14 }}>⊙</span>
            <span style={BATCH_SUMMARY_BREAKDOWN_TEXT_STYLE}>
              {summary.inProgress} {t('stellar.batch.inProgress')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
