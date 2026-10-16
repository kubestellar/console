import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const BODY_TEXT_STYLE = { fontSize: 13, lineHeight: 1.55, color: 'var(--s-text)' } as const

const STAT_BOX_STYLE = {
  background: 'var(--s-surface-2)', border: '1px solid var(--s-border)',
  borderRadius: 'var(--s-rs)',
} as const
const STAT_LABEL_STYLE = { fontSize: 9, color: 'var(--s-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' } as const
const SECTION_HEADER_STYLE = {
  fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--s-text-muted)',
} as const
const RECOMMENDATION_BOX_STYLE = {
  border: '1px solid var(--s-border)', borderRadius: 'var(--s-r)',
} as const
const RECOMMENDATION_LABEL_STYLE = { fontSize: 13, fontWeight: 600 } as const
const RECOMMENDATION_RATIONALE_STYLE = { fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.5 } as const

export function Tag({ label, color, highlighted }: { label: string; color: string; highlighted?: boolean }) {
  return (
    <span className="px-1.5 py-0.5" style={{
      fontSize: 10, fontFamily: 'var(--s-mono)',
      borderRadius: 10,
      background: highlighted ? `${color}22` : 'var(--s-surface-2)',
      color: highlighted ? color : 'var(--s-text-muted)',
      border: `1px solid ${highlighted ? color : 'var(--s-border)'}`,
    }}>{label}</span>
  )
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="px-2 py-1.5" style={STAT_BOX_STYLE}>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent ?? 'var(--s-text)', fontFamily: 'var(--s-mono)' }}>{value}</div>
      <div className="mt-0.5" style={STAT_LABEL_STYLE}>{label}</div>
    </div>
  )
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-1.5 mt-2.5" style={SECTION_HEADER_STYLE}>{title}</div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <SectionHeader title={title} />
      <div style={BODY_TEXT_STYLE}>{children}</div>
    </div>
  )
}

export function Recommendation({
  label, rationale, confidence, color, onExecute,
}: { label: string; rationale: string; confidence: number; color: string; onExecute: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="mb-2 px-3 py-2.5" style={RECOMMENDATION_BOX_STYLE}>
      <div className="mb-1 flex items-center gap-2">
        <span style={RECOMMENDATION_LABEL_STYLE}>{label}</span>
        <span style={{
          fontSize: 10, fontFamily: 'var(--s-mono)',
          color: confidence >= 80 ? 'var(--s-success)' : confidence >= 60 ? 'var(--s-warning)' : 'var(--s-text-muted)',
        }}>
          confidence: {confidence}%
        </span>
      </div>
      <div className="mb-2" style={RECOMMENDATION_RATIONALE_STYLE}>
        {rationale}
      </div>
      <button
        onClick={onExecute}
        className="px-3 py-1"
        style={{
          background: 'none', border: `1px solid ${color}`, color,
          borderRadius: 'var(--s-rs)',
          fontSize: 11, cursor: 'pointer',
        }}
      >{t('stellar.watchDetail.executeViaChat')}</button>
    </div>
  )
}
