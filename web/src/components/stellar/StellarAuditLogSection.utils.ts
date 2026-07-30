import type { StellarAuditEntry } from '../../types/stellar'

export const AUDIT_FETCH_LIMIT = 100
export const ONE_DAY_MS = 24 * 60 * 60 * 1000
export const DATE_RANGE_OPTIONS = [
  { value: 'all', windowMs: null },
  { value: '24h', windowMs: ONE_DAY_MS },
  { value: '7d', windowMs: 7 * ONE_DAY_MS },
  { value: '30d', windowMs: 30 * ONE_DAY_MS },
] as const
export const EXPORT_FILENAME_PREFIX = 'stellar-audit-log'
export const TABLE_SORT_KEYS = {
  TIMESTAMP: 'ts',
  USER: 'userId',
  ACTION: 'action',
  RESOURCE: 'resource',
  RESULT: 'result',
} as const

export type DateRangeValue = (typeof DATE_RANGE_OPTIONS)[number]['value']
export type AuditResult = 'success' | 'warning' | 'error'
export type SortKey = (typeof TABLE_SORT_KEYS)[keyof typeof TABLE_SORT_KEYS]
export type SortDirection = 'asc' | 'desc'

export function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

export function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase()
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

export function toCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildCsv(
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
