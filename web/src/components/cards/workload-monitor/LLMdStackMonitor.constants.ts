// Shared types, sort/filter option lists and status style maps for the
// llm-d stack monitor card. Extracted from LLMdStackMonitor.tsx (issue #21614).

export type SortField = 'name' | 'status' | 'type' | 'cluster'
export type StatusFilter = 'all' | 'healthy' | 'degraded' | 'unhealthy'
export type IssueSortField = 'title' | 'severity' | 'cluster'
export type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'

export interface ComponentItem {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  type?: string
  namespace?: string
  detail?: string
  cluster?: string
}

export const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'type', label: 'Type' },
  { value: 'cluster', label: 'Cluster' },
]

export const ISSUE_SORT_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'title', label: 'Title' },
  { value: 'cluster', label: 'Cluster' },
]

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unhealthy', label: 'Unhealthy' },
]

export const SEVERITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

export const STATUS_ORDER: Record<string, number> = {
  unhealthy: 0,
  degraded: 1,
  healthy: 2,
  unknown: 3 }

export const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-green-400',
  degraded: 'bg-yellow-400',
  unhealthy: 'bg-red-400',
  unknown: 'bg-gray-400',
  running: 'bg-green-400',
  scaling: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400' }

export const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground' }
