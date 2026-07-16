import type { StellarWatch } from '../../../types/stellar'
import { Tag } from './WatchDetailPrimitives'
import { formatDuration } from './helpers'

interface WatchDetailHeaderProps {
  watch: StellarWatch
  titleId: string
  color: string
  dominantSeverity: string
  isRecurring: boolean
  isStale: boolean | '' | null
  canRestart: boolean
  watchAgeMs: number
  onClose: () => void
}

export function WatchDetailHeader({
  watch,
  titleId,
  color,
  dominantSeverity,
  isRecurring,
  isStale,
  canRestart,
  watchAgeMs,
  onClose,
}: WatchDetailHeaderProps) {
  return (
    <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--s-border)', flexShrink: 0 }}>
      <div className="flex items-start gap-2.5">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Watch · {watch.resourceKind} · watching for {formatDuration(watchAgeMs)}
          </div>
          <div id={titleId} style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>
            {watch.namespace}/{watch.resourceName}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)', marginTop: 4 }}>
            {watch.cluster}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-0.5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--s-text-dim)' }}
          title="Close (Esc)"
          aria-label="Close"
        >✕</button>
      </div>

      {/* Tags */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Tag label={dominantSeverity} color={color} highlighted />
        <Tag label={watch.status} color="var(--s-text-muted)" />
        {isRecurring && <Tag label="recurring" color="var(--s-warning)" />}
        {isStale && <Tag label="stale" color="var(--s-warning)" />}
        {canRestart && <Tag label="auto-fixable" color="var(--s-success)" />}
      </div>
    </div>
  )
}
