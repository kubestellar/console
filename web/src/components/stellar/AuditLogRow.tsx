import { cn } from '../../lib/cn'

interface AuditLogRowProps {
  timestamp: string
  userId: string
  action: string
  resourceLabel: string
  resultLabel: string
  resultBadgeClassName: string
  resultRowClassName: string
  cluster: string
  detail: string
}

export function AuditLogRow({
  timestamp,
  userId,
  action,
  resourceLabel,
  resultLabel,
  resultBadgeClassName,
  resultRowClassName,
  cluster,
  detail,
}: AuditLogRowProps) {
  return (
    <tr
      className={cn('align-top odd:bg-[var(--s-surface)] even:bg-[var(--s-surface-2)]/60', resultRowClassName)}
    >
      <td className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-xs text-[var(--s-text-muted)]">
        <span className="whitespace-nowrap">{timestamp}</span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 text-sm text-[var(--s-text)]">
        <span className="line-clamp-1 break-all">{userId}</span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-xs text-[var(--s-text)]">
        {action}
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-xs text-[var(--s-text-muted)]">
        <span className="line-clamp-2 break-all">{resourceLabel}</span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3">
        <span className={cn('inline-flex rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]', resultBadgeClassName)}>
          {resultLabel}
        </span>
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 text-sm text-[var(--s-text-muted)]">
        {cluster || '—'}
      </td>
      <td className="border-b border-[var(--s-border)] px-4 py-3 text-sm text-[var(--s-text-muted)]">
        <span className="line-clamp-2">{detail}</span>
      </td>
    </tr>
  )
}
