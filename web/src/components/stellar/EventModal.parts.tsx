import type { ReactNode } from 'react'
import { CONFIRMATION_TEXTAREA_ROWS, type TimelineEntry, formatAbsoluteUtc, formatRelative } from './EventModal.utils'

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="px-2 py-0.5" style={{
      border: `1px solid ${color}`,
      color,
      borderRadius: 999,
      background: 'var(--s-surface-2)',
    }}>
      {children}
    </span>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--s-text-muted)]">{title}</div>
      <div className="rounded border border-[var(--s-border)] bg-[var(--s-surface)] p-3 text-sm leading-6 text-[var(--s-text)]">
        {children}
      </div>
    </section>
  )
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-[var(--s-text-muted)]">No timeline entries recorded yet.</div>
  }
  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <div key={`${entry.label}-${entry.ts}`} className="border-l-2 border-[var(--s-border)] pl-3">
          <div className="text-xs font-mono text-[var(--s-text-muted)]">{formatAbsoluteUtc(entry.ts)} · {formatRelative(entry.ts)}</div>
          <div className="text-sm font-medium">{entry.label}</div>
          <div className="text-sm text-[var(--s-text-muted)]">{entry.detail}</div>
        </div>
      ))}
    </div>
  )
}

export function ListBlock({ items, emptyText }: { items: { id: string; title: string; subtitle: string }[]; emptyText: string }) {
  if (items.length === 0) {
    return <div className="text-[var(--s-text-muted)]">{emptyText}</div>
  }
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.id} className="rounded border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2">
          <div className="text-sm font-medium">{item.title}</div>
          <div className="text-xs text-[var(--s-text-muted)]">{item.subtitle}</div>
        </div>
      ))}
    </div>
  )
}

export function ActionButton({ children, color, disabled = false, onClick }: { children: ReactNode; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${color}`,
        color,
        background: 'var(--s-surface-2)',
        borderRadius: 8,
        opacity: disabled ? 0.5 : 1,
      }}
      className="px-3 py-1.5 text-sm font-medium"
    >
      {children}
    </button>
  )
}

export function ConfirmationPanel({
  title,
  description,
  value,
  onChange,
  placeholder,
  onCancel,
  onConfirm,
  confirmLabel,
  isSubmitting,
}: {
  title: string
  description: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  isSubmitting: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-[var(--s-text-muted)]">{description}</div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={CONFIRMATION_TEXTAREA_ROWS}
        className="w-full rounded border border-[var(--s-border)] bg-[var(--s-surface)] px-3 py-2 text-sm text-[var(--s-text)]"
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={onCancel} color="var(--s-text-muted)">Cancel</ActionButton>
        <ActionButton onClick={onConfirm} color="var(--s-warning)" disabled={isSubmitting}>{isSubmitting ? 'Working…' : confirmLabel}</ActionButton>
      </div>
    </div>
  )
}
