import type { ReactNode } from 'react'

export interface TimelineEntry {
  ts: string
  label: string
  detail: string
}

export function formatAbsoluteUtc(value?: string): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC'
}

export function formatRelative(value?: string): string {
  if (!value) return 'just now'
  const ms = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
