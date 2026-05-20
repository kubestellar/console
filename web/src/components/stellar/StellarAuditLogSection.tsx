import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { stellarApi } from '../../services/stellar'
import type { StellarAuditEntry } from '../../types/stellar'
import { cn } from '../../lib/cn'

const AUDIT_FETCH_LIMIT = 100
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const DATE_RANGE_OPTIONS = [
  { value: 'all', windowMs: null },
  { value: '24h', windowMs: ONE_DAY_MS },
  { value: '7d', windowMs: 7 * ONE_DAY_MS },
  { value: '30d', windowMs: 30 * ONE_DAY_MS },
] as const
const EXPORT_FILENAME_PREFIX = 'stellar-audit-log'
const TABLE_SORT_KEYS = {
  TIMESTAMP: 'ts',
  USER: 'userId',
  ACTION: 'action',
  RESOURCE: 'resource',
  RESULT: 'result',
} as const

type DateRangeValue = (typeof DATE_RANGE_OPTIONS)[number]['value']
type AuditResult = 'success' | 'warning' | 'error'
type SortKey = (typeof TABLE_SORT_KEYS)[keyof typeof TABLE_SORT_KEYS]
type SortDirection = 'asc' | 'desc'

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase()
}

function deriveAuditResult(entry: StellarAuditEntry): AuditResult {
  const text = `${entry.action} ${entry.detail}`.toLowerCase()
  if (/(fail|error|reject|den(y|ied)|exhausted|rollback)/.test(text)) {
    return 'error'
  }
  if (/(warn|approval|pending|review|snooze|escalat)/.test(text)) {
    return 'warning'
  }
  return 'success'
}

function getResourceLabel(entry: StellarAuditEntry): string {
  return `${entry.entityType}/${entry.entityId}`
}

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

function exportEntries(
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

function getResultBadgeClassName(result: AuditResult): string {
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

function getResultRowClassName(result: AuditResult): string {
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

interface StellarAuditLogSectionProps {
  className?: string
}

export function StellarAuditLogSection({ className }: StellarAuditLogSectionProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<StellarAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState('all')
  const [selectedAction, setSelectedAction] = useState('all')
  const [selectedRange, setSelectedRange] = useState<DateRangeValue>('7d')
  const [sortKey, setSortKey] = useState<SortKey>(TABLE_SORT_KEYS.TIMESTAMP)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const dateRangeOptions = [
    { label: t('stellar.auditLog.dateRanges.allTime'), value: 'all', windowMs: null },
    { label: t('stellar.auditLog.dateRanges.last24Hours'), value: '24h', windowMs: ONE_DAY_MS },
    { label: t('stellar.auditLog.dateRanges.last7Days'), value: '7d', windowMs: 7 * ONE_DAY_MS },
    { label: t('stellar.auditLog.dateRanges.last30Days'), value: '30d', windowMs: 30 * ONE_DAY_MS },
  ] as const

  const columnLabels = {
    timestamp: t('stellar.auditLog.columns.timestamp'),
    user: t('stellar.auditLog.columns.user'),
    action: t('stellar.auditLog.columns.action'),
    resource: t('stellar.auditLog.columns.resource'),
    result: t('stellar.auditLog.columns.result'),
    cluster: t('stellar.auditLog.columns.cluster'),
    detail: t('stellar.auditLog.columns.detail'),
  }

  const csvColumns = [
    columnLabels.timestamp,
    columnLabels.user,
    columnLabels.action,
    columnLabels.resource,
    columnLabels.result,
    columnLabels.cluster,
    columnLabels.detail,
  ] as const

  const getResultLabel = (result: AuditResult): string => t(`stellar.auditLog.results.${result}`)

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()

    stellarApi.getAuditLog(AUDIT_FETCH_LIMIT, controller.signal)
      .then(data => {
        if (!mounted) {
          return
        }
        setEntries(data)
        setError(null)
      })
      .catch(fetchError => {
        if (!mounted || controller.signal.aborted) {
          return
        }
        const message = fetchError instanceof Error ? fetchError.message : t('stellar.auditLog.loadError')
        setError(message)
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
      controller.abort()
    }
  }, [t])

  const users = useMemo(() => {
    return Array.from(new Set((entries || []).map(entry => entry.userId).filter(Boolean))).sort((left, right) => left.localeCompare(right))
  }, [entries])

  const actions = useMemo(() => {
    return Array.from(new Set((entries || []).map(entry => entry.action).filter(Boolean))).sort((left, right) => left.localeCompare(right))
  }, [entries])

  const filteredEntries = useMemo(() => {
    const selectedWindow = dateRangeOptions.find(option => option.value === selectedRange)?.windowMs ?? null
    const threshold = selectedWindow == null ? null : Date.now() - selectedWindow

    return (entries || []).filter(entry => {
      if (selectedUser !== 'all' && entry.userId !== selectedUser) {
        return false
      }
      if (selectedAction !== 'all' && entry.action !== selectedAction) {
        return false
      }
      if (threshold != null && new Date(entry.ts).getTime() < threshold) {
        return false
      }
      return true
    })
  }, [dateRangeOptions, entries, selectedAction, selectedRange, selectedUser])

  const sortedEntries = useMemo(() => {
    const nextEntries = [...filteredEntries]
    nextEntries.sort((left, right) => {
      const leftResult = deriveAuditResult(left)
      const rightResult = deriveAuditResult(right)
      const leftValue = (() => {
        switch (sortKey) {
          case TABLE_SORT_KEYS.USER:
            return normalizeText(left.userId)
          case TABLE_SORT_KEYS.ACTION:
            return normalizeText(left.action)
          case TABLE_SORT_KEYS.RESOURCE:
            return normalizeText(getResourceLabel(left))
          case TABLE_SORT_KEYS.RESULT:
            return leftResult
          case TABLE_SORT_KEYS.TIMESTAMP:
          default:
            return String(new Date(left.ts).getTime())
        }
      })()
      const rightValue = (() => {
        switch (sortKey) {
          case TABLE_SORT_KEYS.USER:
            return normalizeText(right.userId)
          case TABLE_SORT_KEYS.ACTION:
            return normalizeText(right.action)
          case TABLE_SORT_KEYS.RESOURCE:
            return normalizeText(getResourceLabel(right))
          case TABLE_SORT_KEYS.RESULT:
            return rightResult
          case TABLE_SORT_KEYS.TIMESTAMP:
          default:
            return String(new Date(right.ts).getTime())
        }
      })()

      const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true })
      return sortDirection === 'asc' ? comparison : comparison * -1
    })
    return nextEntries
  }, [filteredEntries, sortDirection, sortKey])

  const toggleSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === TABLE_SORT_KEYS.TIMESTAMP ? 'desc' : 'asc')
  }

  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-surface)] text-[var(--s-text)] shadow-lg shadow-black/20',
      className,
    )}>
      <div className="flex flex-col gap-4 border-b border-[var(--s-border)] px-4 py-4 md:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[var(--s-brand)]">
                {t('stellar.auditLog.title')}
              </span>
              <span className="rounded-full border border-[var(--s-border-muted)] bg-[var(--s-surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--s-text-muted)]">
                {t('stellar.auditLog.rows', { count: sortedEntries.length })}
              </span>
            </div>
            <p className="text-sm text-[var(--s-text-muted)]">
              {t('stellar.auditLog.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportEntries(sortedEntries, csvColumns, getResultLabel)}
            disabled={sortedEntries.length === 0}
            className="inline-flex items-center justify-center rounded-md border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2 text-sm font-medium text-[var(--s-text)] transition hover:border-[var(--s-border-focus)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('stellar.auditLog.exportCsv')}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs text-[var(--s-text-muted)]">
            <span className="font-mono uppercase tracking-[0.12em]">{t('stellar.auditLog.filters.user')}</span>
            <select
              value={selectedUser}
              onChange={event => setSelectedUser(event.target.value)}
              className="rounded-md border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2 text-sm text-[var(--s-text)] outline-none transition focus:border-[var(--s-border-focus)]"
            >
              <option value="all">{t('stellar.auditLog.allUsers')}</option>
              {users.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs text-[var(--s-text-muted)]">
            <span className="font-mono uppercase tracking-[0.12em]">{t('stellar.auditLog.filters.action')}</span>
            <select
              value={selectedAction}
              onChange={event => setSelectedAction(event.target.value)}
              className="rounded-md border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2 text-sm text-[var(--s-text)] outline-none transition focus:border-[var(--s-border-focus)]"
            >
              <option value="all">{t('stellar.auditLog.allActions')}</option>
              {actions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 text-xs text-[var(--s-text-muted)]">
            <span className="font-mono uppercase tracking-[0.12em]">{t('stellar.auditLog.filters.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              {dateRangeOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedRange(option.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition',
                    selectedRange === option.value
                      ? 'border-[var(--s-border-focus)] bg-blue-500/10 text-blue-300'
                      : 'border-[var(--s-border)] bg-[var(--s-surface-2)] text-[var(--s-text-muted)] hover:text-[var(--s-text)]',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="s-scroll max-h-[28rem] overflow-auto">
        {loading && (
          <div className="px-4 py-6 text-sm text-[var(--s-text-muted)]">{t('stellar.auditLog.loading')}</div>
        )}
        {!loading && error && (
          <div className="px-4 py-6 text-sm text-red-300">{error}</div>
        )}
        {!loading && !error && sortedEntries.length === 0 && (
          <div className="px-4 py-6 text-sm text-[var(--s-text-muted)]">{t('stellar.auditLog.empty')}</div>
        )}
        {!loading && !error && sortedEntries.length > 0 && (
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--s-surface)]/95 backdrop-blur">
              <tr>
                {[
                  { label: columnLabels.timestamp, key: TABLE_SORT_KEYS.TIMESTAMP },
                  { label: columnLabels.user, key: TABLE_SORT_KEYS.USER },
                  { label: columnLabels.action, key: TABLE_SORT_KEYS.ACTION },
                  { label: columnLabels.resource, key: TABLE_SORT_KEYS.RESOURCE },
                  { label: columnLabels.result, key: TABLE_SORT_KEYS.RESULT },
                  { label: columnLabels.cluster, key: null },
                  { label: columnLabels.detail, key: null },
                ].map(column => (
                  <th
                    key={column.label}
                    className="border-b border-[var(--s-border)] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--s-text-muted)]"
                  >
                    {column.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 transition hover:text-[var(--s-text)]"
                      >
                        {column.label}
                        <span aria-hidden>{sortKey === column.key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    ) : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map(entry => {
                const result = deriveAuditResult(entry)
                return (
                  <tr
                    key={entry.id}
                    className={cn('align-top odd:bg-[var(--s-surface)] even:bg-[var(--s-surface-2)]/60', getResultRowClassName(result))}
                  >
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
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
