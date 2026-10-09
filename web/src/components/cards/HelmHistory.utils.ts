import { CheckCircle, XCircle, RotateCcw, ArrowUp, Clock } from 'lucide-react'

export interface HelmHistoryProps {
  config?: {
    cluster?: string
    release?: string
    namespace?: string
  }
}

export type SortByOption = 'revision' | 'status' | 'updated'
export type SortTranslationKey = 'cards:helmHistory.revision' | 'common:common.status' | 'cards:helmHistory.updated'

export const SORT_OPTIONS_KEYS: ReadonlyArray<{ value: SortByOption; labelKey: SortTranslationKey }> = [
  { value: 'revision' as const, labelKey: 'cards:helmHistory.revision' },
  { value: 'status' as const, labelKey: 'common:common.status' },
  { value: 'updated' as const, labelKey: 'cards:helmHistory.updated' },
]

export const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  'pending-upgrade': 1,
  'pending-rollback': 2,
  deployed: 3,
  superseded: 4 }

export function getStatusIcon(status: string) {
  switch (status) {
    case 'deployed': return CheckCircle
    case 'failed': return XCircle
    case 'pending-rollback': return RotateCcw
    case 'pending-upgrade': return ArrowUp
    default: return Clock
  }
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'deployed': return 'green'
    case 'failed': return 'red'
    case 'superseded': return 'gray'
    default: return 'blue'
  }
}

export function formatDate(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
