import { useTranslation } from 'react-i18next'
import { FLEX_SPACER_STYLE, type CurrentBatch } from './types'

export interface BatchProcessingBannerProps {
  currentBatch: CurrentBatch
  onOpen: () => void
}

/** Clickable banner shown while a single batch of events is actively being solved,
 *  linking through to the BatchMonitorModal for a detailed view. */
export function BatchProcessingBanner({ currentBatch, onOpen }: BatchProcessingBannerProps) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onOpen}
      className="mx-1 mb-2.5 mt-1.5 px-3 py-2.5"
      style={{
        borderLeft: '3px solid var(--s-info)',
        background: 'rgba(99,150,237,0.08)',
        border: '1px solid rgba(99,150,237,0.3)',
        borderRadius: 'var(--s-r)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        width: 'calc(100% - 8px)',
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(99,150,237,0.12)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(99,150,237,0.08)'
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, height: 2, width: '100%',
        background: 'linear-gradient(90deg, transparent, var(--s-info), transparent)',
        animation: 'stellar-pulse 1.6s linear infinite',
      }} />
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 14 }}>⊙</span>
        <span
          className="font-mono text-xs"
          style={{
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--s-info)',
          }}
        >{t('stellar.batch.processingBatch')}</span>
        <div style={FLEX_SPACER_STYLE} />
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          color: 'var(--s-text-muted)',
        }}>
          {currentBatch.solvingCount}/{currentBatch.totalEvents} solving
        </span>
        <span style={{ fontSize: 11, color: 'var(--s-text-dim)' }}>→</span>
      </div>
      <div className="mt-1 text-xs leading-normal" style={{ color: 'var(--s-text)' }}>
        {t('stellar.batch.viewBatchMonitor')} — {currentBatch.solvingCount} event{currentBatch.solvingCount === 1 ? '' : 's'} actively solving
      </div>
    </button>
  )
}
