import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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
    <div className="px-2 py-1.5" style={{
      background: 'var(--s-surface-2)', border: '1px solid var(--s-border)',
      borderRadius: 'var(--s-rs)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent ?? 'var(--s-text)', fontFamily: 'var(--s-mono)' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--s-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-1.5 mt-2.5" style={{
      fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--s-text-muted)',
    }}>{title}</div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <SectionHeader title={title} />
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--s-text)' }}>{children}</div>
    </div>
  )
}

export function Recommendation({
  label, rationale, confidence, color, onExecute,
}: { label: string; rationale: string; confidence: number; color: string; onExecute: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="mb-2 px-3 py-2.5" style={{
      border: '1px solid var(--s-border)', borderRadius: 'var(--s-r)',
    }}>
      <div className="mb-1 flex items-center gap-2">
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{
          fontSize: 10, fontFamily: 'var(--s-mono)',
          color: confidence >= 80 ? 'var(--s-success)' : confidence >= 60 ? 'var(--s-warning)' : 'var(--s-text-muted)',
        }}>
          confidence: {confidence}%
        </span>
      </div>
      <div className="mb-2" style={{ fontSize: 12, color: 'var(--s-text-muted)', lineHeight: 1.5 }}>
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
