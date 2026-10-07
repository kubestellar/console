// Pure filtering, sorting, pagination and aggregation helpers for the llm-d
// stack monitor card. Extracted from LLMdStackMonitor.tsx (issue #24058) —
// logic unchanged.
import { Cpu, Network, Activity, Layers, Server } from 'lucide-react'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'
import type { LLMdServer } from '../../../hooks/useLLMd'
import type { MonitorIssue, ResourceHealthStatus } from '../../../types/workloadMonitor'
import type { LLMdSection } from './LLMdComponentSections'
import {
  STATUS_ORDER,
  type ComponentItem,
  type IssueSortField,
  type SeverityFilter,
  type SortField,
  type StatusFilter,
} from './LLMdStackMonitor.constants'

/** Fallback rank for statuses/severities missing from the order maps. */
const UNKNOWN_ORDER_RANK = 5

export type ItemsPerPage = number | 'unlimited'
export type SortDirection = 'asc' | 'desc'

const SECTION_CONFIG: Array<{ type: string; label: string; icon: typeof Cpu; color: string }> = [
  { type: 'model', label: 'Model Serving', icon: Cpu, color: 'text-purple-400' },
  { type: 'epp', label: 'EPP', icon: Layers, color: 'text-blue-400' },
  { type: 'gateway', label: 'Gateway', icon: Network, color: 'text-cyan-400' },
  { type: 'prometheus', label: 'Prometheus', icon: Activity, color: 'text-orange-400' },
  { type: 'autoscaler', label: 'Autoscaler', icon: Server, color: 'text-green-400' },
]

/** Filter servers by the selected clusters and free-text search. */
export function filterServers(servers: LLMdServer[], clusterFilter: string[], search: string): LLMdServer[] {
  let result = servers
  if (clusterFilter.length > 0) {
    result = result.filter(s => clusterFilter.includes(s.cluster))
  }
  if (search.trim()) {
    const query = search.toLowerCase()
    result = result.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.namespace.toLowerCase().includes(query) ||
      s.cluster.toLowerCase().includes(query) ||
      (s.model && s.model.toLowerCase().includes(query))
    )
  }
  return result
}

/** Map server status to component status. */
export function mapServerStatus(s: string): ComponentItem['status'] {
  if (s === 'running') return 'healthy'
  if (s === 'scaling') return 'degraded'
  if (s === 'stopped' || s === 'error') return 'unhealthy'
  return 'unknown'
}

/** Map autoscaler type to display label. */
export function getAutoscalerLabel(type?: string): string {
  switch (type?.toLowerCase()) {
    case 'hpa': return 'HPA'
    case 'va': return 'VA'
    case 'vpa': return 'VPA'
    case 'both': return 'HPA + VA'
    default: return type || 'Autoscaler'
  }
}

/** Build the flat list of component items for sorting/filtering/pagination. */
export function buildComponentItems(servers: LLMdServer[]) {
  return servers.map(s => ({
    name: s.name,
    status: mapServerStatus(s.status),
    type: s.componentType,
    namespace: s.namespace,
    detail: s.componentType === 'model'
      ? `${s.type || 'vLLM'} · ${s.model || 'unknown'} · ${s.readyReplicas ?? 0}/${s.replicas ?? 0} replicas`
      : s.componentType === 'epp'
      ? `${s.readyReplicas ?? 0}/${s.replicas ?? 0} replicas`
      : s.componentType === 'autoscaler'
      ? `${getAutoscalerLabel(s.autoscalerType)} ${s.model || ''}`
      : undefined,
    cluster: s.cluster }))
}

export function filterItemsByStatus<T extends ComponentItem>(items: T[], statusFilter: StatusFilter): T[] {
  if (statusFilter === 'all') return items
  return items.filter(item => item.status === statusFilter)
}

export function sortComponentItems<T extends ComponentItem>(items: T[], sortBy: SortField, sortDirection: SortDirection): T[] {
  const sorted = [...items]
  sorted.sort((a, b) => {
    let compare = 0
    switch (sortBy) {
      case 'name':
        compare = a.name.localeCompare(b.name)
        break
      case 'status':
        compare = (STATUS_ORDER[a.status] ?? UNKNOWN_ORDER_RANK) - (STATUS_ORDER[b.status] ?? UNKNOWN_ORDER_RANK)
        break
      case 'type':
        compare = (a.type || '').localeCompare(b.type || '')
        break
      case 'cluster':
        compare = (a.cluster || '').localeCompare(b.cluster || '')
        break
    }
    return sortDirection === 'asc' ? compare : -compare
  })
  return sorted
}

export interface PaginationResult<T> {
  totalItems: number
  totalPages: number
  safeCurrentPage: number
  paginatedItems: T[]
  needsPagination: boolean
}

/** Slice a list into the current page, clamping the page into range. */
export function paginate<T>(items: T[], itemsPerPage: ItemsPerPage, currentPage: number): PaginationResult<T> {
  const totalItems = items.length
  const limit = itemsPerPage === 'unlimited' ? totalItems : itemsPerPage
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedItems = (() => {
    if (itemsPerPage === 'unlimited') return items
    const start = (safeCurrentPage - 1) * limit
    return items.slice(start, start + limit)
  })()
  const needsPagination = itemsPerPage !== 'unlimited' && totalItems > limit
  return { totalItems, totalPages, safeCurrentPage, paginatedItems, needsPagination }
}

/** Group items into component sections (for hierarchical view). */
export function buildSections(items: ComponentItem[]): LLMdSection[] {
  return SECTION_CONFIG.map(cfg => ({
    label: cfg.label,
    icon: cfg.icon,
    color: cfg.color,
    items: items.filter(item => item.type === cfg.type) })).filter(s => s.items.length > 0)
}

/** Combine monitor issues with synthetic issues from unhealthy llm-d servers, respecting the cluster filter. */
export function buildAllIssues(issues: MonitorIssue[], servers: LLMdServer[], clusterFilter: string[]): MonitorIssue[] {
  // Filter monitor issues by cluster if filter is active
  let monitorIssues = [...issues]
  if (clusterFilter.length > 0) {
    monitorIssues = monitorIssues.filter(issue =>
      clusterFilter.includes(issue.resource.cluster)
    )
  }
  // Add synthetic issues from unhealthy llm-d servers
  // Use full servers list and apply cluster filter explicitly to avoid any caching issues
  const serversToCheck = clusterFilter.length > 0
    ? servers.filter(s => clusterFilter.includes(s.cluster))
    : servers
  serversToCheck.forEach((s) => {
    if (s.status === 'error' || s.status === 'stopped') {
      monitorIssues.push({
        id: `llmd-${s.cluster}-${s.namespace}-${s.name}-${s.status}`,
        resource: {
          id: `${'Deployment'}/${s.namespace}/${s.name}`,
          kind: 'Deployment',
          name: s.name,
          namespace: s.namespace,
          cluster: s.cluster,
          status: s.status === 'error' ? 'unhealthy' : 'degraded',
          category: 'workload',
          lastChecked: new Date().toISOString(),
          optional: false,
          order: 0 },
        severity: s.status === 'error' ? 'critical' : 'warning',
        title: `${s.componentType} ${s.name} is ${s.status}`,
        description: `Server ${s.name} in namespace ${s.namespace} is ${s.status}`,
        detectedAt: new Date().toISOString() })
    }
  })
  return monitorIssues
}

/** Filter issues by severity and free-text search. */
export function filterIssues(issues: MonitorIssue[], severityFilter: SeverityFilter, search: string): MonitorIssue[] {
  let result = issues

  if (severityFilter !== 'all') {
    result = result.filter(issue => issue.severity === severityFilter)
  }

  if (search.trim()) {
    const query = search.toLowerCase()
    result = result.filter(issue =>
      issue.title.toLowerCase().includes(query) ||
      issue.description?.toLowerCase().includes(query) ||
      issue.resource?.name?.toLowerCase().includes(query) ||
      issue.resource?.namespace?.toLowerCase().includes(query) ||
      issue.resource?.cluster?.toLowerCase().includes(query)
    )
  }

  return result
}

export function sortIssues(issues: MonitorIssue[], sortBy: IssueSortField, sortDirection: SortDirection): MonitorIssue[] {
  const severityOrder = ALERT_SEVERITY_ORDER as Record<string, number>
  const sorted = [...issues]
  sorted.sort((a, b) => {
    let compare = 0
    switch (sortBy) {
      case 'severity':
        compare = (severityOrder[a.severity] ?? UNKNOWN_ORDER_RANK) - (severityOrder[b.severity] ?? UNKNOWN_ORDER_RANK)
        break
      case 'title':
        compare = a.title.localeCompare(b.title)
        break
      case 'cluster':
        compare = (a.resource?.cluster || '').localeCompare(b.resource?.cluster || '')
        break
    }
    return sortDirection === 'asc' ? compare : -compare
  })
  return sorted
}

/** Calculate overall stack health, preferring the workload monitor's verdict. */
export function computeStackHealth(overallStatus: ResourceHealthStatus, sections: LLMdSection[]): string {
  if (overallStatus !== 'unknown') return overallStatus
  const statuses = sections.flatMap(s => s.items.map(i => i.status))
  if (statuses.some(s => s === 'unhealthy')) return 'unhealthy'
  if (statuses.some(s => s === 'degraded')) return 'degraded'
  if (statuses.every(s => s === 'healthy')) return 'healthy'
  return 'unknown'
}
