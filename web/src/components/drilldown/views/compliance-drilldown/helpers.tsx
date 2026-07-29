import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'
import type { SummaryCounts } from './types'

export function normalizeComplianceStatus(status?: string): string {
  switch (status) {
    case 'passing':
      return 'pass'
    case 'failing':
      return 'fail'
    case 'warning':
    case 'skipped':
      return 'other'
    default:
      return status || ''
  }
}

export function parseCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function severityColor(s?: string): string {
  switch (s) {
    case 'critical': return 'text-red-400 bg-red-500/15 border-red-500/30'
    case 'high': return 'text-orange-400 bg-orange-500/15 border-orange-500/30'
    case 'medium': return 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30'
    case 'low': return 'text-blue-400 bg-blue-500/15 border-blue-500/30'
    default: return 'text-muted-foreground bg-secondary border-border'
  }
}

export function statusIcon(status: string) {
  switch (status) {
    case 'pass': return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'fail': return <XCircle className="w-4 h-4 text-red-400" />
    case 'other': return <AlertCircle className="w-4 h-4 text-yellow-400" />
    case 'not-applicable': return <Info className="w-4 h-4 text-muted-foreground" />
    default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />
  }
}

export function statusLabel(status: string) {
  switch (status) {
    case 'pass': return 'Pass'
    case 'fail': return 'Fail'
    case 'other': return 'Other'
    case 'not-applicable': return 'N/A'
    default: return status
  }
}

export function computeSummaryCounts(data: Record<string, unknown>): SummaryCounts {
  const passing = parseCount(data.passing)
  const failing = parseCount(data.failing)
  const providedOther = parseCount(data.warning)
  const totalChecks = parseCount(data.totalChecks)
  const hasProvidedSummary = passing !== null || failing !== null || providedOther !== null || totalChecks !== null
  const other = providedOther ?? (totalChecks !== null
    ? Math.max(0, totalChecks - (passing ?? 0) - (failing ?? 0))
    : null)
  const total = totalChecks ?? ((passing ?? 0) + (failing ?? 0) + (other ?? 0))

  return {
    hasProvidedSummary,
    passing: passing ?? 0,
    failing: failing ?? 0,
    other: other ?? 0,
    total,
  }
}
