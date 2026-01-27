import { useState, useMemo, useRef, useEffect } from 'react'
import {
  CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink,
  Cpu, Layers, AlertCircle, Play, Pause, RefreshCw, Filter, ChevronDown, Server,
  Activity, Network, Box
} from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { CardControls, SortDirection } from '../ui/CardControls'
import { usePagination, Pagination } from '../ui/Pagination'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useCachedProwJobs } from '../../hooks/useCachedData'
import type { ProwJob } from '../../hooks/useProw'

// =============================================================================
// SHARED TYPES AND UTILITIES
// =============================================================================

interface DemoState {
  isLoading: boolean
  lastUpdated: Date | null
}

function useDemoData<T>(data: T): DemoState & { data: T } {
  const [isLoading] = useState(false)
  const [lastUpdated] = useState<Date | null>(new Date())
  return { data, isLoading, lastUpdated }
}

// =============================================================================
// PROW CARDS
// =============================================================================

interface ProwJobsProps {
  config?: Record<string, unknown>
}

export function ProwJobs({ config: _config }: ProwJobsProps) {
  // Fetch real ProwJobs from the prow cluster with caching
  const {
    jobs,
    isLoading,
    isRefreshing,
    refetch,
    isFailed,
    consecutiveFailures,
    lastRefresh,
    formatTimeAgo,
    error,
  } = useCachedProwJobs('prow', 'prow')

  // Debug logging
  console.log('[ProwJobs] render:', { jobsCount: jobs.length, isLoading, isRefreshing, isFailed, error })

  const [sortBy, setSortBy] = useState<'name' | 'state' | 'started'>('started')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [typeFilter, setTypeFilter] = useState<ProwJob['type'] | 'all'>('all')
  const [stateFilter, setStateFilter] = useState<ProwJob['state'] | 'all'>('all')

  // Filter and sort jobs
  const sortedJobs = useMemo(() => {
    let filtered = [...jobs]

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(j => j.type === typeFilter)
    }

    // Apply state filter
    if (stateFilter !== 'all') {
      filtered = filtered.filter(j => j.state === stateFilter)
    }

    return filtered.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'name':
          compare = a.name.localeCompare(b.name)
          break
        case 'state':
          compare = a.state.localeCompare(b.state)
          break
        case 'started':
          compare = new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [jobs, sortBy, sortDirection, typeFilter, stateFilter])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(sortedJobs, effectivePerPage)

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'success': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />
      case 'failure':
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-400" />
      case 'pending':
      case 'triggered': return <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
      case 'running': return <Play className="w-3.5 h-3.5 text-blue-400" />
      case 'aborted': return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
      default: return <Clock className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      presubmit: 'bg-blue-500/20 text-blue-400',
      postsubmit: 'bg-green-500/20 text-green-400',
      periodic: 'bg-purple-500/20 text-purple-400',
      batch: 'bg-cyan-500/20 text-cyan-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">
            {sortedJobs.length} jobs
          </span>
          {jobs.filter(j => j.state === 'running').length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1">
              <Play className="w-3 h-3" />
              {jobs.filter(j => j.state === 'running').length} running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ProwJob['type'] | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">All Types</option>
            <option value="periodic">Periodic</option>
            <option value="presubmit">Presubmit</option>
            <option value="postsubmit">Postsubmit</option>
          </select>
          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as ProwJob['state'] | 'all')}
            className="px-2 py-1 text-xs rounded-lg bg-secondary border border-border text-foreground"
          >
            <option value="all">All States</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
          </select>
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={[
              { value: 'name', label: 'Name' },
              { value: 'state', label: 'State' },
              { value: 'started', label: 'Started' },
            ]}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.map((job) => (
          <div key={job.id} className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStateIcon(job.state)}
                <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{job.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${getTypeBadge(job.type)}`}>
                  {job.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{formatTimeAgo(job.startTime)}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              {job.pr && <span>PR: #{job.pr}</span>}
              <span>Duration: {job.duration}</span>
              {job.url && (
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
                  Logs <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

interface ProwStatusProps {
  config?: Record<string, unknown>
}

export function ProwStatus({ config: _config }: ProwStatusProps) {
  const { status, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useCachedProwJobs('prow', 'prow')

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={100} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Status badge */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs px-1.5 py-0.5 rounded ${status.healthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {status.healthy ? 'Healthy' : 'Unhealthy'}
        </span>
        <RefreshButton
          isRefreshing={isRefreshing}
          isFailed={isFailed}
          consecutiveFailures={consecutiveFailures}
          lastRefresh={lastRefresh}
          onRefresh={refetch}
          size="sm"
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-green-400">{status.successRate}%</div>
          <div className="text-xs text-muted-foreground">Success Rate</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-2xl font-bold text-foreground">{status.prowJobsLastHour}</div>
          <div className="text-xs text-muted-foreground">Jobs (last hour)</div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-blue-400">{status.runningJobs}</div>
            <span className="text-xs text-muted-foreground">running</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-yellow-400">{status.pendingJobs}</div>
            <span className="text-xs text-muted-foreground">pending</span>
          </div>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-green-400">{status.successJobs}</div>
            <span className="text-xs text-muted-foreground">success</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-red-400">{status.failedJobs}</div>
            <span className="text-xs text-muted-foreground">failed</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        <a href="https://prow2.kubestellar.io" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
          Open Prow Dashboard <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

interface ProwHistoryProps {
  config?: Record<string, unknown>
}

export function ProwHistory({ config: _config }: ProwHistoryProps) {
  const { jobs, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh, formatTimeAgo } = useCachedProwJobs('prow', 'prow')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  // Filter to only completed jobs for history view
  const completedJobs = useMemo(() => {
    return jobs.filter(j => j.state === 'success' || j.state === 'failure' || j.state === 'error' || j.state === 'aborted')
  }, [jobs])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(completedJobs, effectivePerPage)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2">
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
        <div className="space-y-2">
          {paginatedItems.map((job) => (
            <div key={job.id} className="relative pl-6 group">
              <div className={`absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center ${
                job.state === 'success' ? 'bg-green-500' : job.state === 'aborted' ? 'bg-yellow-500' : 'bg-red-500'
              }`}>
                {job.state === 'success' ? (
                  <CheckCircle className="w-2.5 h-2.5 text-white" />
                ) : job.state === 'aborted' ? (
                  <AlertTriangle className="w-2.5 h-2.5 text-white" />
                ) : (
                  <XCircle className="w-2.5 h-2.5 text-white" />
                )}
              </div>
              <div className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                  <span className="text-xs text-muted-foreground">{formatTimeAgo(job.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{job.duration}</span>
                  {job.url && (
                    <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline flex items-center gap-1">
                      Logs <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// LLM INFERENCE CARDS
// =============================================================================

import { useCachedLLMdServers, useCachedLLMdModels } from '../../hooks/useCachedData'
import type { LLMdServer, LLMdComponentType } from '../../hooks/useLLMd'

// Clusters known to have llm-d stacks
const LLMD_CLUSTERS = ['vllm-d', 'platform-eval']

interface LLMInferenceProps {
  config?: Record<string, unknown>
}

type LLMdSortByOption = 'name' | 'status' | 'namespace' | 'type' | 'component'

const LLMD_SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'namespace' as const, label: 'Namespace' },
  { value: 'type' as const, label: 'Type' },
  { value: 'component' as const, label: 'Component' },
]

const COMPONENT_FILTERS: { value: LLMdComponentType | 'all' | 'autoscale', label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'model', label: 'Models' },
  { value: 'epp', label: 'EPP' },
  { value: 'gateway', label: 'Gateway' },
  { value: 'prometheus', label: 'Prometheus' },
  { value: 'autoscale', label: 'Auto-scale' },
]

export function LLMInference({ config: _config }: LLMInferenceProps) {
  const { servers, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh, error } = useCachedLLMdServers(LLMD_CLUSTERS)

  // Debug logging
  console.log('[LLMInference] render:', { serversCount: servers.length, isLoading, isRefreshing, isFailed, error })
  const { deduplicatedClusters: allClusters } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [sortBy, setSortBy] = useState<LLMdSortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [componentFilter, setComponentFilter] = useState<LLMdComponentType | 'all' | 'autoscale'>('all')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kubestellar-card-filter:llm-inference')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [showComponentFilter, setShowComponentFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)
  const componentFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
      if (componentFilterRef.current && !componentFilterRef.current.contains(event.target as Node)) {
        setShowComponentFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    localStorage.setItem('kubestellar-card-filter:llm-inference', JSON.stringify(localClusterFilter))
  }, [localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => prev.includes(clusterName) ? prev.filter(c => c !== clusterName) : [...prev, clusterName])
  }
  const clearClusterFilter = () => setLocalClusterFilter([])

  const availableClustersForFilter = useMemo(() => {
    const reachable = allClusters.filter(c => c.reachable !== false)
    if (isAllClustersSelected) return reachable
    return reachable.filter(c => globalSelectedClusters.includes(c.name))
  }, [allClusters, globalSelectedClusters, isAllClustersSelected])

  const filteredServers = useMemo(() => {
    let result = localClusterFilter.length === 0 ? servers : servers.filter(s => localClusterFilter.includes(s.cluster))

    // Apply component filter
    if (componentFilter !== 'all') {
      if (componentFilter === 'autoscale') {
        result = result.filter(s => s.hasAutoscaler)
      } else {
        result = result.filter(s => s.componentType === componentFilter)
      }
    }

    // Sort by selected field
    const statusOrder: Record<string, number> = { running: 0, scaling: 1, stopped: 2, error: 3 }
    const componentOrder: Record<string, number> = { model: 0, epp: 1, gateway: 2, prometheus: 3, autoscaler: 4, other: 5 }
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'status':
          cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
          break
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'namespace':
          cmp = a.namespace.localeCompare(b.namespace)
          break
        case 'component':
          cmp = (componentOrder[a.componentType] ?? 99) - (componentOrder[b.componentType] ?? 99)
          break
        case 'type':
          cmp = a.type.localeCompare(b.type)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [servers, localClusterFilter, componentFilter, sortBy, sortDirection])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(filteredServers, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> Running</span>
      case 'scaling':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Scaling</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 flex items-center gap-1"><Pause className="w-2.5 h-2.5" /> Stopped</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  const getTypeBadge = (type: LLMdServer['type']) => {
    const colors: Record<string, string> = {
      'vllm': 'bg-purple-500/20 text-purple-400',
      'tgi': 'bg-blue-500/20 text-blue-400',
      'llm-d': 'bg-cyan-500/20 text-cyan-400',
      'triton': 'bg-green-500/20 text-green-400',
      'unknown': 'bg-gray-500/20 text-gray-400',
    }
    return colors[type] || 'bg-gray-500/20 text-gray-400'
  }

  const getTypeLabel = (type: LLMdServer['type']) => {
    const labels: Record<string, string> = {
      'vllm': 'vLLM',
      'tgi': 'TGI',
      'llm-d': 'llm-d',
      'triton': 'Triton',
      'unknown': 'Unknown',
    }
    return labels[type] || type
  }

  const getComponentBadge = (componentType: LLMdComponentType) => {
    const config: Record<LLMdComponentType, { bg: string, text: string, label: string }> = {
      'model': { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Model' },
      'epp': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'EPP' },
      'gateway': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Gateway' },
      'prometheus': { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Prometheus' },
      'autoscaler': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Autoscaler' },
      'other': { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Other' },
    }
    return config[componentType] || config['other']
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={50} />
        <Skeleton variant="rounded" height={50} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
          {componentFilter !== 'all' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Box className="w-3 h-3" />
              {COMPONENT_FILTERS.find(f => f.value === componentFilter)?.label}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
            {filteredServers.filter(s => s.status === 'running').length} running
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Component type filter */}
          <div ref={componentFilterRef} className="relative">
            <button
              onClick={() => setShowComponentFilter(!showComponentFilter)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                componentFilter !== 'all'
                  ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Filter by component type"
            >
              <Box className="w-3 h-3" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showComponentFilter && (
              <div className="absolute top-full right-0 mt-1 w-40 rounded-lg bg-card border border-border shadow-lg z-50">
                <div className="p-1">
                  {COMPONENT_FILTERS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setComponentFilter(opt.value)
                        setShowComponentFilter(false)
                      }}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        componentFilter === opt.value
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Cluster filter */}
          {availableClustersForFilter.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button onClick={clearClusterFilter} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>All clusters</button>
                    {availableClustersForFilter.map(cluster => (
                      <button key={cluster.name} onClick={() => toggleClusterFilter(cluster.name)} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>{cluster.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={LLMD_SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton isRefreshing={isRefreshing} isFailed={isFailed} consecutiveFailures={consecutiveFailures} lastRefresh={lastRefresh} onRefresh={refetch} size="sm" />
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-purple-400 font-medium">llm-d Inference Detection</p>
          <p className="text-muted-foreground">
            Auto-detects vLLM, TGI, LLM-d, and Triton inference servers.{' '}
            <a href="https://docs.vllm.ai/en/latest/getting_started/installation.html" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">
              vLLM docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Cpu className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{error ? `Error: ${error}` : 'No inference servers found'}</p>
            <p className="text-xs">
              {isFailed ? `Failed after ${consecutiveFailures} attempts` : 'Scanning vllm-d and platform-eval clusters'}
            </p>
            {servers.length === 0 && !isLoading && !error && (
              <button onClick={() => refetch()} className="mt-2 text-xs text-purple-400 hover:underline">
                Retry
              </button>
            )}
          </div>
        ) : paginatedItems.map((server) => {
          const compBadge = getComponentBadge(server.componentType)
          return (
            <div key={server.id} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate" title={server.name}>{server.name}</span>
                  {/* Component type badge */}
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${compBadge.bg} ${compBadge.text}`}>
                    {compBadge.label}
                  </span>
                  {/* Server type badge (vLLM, TGI, etc.) for model components */}
                  {server.componentType === 'model' && server.type !== 'unknown' && (
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getTypeBadge(server.type)}`}>
                      {getTypeLabel(server.type)}
                    </span>
                  )}
                  {/* Autoscaler badge */}
                  {server.hasAutoscaler && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 flex-shrink-0" title={server.autoscalerType === 'va' ? 'VariantAutoscaling' : server.autoscalerType === 'both' ? 'HPA + VariantAutoscaling' : 'HorizontalPodAutoscaler'}>
                      {server.autoscalerType === 'va' ? 'VA' : server.autoscalerType === 'both' ? 'HPA+VA' : 'HPA'}
                    </span>
                  )}
                </div>
                {getStatusBadge(server.status)}
              </div>
              <div className="flex items-center gap-2 text-xs mb-2">
                <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{server.namespace}</span>
                <span className="text-muted-foreground/60">on {server.cluster}</span>
                {/* Gateway status indicator */}
                {server.gatewayStatus && (
                  <span
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                      server.gatewayStatus === 'running'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                    title={`Gateway (${server.gatewayType || 'envoy'}): ${server.gatewayStatus}`}
                  >
                    <Network className="w-3 h-3" />
                    {server.gatewayType === 'istio' ? 'Istio' : server.gatewayType === 'kgateway' ? 'KGateway' : 'GW'}
                  </span>
                )}
                {/* Prometheus status indicator */}
                {server.prometheusStatus && (
                  <span
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                      server.prometheusStatus === 'running'
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                    title={`Prometheus: ${server.prometheusStatus}`}
                  >
                    <Activity className="w-3 h-3" />
                    Prom
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  {server.componentType === 'model' && (
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {server.model}</span>
                  )}
                  {server.gpu && server.gpuCount && (
                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {server.gpuCount}x {server.gpu}</span>
                  )}
                </div>
                <span className="text-muted-foreground/60">{server.readyReplicas}/{server.replicas} replicas</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

interface LLMModelsProps {
  config?: Record<string, unknown>
}

export function LLMModels({ config: _config }: LLMModelsProps) {
  const { models, isLoading, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useCachedLLMdModels(LLMD_CLUSTERS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(models, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'loaded':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Loaded</span>
      case 'downloading':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Downloading</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">Stopped</span>
      case 'error':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Error</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
          {models.filter(m => m.status === 'loaded').length} loaded
        </span>
        <div className="flex items-center gap-2">
          <CardControls limit={limit} onLimitChange={setLimit} />
          <RefreshButton isRefreshing={isRefreshing} isFailed={isFailed} consecutiveFailures={consecutiveFailures} lastRefresh={lastRefresh} onRefresh={refetch} size="sm" />
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-cyan-400 font-medium">InferencePool Detection</p>
          <p className="text-muted-foreground">
            Scans for InferencePool resources on llm-d clusters.
          </p>
        </div>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto">
        {paginatedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Layers className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No InferencePools found</p>
            <p className="text-xs">Scanning vllm-d and platform-eval clusters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border/50">
                <th className="text-left py-2">Model</th>
                <th className="text-left py-2">Namespace</th>
                <th className="text-left py-2">Cluster</th>
                <th className="text-right py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((model) => (
                <tr key={model.id} className="border-b border-border/30 hover:bg-secondary/30">
                  <td className="py-2 font-medium text-foreground truncate max-w-[150px]" title={model.name}>{model.name}</td>
                  <td className="py-2 text-muted-foreground">{model.namespace}</td>
                  <td className="py-2 text-muted-foreground">{model.cluster}</td>
                  <td className="py-2 text-right">{getStatusBadge(model.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// ML TRAINING CARDS
// =============================================================================

const DEMO_ML_JOBS = [
  { name: 'train-gpt-finetune', framework: 'PyTorch', status: 'running', gpus: 8, progress: 67, eta: '2h 15m', cluster: 'gpu-cluster-1' },
  { name: 'eval-llama-benchmark', framework: 'Ray', status: 'running', gpus: 4, progress: 89, eta: '25m', cluster: 'gpu-cluster-1' },
  { name: 'pretrain-vision-model', framework: 'JAX', status: 'queued', gpus: 16, progress: 0, eta: '-', cluster: 'us-east-1' },
  { name: 'rlhf-reward-model', framework: 'DeepSpeed', status: 'running', gpus: 8, progress: 34, eta: '5h 45m', cluster: 'us-west-2' },
  { name: 'inference-optimization', framework: 'TensorRT', status: 'completed', gpus: 2, progress: 100, eta: '-', cluster: 'eu-central-1' },
]

const DEMO_NOTEBOOKS = [
  { name: 'research-experiments', user: 'alice', status: 'running', cpu: '4 cores', memory: '16GB', gpu: '1x T4', lastActive: '2m ago' },
  { name: 'model-analysis', user: 'bob', status: 'running', cpu: '8 cores', memory: '32GB', gpu: '1x A10G', lastActive: '15m ago' },
  { name: 'data-preprocessing', user: 'charlie', status: 'idle', cpu: '2 cores', memory: '8GB', gpu: '-', lastActive: '2h ago' },
  { name: 'benchmark-suite', user: 'alice', status: 'running', cpu: '4 cores', memory: '16GB', gpu: '1x T4', lastActive: '5m ago' },
]

interface MLJobsProps {
  config?: Record<string, unknown>
}

export function MLJobs({ config: _config }: MLJobsProps) {
  const { data: jobs, isLoading } = useDemoData(DEMO_ML_JOBS)
  const { deduplicatedClusters: allClusters, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kubestellar-card-filter:ml-jobs')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(event.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    localStorage.setItem('kubestellar-card-filter:ml-jobs', JSON.stringify(localClusterFilter))
  }, [localClusterFilter])

  const toggleClusterFilter = (clusterName: string) => {
    setLocalClusterFilter(prev => prev.includes(clusterName) ? prev.filter(c => c !== clusterName) : [...prev, clusterName])
  }
  const clearClusterFilter = () => setLocalClusterFilter([])

  const availableClustersForFilter = useMemo(() => {
    const reachable = allClusters.filter(c => c.reachable !== false)
    if (isAllClustersSelected) return reachable
    return reachable.filter(c => globalSelectedClusters.includes(c.name))
  }, [allClusters, globalSelectedClusters, isAllClustersSelected])

  const filteredJobs = useMemo(() => {
    if (localClusterFilter.length === 0) return jobs
    return jobs.filter(j => localClusterFilter.includes(j.cluster))
  }, [jobs, localClusterFilter])

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(filteredJobs, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> Running</span>
      case 'queued':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Queued</span>
      case 'completed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Done</span>
      case 'failed':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> Failed</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClustersForFilter.length}
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
            {filteredJobs.filter(j => j.status === 'running').length} running
          </span>
        </div>
        <div className="flex items-center gap-2">
          {availableClustersForFilter.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button onClick={clearClusterFilter} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>All clusters</button>
                    {availableClustersForFilter.map(cluster => (
                      <button key={cluster.name} onClick={() => toggleClusterFilter(cluster.name)} className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'}`}>{cluster.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <CardControls limit={limit} onLimitChange={setLimit} />
          <RefreshButton isRefreshing={isRefreshing} isFailed={isFailed} consecutiveFailures={consecutiveFailures} lastRefresh={lastRefresh} onRefresh={refetch} size="sm" />
        </div>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-yellow-400 font-medium">ML Job Detection</p>
          <p className="text-muted-foreground">
            Auto-detects Kubeflow, Ray, and custom ML training jobs.{' '}
            <a href="https://www.kubeflow.org/docs/started/installing-kubeflow/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline">
              Kubeflow docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {paginatedItems.map((job, idx) => (
          <div key={idx} className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{job.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {job.framework}
                </span>
              </div>
              {getStatusBadge(job.status)}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
              <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {job.gpus} GPUs</span>
              {job.eta !== '-' && <span>ETA: {job.eta}</span>}
            </div>
            {job.status === 'running' && (
              <div className="w-full bg-secondary rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-yellow-500 to-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}

interface MLNotebooksProps {
  config?: Record<string, unknown>
}

export function MLNotebooks({ config: _config }: MLNotebooksProps) {
  const { data: notebooks, isLoading } = useDemoData(DEMO_NOTEBOOKS)
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const effectivePerPage = limit === 'unlimited' ? 100 : limit
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, needsPagination } = usePagination(notebooks, effectivePerPage)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Active</span>
      case 'idle':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Idle</span>
      case 'stopped':
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">Stopped</span>
      default:
        return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
          {notebooks.filter(n => n.status === 'running').length} active
        </span>
        <CardControls limit={limit} onLimitChange={setLimit} />
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs mb-4">
        <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-blue-400 font-medium">Notebook Detection</p>
          <p className="text-muted-foreground">
            Scans for JupyterHub and standalone notebook servers.{' '}
            <a href="https://jupyterhub.readthedocs.io/en/stable/getting-started/index.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              JupyterHub docs <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
      </div>

      {/* Notebook list */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border/50">
              <th className="text-left py-2">Notebook</th>
              <th className="text-left py-2">User</th>
              <th className="text-right py-2">Resources</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((nb, idx) => (
              <tr key={idx} className="border-b border-border/30 hover:bg-secondary/30">
                <td className="py-2 font-medium text-foreground">{nb.name}</td>
                <td className="py-2 text-muted-foreground">{nb.user}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {nb.cpu} / {nb.memory} {nb.gpu !== '-' && `/ ${nb.gpu}`}
                </td>
                <td className="py-2 text-right">{getStatusBadge(nb.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
