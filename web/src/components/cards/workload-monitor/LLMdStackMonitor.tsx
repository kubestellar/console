// Modal safety: the ApiKeyPromptModal imported here uses BaseModal with its own
// close controls, and the cluster-filter dropdown is an anchored flyout (not a
// backdrop modal). closeOnBackdropClick={false} semantics apply to the inline
// inputs — no unsaved-changes risk from accidental backdrop clicks.
import { useMemo, useState, useRef, useEffect } from 'react'
import {
  Cpu, Network, Activity, Layers, Server,
  AlertTriangle
} from 'lucide-react'
import { ALERT_SEVERITY_ORDER } from '../../../types/alerts'
import { Skeleton } from '../../ui/Skeleton'
import { useCachedLLMdServers, useCachedGPUNodes } from '../../../hooks/useCachedData'
import { useWorkloadMonitor } from '../../../hooks/useWorkloadMonitor'
import { useDiagnoseRepairLoop } from '../../../hooks/useDiagnoseRepairLoop'
import { useApiKeyCheck, ApiKeyPromptModal } from '../console-missions/shared'
import { cn } from '../../../lib/cn'
// WorkloadMonitorAlerts replaced with inline issue cards in Issues tab
import { useLLMdClusters } from '../workload-detection/shared'
import { useClusters } from '../../../hooks/useMCP'
import { useCardLoadingState } from '../CardDataContext'
import type { MonitorIssue, MonitoredResource } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'
import { InferenceStats } from './llmdStackMonitor/InferenceStats'
import { ModelList } from './llmdStackMonitor/ModelList'
import { LogViewer } from './llmdStackMonitor/LogViewer'

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

const STATUS_ORDER: Record<string, number> = {
  unhealthy: 0,
  degraded: 1,
  healthy: 2,
  unknown: 3 }

interface LLMdStackMonitorProps {
  config?: Record<string, unknown>
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
  error: 'bg-red-400' }

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground' }

export function LLMdStackMonitor({ config: _config }: LLMdStackMonitorProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters } = useClusters()
  const { nodes: gpuNodes } = useCachedGPUNodes()

  // Dynamically discover clusters that likely have llm-d stacks
  const gpuClusterNames = new Set(gpuNodes.map(n => n.cluster))
  const discoveredClusters = useLLMdClusters(deduplicatedClusters, gpuClusterNames)

  const { servers, isLoading: serversLoading, isRefreshing: serversRefreshing, isDemoFallback: serversDemoFallback, isFailed: serversFailed, consecutiveFailures: serversFailures, refetch: refetchServers } = useCachedLLMdServers(discoveredClusters)
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
        left: Math.max(8, rect.right - 192) })
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

  // Close dropdown on Escape key
  useEffect(() => {
    if (!showClusterFilter) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setShowClusterFilter(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showClusterFilter])

  // Filter servers by search and cluster
  const filteredServers = (() => {
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
  })()

  const availableClusters = deduplicatedClusters.filter(c => c.reachable !== false)

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
    refetch: refetchMonitor } = useWorkloadMonitor(llmdCluster, 'llm-d', '', {
    autoRefreshMs: 30_000 })

  const isLoading = serversLoading || monitorLoading
  const isRefreshing = serversRefreshing || monitorRefreshing

  const hasData = servers.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: serversDemoFallback,
    isFailed: serversFailed,
    consecutiveFailures: serversFailures })

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
  const allItems = filteredServers.map(s => ({
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
      cluster: s.cluster }))

  // Apply status filter
  const statusFilteredItems = (() => {
    if (statusFilter === 'all') return allItems
    return allItems.filter(item => item.status === statusFilter)
  })()

  // Apply sorting
  const sortedItems = (() => {
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
  })()

  // Apply pagination
  const totalItems = sortedItems.length
  const limit = itemsPerPage === 'unlimited' ? totalItems : itemsPerPage
  const totalPages = Math.max(1, Math.ceil(totalItems / limit))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedItems = (() => {
    if (itemsPerPage === 'unlimited') return sortedItems
    const start = (safeCurrentPage - 1) * limit
    return sortedItems.slice(start, start + limit)
  })()

  const needsPagination = itemsPerPage !== 'unlimited' && totalItems > limit

  // Build component sections from paginated items (for hierarchical view)
  const sections = (() => {
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
      items: paginatedItems.filter(item => item.type === cfg.type) })).filter(s => s.items.length > 0)
  })()

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
            order: 0 },
          severity: s.status === 'error' ? 'critical' : 'warning',
          title: `${s.componentType} ${s.name} is ${s.status}`,
          description: `Server ${s.name} in namespace ${s.namespace} is ${s.status}`,
          detectedAt: new Date().toISOString() })
      }
    })
    return monitorIssues
  }, [issues, servers, localClusterFilter])

  // Filter issues by search and severity
  const filteredIssues = (() => {
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
  })()

  // Sort issues
  const sortedIssues = (() => {
    const sorted = [...filteredIssues]
    sorted.sort((a, b) => {
      let compare = 0
      switch (issueSortBy) {
        case 'severity':
          compare = ((ALERT_SEVERITY_ORDER as Record<string, number>)[a.severity] ?? 5) - ((ALERT_SEVERITY_ORDER as Record<string, number>)[b.severity] ?? 5)
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
  })()

  // Paginate issues
  const totalIssues = sortedIssues.length
  const issueLimit = issueItemsPerPage === 'unlimited' ? totalIssues : issueItemsPerPage
  const totalIssuePages = Math.max(1, Math.ceil(totalIssues / issueLimit))
  const safeIssueCurrentPage = Math.min(issueCurrentPage, totalIssuePages)
  const paginatedIssues = (() => {
    if (issueItemsPerPage === 'unlimited') return sortedIssues
    const start = (safeIssueCurrentPage - 1) * issueLimit
    return sortedIssues.slice(start, start + issueLimit)
  })()

  const needsIssuePagination = issueItemsPerPage !== 'unlimited' && totalIssues > issueLimit

  // Calculate overall health
  const stackHealth = (() => {
    if (overallStatus !== 'unknown') return overallStatus
    const statuses = sections.flatMap(s => s.items.map(i => i.status))
    if (statuses.some(s => s === 'unhealthy')) return 'unhealthy'
    if (statuses.some(s => s === 'degraded')) return 'degraded'
    if (statuses.every(s => s === 'healthy')) return 'healthy'
    return 'unknown'
  })()

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
    startDiagnose } = useDiagnoseRepairLoop({
    monitorType: 'llmd',
    repairable: false })

  // Handle diagnose for a specific item
  const handleItemDiagnose = (item: ComponentItem) => {
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
        order: 0 }
      // Create filtered issues for this item
      const itemIssues = allIssues.filter(issue =>
        issue.resource.name === item.name &&
        issue.resource.namespace === item.namespace
      )
      const workloadContext = {
        clusters: [item.cluster || discoveredClusters[0]],
        componentType: item.type,
        componentName: item.name,
        namespace: item.namespace }
      startDiagnose([itemResource], itemIssues, workloadContext)
    })
  }

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
      <InferenceStats
        t={t}
        healthyComponents={healthyComponents}
        totalComponents={totalComponents}
        stackHealth={stackHealth}
        statusBadge={STATUS_BADGE}
        availableClusters={availableClusters}
        localClusterFilter={localClusterFilter}
        showClusterFilter={showClusterFilter}
        setShowClusterFilter={setShowClusterFilter}
        clusterFilterRef={clusterFilterRef}
        clusterFilterBtnRef={clusterFilterBtnRef}
        dropdownStyle={dropdownStyle}
        toggleClusterFilter={toggleClusterFilter}
        clearClusterFilter={() => setLocalClusterFilter([])}
        handleRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

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
            'px-1.5 py-0.5 rounded text-2xs',
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
              'px-1.5 py-0.5 rounded text-2xs',
              activeTab === 'issues' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-500/20 text-yellow-400'
            )}>
              {allIssues.length}
            </span>
          )}
        </button>
      </div>
      {/* Components Tab Content */}
      {activeTab === 'components' && (
        <ModelList
          t={t}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusFilterOptions={STATUS_FILTER_OPTIONS}
          itemsPerPage={itemsPerPage}
          setItemsPerPage={setItemsPerPage}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOptions={SORT_OPTIONS}
          sortDirection={sortDirection}
          setSortDirection={setSortDirection}
          search={search}
          setSearch={setSearch}
          sections={sections}
          expandedSections={expandedSections}
          toggleSection={toggleSection}
          statusDot={STATUS_DOT}
          handleItemDiagnose={handleItemDiagnose}
          needsPagination={needsPagination}
          safeCurrentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          currentPageSize={typeof itemsPerPage === 'number' ? itemsPerPage : totalItems}
          setCurrentPage={setCurrentPage}
        />
      )}
      {/* Issues Tab Content */}
      {activeTab === 'issues' && (
        <LogViewer
          t={t}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
          severityFilterOptions={SEVERITY_FILTER_OPTIONS}
          issueItemsPerPage={issueItemsPerPage}
          setIssueItemsPerPage={setIssueItemsPerPage}
          issueSortBy={issueSortBy}
          setIssueSortBy={setIssueSortBy}
          issueSortOptions={ISSUE_SORT_OPTIONS}
          issueSortDirection={issueSortDirection}
          setIssueSortDirection={setIssueSortDirection}
          issueSearch={issueSearch}
          setIssueSearch={setIssueSearch}
          paginatedIssues={paginatedIssues}
          handleItemDiagnose={handleItemDiagnose}
          needsIssuePagination={needsIssuePagination}
          safeIssueCurrentPage={safeIssueCurrentPage}
          totalIssuePages={totalIssuePages}
          totalIssues={totalIssues}
          issuePageSize={typeof issueItemsPerPage === 'number' ? issueItemsPerPage : totalIssues}
          setIssueCurrentPage={setIssueCurrentPage}
        />
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
