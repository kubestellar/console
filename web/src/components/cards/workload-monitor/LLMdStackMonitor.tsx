// Modal safety: the ApiKeyPromptModal imported here uses BaseModal with its own
// close controls, and the cluster-filter dropdown is an anchored flyout (not a
// backdrop modal). closeOnBackdropClick={false} semantics apply to the inline
// inputs — no unsaved-changes risk from accidental backdrop clicks.
import { useMemo, useState } from 'react'
import { Cpu, RefreshCw } from 'lucide-react'
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
import type { MonitorIssue } from '../../../types/workloadMonitor'
import { useTranslation } from 'react-i18next'
import { LLMdClusterFilter } from './LLMdClusterFilter'
import { LLMdComponentsTab } from './LLMdComponentsTab'
import { LLMdIssuesTab } from './LLMdIssuesTab'
import { LLMdStackMonitorTabs, type LLMdStackMonitorTab } from './LLMdStackMonitorTabs'
import { useLLMdClusterFilterDropdown } from './useLLMdClusterFilterDropdown'
import {
  buildAllIssues,
  buildItemDiagnoseInput,
  buildComponentItems,
  buildSections,
  computeStackHealth,
  filterIssues,
  filterItemsByStatus,
  filterServers,
  paginate,
  sortComponentItems,
  sortIssues,
} from './LLMdStackMonitor.utils'
import {
  DEFAULT_COMPONENTS_PER_PAGE,
  DEFAULT_ISSUES_PER_PAGE,
  LLMD_MONITOR_REFRESH_MS,
  STATUS_BADGE,
  type ComponentItem,
  type IssueSortField,
  type SeverityFilter,
  type SortField,
  type StatusFilter,
} from './LLMdStackMonitor.constants'

interface LLMdStackMonitorProps {
  config?: Record<string, unknown>
}

export function LLMdStackMonitor({ config: _config }: LLMdStackMonitorProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters } = useClusters()
  const { nodes: gpuNodes } = useCachedGPUNodes()

  // Dynamically discover clusters that likely have llm-d stacks
  const gpuClusterNames = new Set(gpuNodes.map(n => n.cluster))
  const discoveredClusters = useLLMdClusters(deduplicatedClusters, gpuClusterNames)

  const { servers, isLoading: serversLoading, isRefreshing: serversRefreshing, isDemoFallback: serversDemoFallback, isFailed: serversFailed, consecutiveFailures: serversFailures, refetch: refetchServers } = useCachedLLMdServers(discoveredClusters)
  const [activeTab, setActiveTab] = useState<LLMdStackMonitorTab>('components')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Model Serving', 'EPP', 'Gateway', 'Autoscaler']))
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const {
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    clusterFilterBtnRef,
    dropdownStyle,
  } = useLLMdClusterFilterDropdown()

  // Unified controls state - Components tab
  const [sortBy, setSortBy] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(DEFAULT_COMPONENTS_PER_PAGE)
  const [currentPage, setCurrentPage] = useState(1)

  // Unified controls state - Issues tab
  const [issueSearch, setIssueSearch] = useState('')
  const [issueSortBy, setIssueSortBy] = useState<IssueSortField>('severity')
  const [issueSortDirection, setIssueSortDirection] = useState<'asc' | 'desc'>('asc')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [issueItemsPerPage, setIssueItemsPerPage] = useState<number | 'unlimited'>(DEFAULT_ISSUES_PER_PAGE)
  const [issueCurrentPage, setIssueCurrentPage] = useState(1)

  // Filter servers by search and cluster
  const filteredServers = filterServers(servers, localClusterFilter, search)

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
    autoRefreshMs: LLMD_MONITOR_REFRESH_MS })

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

  // Build flat list of all items, then filter/sort/paginate
  const allItems = buildComponentItems(filteredServers)
  const statusFilteredItems = filterItemsByStatus(allItems, statusFilter)
  const sortedItems = sortComponentItems(statusFilteredItems, sortBy, sortDirection)
  const {
    totalItems,
    totalPages,
    safeCurrentPage,
    paginatedItems,
    needsPagination,
  } = paginate(sortedItems, itemsPerPage, currentPage)

  // Build component sections from paginated items (for hierarchical view)
  const sections = buildSections(paginatedItems)

  // Combine issues from monitor and synthesized from llm-d (respects cluster filter)
  const allIssues = useMemo<MonitorIssue[]>(
    () => buildAllIssues(issues, servers, localClusterFilter),
    [issues, servers, localClusterFilter],
  )

  // Filter, sort and paginate issues
  const filteredIssues = filterIssues(allIssues, severityFilter, issueSearch)
  const sortedIssues = sortIssues(filteredIssues, issueSortBy, issueSortDirection)
  const {
    totalItems: totalIssues,
    totalPages: totalIssuePages,
    safeCurrentPage: safeIssueCurrentPage,
    paginatedItems: paginatedIssues,
    needsPagination: needsIssuePagination,
  } = paginate(sortedIssues, issueItemsPerPage, issueCurrentPage)

  // Calculate overall health
  const stackHealth = computeStackHealth(overallStatus, sections)

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
      const { resource, issues: itemIssues, context } = buildItemDiagnoseInput(item, allIssues, discoveredClusters[0])
      startDiagnose([resource], itemIssues, context)
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
          <LLMdClusterFilter
            containerRef={clusterFilterRef}
            buttonRef={clusterFilterBtnRef}
            availableClusters={availableClusters}
            selectedClusters={localClusterFilter}
            showDropdown={showClusterFilter}
            dropdownStyle={dropdownStyle}
            onToggleDropdown={() => setShowClusterFilter(!showClusterFilter)}
            onClearFilter={() => setLocalClusterFilter([])}
            onToggleCluster={toggleClusterFilter}
          />
        )}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-secondary transition-colors"
          title={t('common.refresh')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'text-purple-400 animate-spin' : 'text-muted-foreground'}`} />
        </button>
      </div>

      {/* Tabs */}
      <LLMdStackMonitorTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalComponents={totalComponents}
        issueCount={allIssues.length}
      />

      {/* Components Tab Content */}
      {activeTab === 'components' && (
        <LLMdComponentsTab
          statusFilter={statusFilter}
          onStatusFilterChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={(v) => { setItemsPerPage(v); setCurrentPage(1) }}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
          search={search}
          onSearchChange={(v) => { setSearch(v); setCurrentPage(1) }}
          sections={sections}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          onDiagnoseItem={handleItemDiagnose}
          needsPagination={needsPagination}
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Issues Tab Content */}
      {activeTab === 'issues' && (
        <LLMdIssuesTab
          severityFilter={severityFilter}
          onSeverityFilterChange={(v) => { setSeverityFilter(v); setIssueCurrentPage(1) }}
          itemsPerPage={issueItemsPerPage}
          onItemsPerPageChange={(v) => { setIssueItemsPerPage(v); setIssueCurrentPage(1) }}
          sortBy={issueSortBy}
          onSortByChange={setIssueSortBy}
          sortDirection={issueSortDirection}
          onSortDirectionChange={setIssueSortDirection}
          search={issueSearch}
          onSearchChange={(v) => { setIssueSearch(v); setIssueCurrentPage(1) }}
          issues={paginatedIssues}
          onDiagnoseItem={handleItemDiagnose}
          needsPagination={needsIssuePagination}
          currentPage={safeIssueCurrentPage}
          totalPages={totalIssuePages}
          totalItems={totalIssues}
          onPageChange={setIssueCurrentPage}
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
