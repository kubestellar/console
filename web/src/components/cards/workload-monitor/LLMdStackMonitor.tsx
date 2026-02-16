import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Cpu, Network, Activity, Layers, Server,
  RefreshCw, Loader2, ChevronDown, ChevronRight, Filter,
  AlertTriangle
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { Pagination } from '../../ui/Pagination'
import { CardControls } from '../../ui/CardControls'
import { CardSearchInput, CardAIActions } from '../../../lib/cards'
import { useCachedLLMdServers } from '../../../hooks/useCachedData'
import { useWorkloadMonitor } from '../../../hooks/useWorkloadMonitor'
import { useDiagnoseRepairLoop } from '../../../hooks/useDiagnoseRepairLoop'
import { useApiKeyCheck, ApiKeyPromptModal } from '../console-missions/shared'
import { cn } from '../../../lib/cn'
// WorkloadMonitorAlerts replaced with inline issue cards in Issues tab
import { useLLMdClusters } from '../workload-detection/shared'
import { useClusters, useGPUNodes } from '../../../hooks/useMCP'
import { ClusterStatusDot, getClusterState } from '../../ui/ClusterStatusBadge'
import { useCardLoadingState } from '../CardDataContext'
import type { MonitorIssue, MonitoredResource } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'

type SortField = 'name' | 'status' | 'type' | 'cluster'
type StatusFilter = 'all' | 'healthy' | 'degraded' | 'unhealthy'
type IssueSortField = 'title' | 'severity' | 'cluster'
type SeverityFilter = 'all' | 'critical' | 'warning' | 'info'

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'type', label: 'Type' },
  { value: 'cluster', label: 'Cluster' },
]

const ISSUE_SORT_OPTIONS = [
  { value: 'severity', label: 'Severity' },
  { value: 'title', label: 'Title' },
  { value: 'cluster', label: 'Cluster' },
]

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unhealthy', label: 'Unhealthy' },
]

const SEVERITY_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const STATUS_ORDER: Record<string, number> = {
  unhealthy: 0,
  degraded: 1,
  healthy: 2,
  unknown: 3,
}

interface LLMdStackMonitorProps {
  config?: Record<string, unknown>
}

interface ComponentSection {
  label: string
  icon: typeof Cpu
  color: string
  items: ComponentItem[]
}

interface ComponentItem {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  type?: string
  namespace?: string
  detail?: string
  cluster?: string
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-green-400',
  degraded: 'bg-yellow-400',
  unhealthy: 'bg-red-400',
  unknown: 'bg-gray-400',
  running: 'bg-green-400',
  scaling: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400',
}

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
}

export function LLMdStackMonitor({ config: _config }: LLMdStackMonitorProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters } = useClusters()
  const { nodes: gpuNodes } = useGPUNodes()

  // Dynamically discover clusters that likely have llm-d stacks
  const gpuClusterNames = useMemo(() => new Set(gpuNodes.map(n => n.cluster)), [gpuNodes])
  const discoveredClusters = useLLMdClusters(deduplicatedClusters, gpuClusterNames)

  const { servers, isLoading: serversLoading, isRefreshing: serversRefreshing, refetch: refetchServers } = useCachedLLMdServers(discoveredClusters)
  const [activeTab, setActiveTab] = useState<'components' | 'issues'>('components')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Model Serving', 'EPP', 'Gateway', 'Autoscaler']))
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const clusterFilterBtnRef = useRef<HTMLButtonElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null)

  // Unified controls state - Components tab
  const [sortBy, setSortBy] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(20)
  const [currentPage, setCurrentPage] = useState(1)

  // Unified controls state - Issues tab
  const [issueSearch, setIssueSearch] = useState('')
  const [issueSortBy, setIssueSortBy] = useState<IssueSortField>('severity')
  const [issueSortDirection, setIssueSortDirection] = useState<'asc' | 'desc'>('asc')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [issueItemsPerPage, setIssueItemsPerPage] = useState<number | 'unlimited'>(5)
  const [issueCurrentPage, setIssueCurrentPage] = useState(1)

  // Compute dropdown position
  useEffect(() => {
    if (showClusterFilter && clusterFilterBtnRef.current) {
      const rect = clusterFilterBtnRef.current.getBoundingClientRect()
      setDropdownStyle({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - 192),
      })
    } else {
      setDropdownStyle(null)
    }
  }, [showClusterFilter])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter servers by search and cluster
  const filteredServers = useMemo(() => {
    let result = servers
    if (localClusterFilter.length > 0) {
      result = result.filter(s => localClusterFilter.includes(s.cluster))
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
  }, [servers, localClusterFilter, search])

  const availableClusters = useMemo(() => {
    return deduplicatedClusters.filter(c => c.reachable !== false)
  }, [deduplicatedClusters])

  const toggleClusterFilter = (cluster: string) => {
    if (localClusterFilter.includes(cluster)) {
      setLocalClusterFilter(localClusterFilter.filter(c => c !== cluster))
    } else {
      setLocalClusterFilter([...localClusterFilter, cluster])
    }
  }

  // Use workload monitor for the primary llm-d namespace
  const llmdCluster = discoveredClusters[0] || ''
  const {
    issues,
    overallStatus,
    isLoading: monitorLoading,
    isRefreshing: monitorRefreshing,
    refetch: refetchMonitor,
  } = useWorkloadMonitor(llmdCluster, 'llm-d', '', {
    autoRefreshMs: 30_000,
  })

  const isLoading = serversLoading || monitorLoading
  const isRefreshing = serversRefreshing || monitorRefreshing

  useCardLoadingState({
    isLoading,
    hasAnyData: servers.length > 0,
  })

  // Map server status to component status
  const mapStatus = (s: string): ComponentItem['status'] => {
    if (s === 'running') return 'healthy'
    if (s === 'scaling') return 'degraded'
    if (s === 'stopped' || s === 'error') return 'unhealthy'
    return 'unknown'
  }

  // Map autoscaler type to display label
  const getAutoscalerLabel = (type?: string): string => {
    switch (type?.toLowerCase()) {
      case 'hpa': return 'HPA'
      case 'va': return 'VA'
      case 'vpa': return 'VPA'
      case 'both': return 'HPA + VA'
      default: return type || 'Autoscaler'
    }
  }

  // Build flat list of all items for sorting/filtering/pagination
  const allItems = useMemo(() => {
    return filteredServers.map(s => ({
      name: s.name,
      status: mapStatus(s.status),
      type: s.componentType,
      namespace: s.namespace,
      detail: s.componentType === 'model'
        ? `${s.type || 'vLLM'} · ${s.model || 'unknown'} · ${s.readyReplicas ?? 0}/${s.replicas ?? 0} replicas`
        : s.componentType === 'epp'
        ? `${s.readyReplicas ?? 0}/${s.replicas ?? 0} replicas`
        : s.componentType === 'autoscaler'
        ? `${getAutoscalerLabel(s.autoscalerType)} ${s.model || ''}`
        : undefined,
      cluster: s.cluster,
    }))
  }, [filteredServers])

  // Apply status filter
  const statusFilteredItems = useMemo(() => {
    if (statusFilter === 'all') return allItems
    return allItems.filter(item => item.status === statusFilter)
  }, [allItems, statusFilter])

  // Apply sorting
  const sortedItems = useMemo(() => {
    const sorted = [...statusFilteredItems]
    sorted.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'status':
          compare = (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5)
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
  }, [statusFilteredItems, sortBy, sortDirection])

  // Apply pagination
  const totalItems = sortedItems.length
  const limit = itemsPerPage === 'unlimited' ? totalItems : itemsPerPage
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedItems = useMemo(() => {
    if (itemsPerPage === 'unlimited') return sortedItems
    const start = (safeCurrentPage - 1) * limit
    return sortedItems.slice(start, start + limit)
  }, [sortedItems, safeCurrentPage, limit, itemsPerPage])

  const needsPagination = itemsPerPage !== 'unlimited' && totalItems > limit

  // Build component sections from paginated items (for hierarchical view)
  const sections = useMemo<ComponentSection[]>(() => {
    const SECTION_CONFIG: Array<{ type: string; label: string; icon: typeof Cpu; color: string }> = [
      { type: 'model', label: 'Model Serving', icon: Cpu, color: 'text-purple-400' },
      { type: 'epp', label: 'EPP', icon: Layers, color: 'text-blue-400' },
      { type: 'gateway', label: 'Gateway', icon: Network, color: 'text-cyan-400' },
      { type: 'prometheus', label: 'Prometheus', icon: Activity, color: 'text-orange-400' },
      { type: 'autoscaler', label: 'Autoscaler', icon: Server, color: 'text-green-400' },
    ]

    return SECTION_CONFIG.map(cfg => ({
      label: cfg.label,
      icon: cfg.icon,
      color: cfg.color,
      items: paginatedItems.filter(item => item.type === cfg.type),
    })).filter(s => s.items.length > 0)
  }, [paginatedItems])

  // Combine issues from monitor and synthesized from llm-d (respects cluster filter)
  const allIssues = useMemo<MonitorIssue[]>(() => {
    // Filter monitor issues by cluster if filter is active
    let monitorIssues = [...issues]
    if (localClusterFilter.length > 0) {
      monitorIssues = monitorIssues.filter(issue =>
        localClusterFilter.includes(issue.resource.cluster)
      )
    }
    // Add synthetic issues from unhealthy llm-d servers
    // Use full servers list and apply cluster filter explicitly to avoid any caching issues
    const serversToCheck = localClusterFilter.length > 0
      ? servers.filter(s => localClusterFilter.includes(s.cluster))
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
            order: 0,
          },
          severity: s.status === 'error' ? 'critical' : 'warning',
          title: `${s.componentType} ${s.name} is ${s.status}`,
          description: `Server ${s.name} in namespace ${s.namespace} is ${s.status}`,
          detectedAt: new Date().toISOString(),
        })
      }
    })
    return monitorIssues
  }, [issues, servers, localClusterFilter])

  // Filter issues by search and severity
  const filteredIssues = useMemo(() => {
    let result = allIssues

    // Apply severity filter
    if (severityFilter !== 'all') {
      result = result.filter(issue => issue.severity === severityFilter)
    }

    // Apply search filter
    if (issueSearch.trim()) {
      const query = issueSearch.toLowerCase()
      result = result.filter(issue =>
        issue.title.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query) ||
        issue.resource?.name?.toLowerCase().includes(query) ||
        issue.resource?.namespace?.toLowerCase().includes(query) ||
        issue.resource?.cluster?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allIssues, severityFilter, issueSearch])

  // Sort issues
  const sortedIssues = useMemo(() => {
    const sorted = [...filteredIssues]
    sorted.sort((a, b) => {
      let compare = 0
      switch (issueSortBy) {
        case 'severity':
          compare = (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
          break
        case 'title':
          compare = a.title.localeCompare(b.title)
          break
        case 'cluster':
          compare = (a.resource?.cluster || '').localeCompare(b.resource?.cluster || '')
          break
      }
      return issueSortDirection === 'asc' ? compare : -compare
    })
    return sorted
  }, [filteredIssues, issueSortBy, issueSortDirection])

  // Paginate issues
  const totalIssues = sortedIssues.length
  const issueLimit = issueItemsPerPage === 'unlimited' ? totalIssues : issueItemsPerPage
  const totalIssuePages = Math.max(1, Math.ceil(totalIssues / issueLimit))
  const safeIssueCurrentPage = Math.min(issueCurrentPage, totalIssuePages)
  const paginatedIssues = useMemo(() => {
    if (issueItemsPerPage === 'unlimited') return sortedIssues
    const start = (safeIssueCurrentPage - 1) * issueLimit
    return sortedIssues.slice(start, start + issueLimit)
  }, [sortedIssues, safeIssueCurrentPage, issueLimit, issueItemsPerPage])

  const needsIssuePagination = issueItemsPerPage !== 'unlimited' && totalIssues > issueLimit

  // Calculate overall health
  const stackHealth = useMemo(() => {
    if (overallStatus !== 'unknown') return overallStatus
    const statuses = sections.flatMap(s => s.items.map(i => i.status))
    if (statuses.some(s => s === 'unhealthy')) return 'unhealthy'
    if (statuses.some(s => s === 'degraded')) return 'degraded'
    if (statuses.every(s => s === 'healthy')) return 'healthy'
    return 'unknown'
  }, [overallStatus, sections])

  const toggleSection = (label: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const handleRefresh = () => {
    refetchServers()
    refetchMonitor()
  }

  // Individual item diagnosis
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const {
    startDiagnose,
  } = useDiagnoseRepairLoop({
    monitorType: 'llmd',
    repairable: false,
  })

  // Handle diagnose for a specific item
  const handleItemDiagnose = useCallback((item: ComponentItem) => {
    checkKeyAndRun(() => {
      // Create filtered resource for this specific item
      const itemResource: MonitoredResource = {
        id: `Deployment/${item.namespace}/${item.name}`,
        kind: 'Deployment',
        name: item.name,
        namespace: item.namespace || 'unknown',
        cluster: item.cluster || discoveredClusters[0] || '',
        status: item.status,
        category: 'workload',
        lastChecked: new Date().toISOString(),
        optional: false,
        order: 0,
      }
      // Create filtered issues for this item
      const itemIssues = allIssues.filter(issue =>
        issue.resource.name === item.name &&
        issue.resource.namespace === item.namespace
      )
      const workloadContext = {
        clusters: [item.cluster || discoveredClusters[0]],
        componentType: item.type,
        componentName: item.name,
        namespace: item.namespace,
      }
      startDiagnose([itemResource], itemIssues, workloadContext)
    })
  }, [checkKeyAndRun, startDiagnose, allIssues, discoveredClusters])

  if (isLoading && servers.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={180} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  // Empty state
  if (servers.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Cpu className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No llm-d stack detected. Deploy llm-d to see monitoring data.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Looking in clusters: {discoveredClusters.join(', ')}
        </p>
      </div>
    )
  }

  // Calculate from full data set (before pagination), respecting status filter
  const totalComponents = statusFilteredItems.length
  const healthyComponents = statusFilteredItems.filter(i => i.status === 'healthy').length

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">llm-d Stack</span>
        <span
          className="text-xs text-muted-foreground cursor-default"
          title={`${healthyComponents} healthy components out of ${totalComponents} total`}
        >
          {healthyComponents}/{totalComponents} components
        </span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded ml-auto', STATUS_BADGE[stackHealth] || STATUS_BADGE.unknown)}>
          {stackHealth}
        </span>
        {/* Cluster filter */}
        {availableClusters.length >= 1 && (
          <div ref={clusterFilterRef} className="relative">
            <button
              ref={clusterFilterBtnRef}
              onClick={() => setShowClusterFilter(!showClusterFilter)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                localClusterFilter.length > 0
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Filter by cluster"
            >
              <Filter className="w-3 h-3" />
              {localClusterFilter.length > 0 && (
                <span className="flex items-center gap-1">
                  <Server className="w-3 h-3" />
                  {localClusterFilter.length}/{availableClusters.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showClusterFilter && dropdownStyle && createPortal(
              <div
                className="fixed w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50"
                style={{ top: dropdownStyle.top, left: dropdownStyle.left }}
                onMouseDown={e => e.stopPropagation()}
              >
                <div className="p-1">
                  <button
                    onClick={() => setLocalClusterFilter([])}
                    className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                      localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                    }`}
                  >
                    All clusters
                  </button>
                  {availableClusters.map(cluster => {
                    const clusterState = getClusterState(
                      cluster.healthy,
                      cluster.reachable,
                      cluster.nodeCount,
                      undefined,
                      cluster.errorType
                    )
                    const stateLabel = clusterState === 'healthy' ? '' :
                      clusterState === 'degraded' ? 'degraded' :
                      clusterState === 'unreachable-auth' ? 'needs auth' :
                      clusterState === 'unreachable-timeout' ? 'offline' :
                      'offline'
                    return (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors flex items-center gap-2 ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                        title={stateLabel ? `${cluster.name} (${stateLabel})` : cluster.name}
                      >
                        <ClusterStatusDot state={clusterState} size="sm" />
                        <span className="flex-1 truncate">{cluster.name}</span>
                        {stateLabel && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{stateLabel}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>,
              document.body
            )}
          </div>
        )}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-secondary transition-colors"
          title={t('common.refresh')}
        >
          {isRefreshing
            ? <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-border">
        <button
          onClick={() => setActiveTab('components')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5',
            activeTab === 'components'
              ? 'bg-card border border-b-0 border-border text-foreground -mb-px'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Layers className="w-3 h-3" />
          Components
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px]',
            activeTab === 'components' ? 'bg-purple-500/20 text-purple-400' : 'bg-secondary'
          )}>
            {totalComponents}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('issues')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center gap-1.5',
            activeTab === 'issues'
              ? 'bg-card border border-b-0 border-border text-foreground -mb-px'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <AlertTriangle className="w-3 h-3" />
          Issues
          {allIssues.length > 0 && (
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px]',
              activeTab === 'issues' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-500/20 text-yellow-400'
            )}>
              {allIssues.length}
            </span>
          )}
        </button>
      </div>

      {/* Components Tab Content */}
      {activeTab === 'components' && (
        <>
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-2">
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1) }}
              className="px-2 py-1 text-xs rounded-md bg-secondary border border-border text-foreground"
            >
              {STATUS_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="flex-1" />
            <CardControls
              limit={itemsPerPage}
              onLimitChange={(v) => { setItemsPerPage(v); setCurrentPage(1) }}
              sortBy={sortBy}
              sortOptions={SORT_OPTIONS}
              onSortChange={(v) => setSortBy(v as SortField)}
              sortDirection={sortDirection}
              onSortDirectionChange={setSortDirection}
            />
          </div>

          {/* Search */}
          <CardSearchInput
            value={search}
            onChange={(v) => { setSearch(v); setCurrentPage(1) }}
            placeholder={t('common.searchComponents')}
            className="mb-3"
          />

          {/* Component sections */}
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {sections.map(section => {
              const SectionIcon = section.icon
              const isExpanded = expandedSections.has(section.label)
              const sectionHealthy = section.items.filter(i => i.status === 'healthy').length
              const allHealthy = sectionHealthy === section.items.length

              return (
                <div key={section.label} className="border-b border-border/30 last:border-0">
                  <button
                    onClick={() => toggleSection(section.label)}
                    className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-card/30 rounded transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <SectionIcon className={cn('w-3.5 h-3.5 shrink-0', section.color)} />
                    <span className="text-sm text-foreground flex-1">{section.label}</span>
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded cursor-default',
                        allHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400',
                      )}
                      title={`${sectionHealthy} healthy out of ${section.items.length} total ${section.label} components`}
                    >
                      {sectionHealthy}/{section.items.length}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="ml-8 mb-1.5 space-y-0.5">
                      {section.items.map((item, idx) => (
                        <div key={`${section.label}-${idx}-${item.name}`} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-card/30 transition-colors group">
                          <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[item.status] || 'bg-gray-400')} />
                          <span className="text-xs text-foreground truncate flex-1">{item.name}</span>
                          {item.namespace && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 shrink-0">
                              {item.namespace}
                            </span>
                          )}
                          {item.detail && (
                            <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[150px]">
                              {item.detail}
                            </span>
                          )}
                          {item.cluster && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                              {item.cluster}
                            </span>
                          )}
                          {/* Diag icon - show for non-healthy items */}
                          {item.status !== 'healthy' && (
                            <CardAIActions
                              resource={{ kind: 'Deployment', name: item.name, namespace: item.namespace, cluster: item.cluster, status: item.status }}
                              issues={item.detail ? [{ name: item.status, message: item.detail }] : []}
                              showRepair={false}
                              onDiagnose={(e) => { e.stopPropagation(); handleItemDiagnose(item) }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {needsPagination && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {/* Issues Tab Content */}
      {activeTab === 'issues' && (
        <>
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-2">
            {/* Severity filter */}
            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value as SeverityFilter); setIssueCurrentPage(1) }}
              className="px-2 py-1 text-xs rounded-md bg-secondary border border-border text-foreground"
            >
              {SEVERITY_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="flex-1" />
            <CardControls
              limit={issueItemsPerPage}
              onLimitChange={(v) => { setIssueItemsPerPage(v); setIssueCurrentPage(1) }}
              sortBy={issueSortBy}
              sortOptions={ISSUE_SORT_OPTIONS}
              onSortChange={(v) => setIssueSortBy(v as IssueSortField)}
              sortDirection={issueSortDirection}
              onSortDirectionChange={setIssueSortDirection}
            />
          </div>

          {/* Search */}
          <CardSearchInput
            value={issueSearch}
            onChange={(v) => { setIssueSearch(v); setIssueCurrentPage(1) }}
            placeholder={t('common.searchIssues')}
            className="mb-3"
          />

          {/* Issues list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {paginatedIssues.length > 0 ? (
              paginatedIssues.map(issue => {
                const severityConfig = {
                  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500/20 text-red-400', icon: 'text-red-400' },
                  warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400', icon: 'text-yellow-400' },
                  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400', icon: 'text-blue-400' },
                }
                const config = severityConfig[issue.severity as keyof typeof severityConfig] || severityConfig.info

                return (
                  <div
                    key={issue.id}
                    className={cn('rounded-lg p-3 border', config.bg, config.border)}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={cn('w-4 h-4 mt-0.5 shrink-0', config.icon)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-sm font-medium', config.text)}>{issue.title}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded', config.badge)}>{issue.severity}</span>
                        </div>
                        {issue.description && (
                          <p className="text-xs text-muted-foreground mt-1">{issue.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {issue.resource?.namespace && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                              {issue.resource.namespace}
                            </span>
                          )}
                          {issue.resource?.cluster && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              {issue.resource.cluster}
                            </span>
                          )}
                        </div>
                      </div>
                      <CardAIActions
                        resource={{ kind: issue.resource?.kind || 'Resource', name: issue.resource?.name || issue.title, namespace: issue.resource?.namespace, cluster: issue.resource?.cluster, status: issue.severity }}
                        issues={[{ name: issue.title, message: issue.description || '' }]}
                        showRepair={false}
                        onDiagnose={() => handleItemDiagnose({
                          name: issue.resource?.name || issue.title,
                          status: issue.severity === 'critical' ? 'unhealthy' : 'degraded',
                          namespace: issue.resource?.namespace,
                          cluster: issue.resource?.cluster,
                        })}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <AlertTriangle className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-sm">{issueSearch ? 'No issues match your search' : 'No issues detected'}</p>
                {!issueSearch && <p className="text-xs opacity-70 mt-1">All components are healthy</p>}
              </div>
            )}
          </div>

          {/* Pagination */}
          {needsIssuePagination && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <Pagination
                currentPage={safeIssueCurrentPage}
                totalPages={totalIssuePages}
                totalItems={totalIssues}
                itemsPerPage={typeof issueItemsPerPage === 'number' ? issueItemsPerPage : totalIssues}
                onPageChange={setIssueCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {/* API Key prompt for per-item diagnose */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />
    </div>
  )
}
