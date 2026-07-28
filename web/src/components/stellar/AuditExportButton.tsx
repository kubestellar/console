import type { StellarAuditEntry } from '../../types/stellar'
import { deriveAuditResult, formatTimestamp, getResourceLabel } from './AuditLogRow'

type AuditResult = 'success' | 'warning' | 'error'

const EXPORT_FILENAME_PREFIX = 'stellar-audit-log'

function toCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv(
  entries: StellarAuditEntry[],
  columns: readonly string[],
  getResultLabel: (result: AuditResult) => string,
): string {
  const header = (columns || []).join(',')
  const rows = entries.map(entry => [
    formatTimestamp(entry.ts),
    entry.userId,
    entry.action,
    getResourceLabel(entry),
    getResultLabel(deriveAuditResult(entry)),
    entry.cluster || '—',
    entry.detail,
  ].map(value => toCsvField(value)).join(','))

  return [header, ...rows].join('\n')
}

export function exportEntries(
  entries: StellarAuditEntry[],
  columns: readonly string[],
  getResultLabel: (result: AuditResult) => string,
): void {
  const blob = new Blob([buildCsv(entries, columns, getResultLabel)], { type: 'text/csv;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  link.href = href
  link.download = `${EXPORT_FILENAME_PREFIX}-${stamp}.csv`
  link.click()
  URL.revokeObjectURL(href)
}

interface AuditExportButtonProps {
  entries: StellarAuditEntry[]
  csvColumns: readonly string[]
  getResultLabel: (result: AuditResult) => string
  label: string
}

export function AuditExportButton({ entries, csvColumns, getResultLabel, label }: AuditExportButtonProps) {
  return (
    <button
      type="button"
      onClick={() => exportEntries(entries, csvColumns, getResultLabel)}
      disabled={entries.length === 0}
      className="inline-flex items-center justify-center rounded-md border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2 text-sm font-medium text-[var(--s-text)] transition hover:border-[var(--s-border-focus)] hover:text-[var(--s-text)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  )
}
