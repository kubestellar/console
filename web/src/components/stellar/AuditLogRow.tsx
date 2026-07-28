import { cn } from '../../lib/cn'
import type { StellarAuditEntry } from '../../types/stellar'

type AuditResult = 'success' | 'warning' | 'error'

export function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

export function deriveAuditResult(entry: StellarAuditEntry): AuditResult {
  const text = `${entry.action} ${entry.detail}`.toLowerCase()
  if (/(fail|error|reject|den(y|ied)|exhausted|rollback)/.test(text)) {
    return 'error'
  }
  if (/(warn|approval|pending|review|snooze|escalat)/.test(text)) {
    return 'warning'
  }
  return 'success'
}

export function getResourceLabel(entry: StellarAuditEntry): string {
  return `${entry.entityType}/${entry.entityId}`
}

export function getResultBadgeClassName(result: AuditResult): string {
  switch (result) {
    case 'error':
      return 'border border-red-400/25 bg-red-500/10 text-red-300'
    case 'warning':
      return 'border border-yellow-400/25 bg-yellow-500/10 text-yellow-300'
    case 'success':
    default:
      return 'border border-green-400/25 bg-green-500/10 text-green-300'
  }
}

export function getResultRowClassName(result: AuditResult): string {
  switch (result) {
    case 'error':
      return 'bg-red-500/5'
    case 'warning':
      return 'bg-yellow-500/5'
    case 'success':
    default:
      return 'bg-green-500/5'
  }
}

interface AuditLogRowProps {
  entry: StellarAuditEntry
  getResultLabel: (result: AuditResult) => string
}

export function AuditLogRow({ entry, getResultLabel }: AuditLogRowProps) {
  const result = deriveAuditResult(entry)
  return (
    <tr className={cn('align-top odd:bg-[var(--s-surface)] even:bg-[var(--s-surface-2)]/60', getResultRowClassName(result))}>
      <td className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-xs text-[var(--s-text-muted)]">
        <span className="whitespace-nowrap">{formatTimestamp(entry.ts)}</span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 text-sm text-[var(--s-text)]">
        <span className="line-clamp-1 break-all">{entry.userId}</span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-xs text-[var(--s-text)]">
        {entry.action}
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-xs text-[var(--s-text-muted)]">
        <span className="line-clamp-2 break-all">{getResourceLabel(entry)}</span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3">
        <span className={cn('inline-flex rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]', getResultBadgeClassName(result))}>
          {getResultLabel(result)}
        </span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 text-sm text-[var(--s-text-muted)]">
        {entry.cluster || '—'}
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 text-sm text-[var(--s-text-muted)]">
        <span className="line-clamp-2">{entry.detail}</span>
      </td>
    </tr>
  )
}
