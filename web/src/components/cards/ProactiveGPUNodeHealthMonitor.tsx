import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { CheckCircle, AlertTriangle, XCircle, ChevronRight, ChevronDown, Server, Clock, Play, Trash2, Loader2, Settings2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { CardControlsRow, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useCachedGPUNodeHealth, useGPUHealthCronJob } from '../../hooks/useCachedData'
import type { GPUNodeHealthStatus, GPUNodeHealthCheck } from '../../hooks/useMCP'

// Sort field options
type SortField = 'status' | 'nodeName' | 'cluster' | 'gpuCount'
type SortDirection = 'asc' | 'desc'

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'nodeName', label: 'Node' },
  { value: 'cluster', label: 'Cluster' },
  { value: 'gpuCount', label: 'GPU Count' },
]

const STATUS_ORDER: Record<string, number> = { unhealthy: 0, degraded: 1, healthy: 2 }

const PAGE_SIZE = 5

const DEFAULT_SCHEDULE = '*/5 * * * *'
const DEFAULT_NAMESPACE = 'nvidia-gpu-operator'

// Human-readable check names
const CHECK_LABELS: Record<string, string> = {
  node_ready: 'Node Ready',
  scheduling: 'Scheduling',
  'gpu-feature-discovery': 'GPU Feature Discovery',
  'nvidia-device-plugin': 'Device Plugin',
  'dcgm-exporter': 'DCGM Exporter',
  stuck_pods: 'Stuck Pods',
  gpu_events: 'GPU Events',
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    healthy: { icon: CheckCircle, bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Healthy' },
    degraded: { icon: AlertTriangle, bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Degraded' },
    unhealthy: { icon: XCircle, bg: 'bg-red-500/15', text: 'text-red-400', label: 'Unhealthy' },
  }[status] || { icon: AlertTriangle, bg: 'bg-gray-500/15', text: 'text-gray-400', label: status }

  const Icon = config.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', config.bg, config.text)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

function CheckRow({ check }: { check: GPUNodeHealthCheck }) {
  const label = CHECK_LABELS[check.name] || check.name
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-white/60">{label}</span>
      <div className="flex items-center gap-1.5">
        {check.passed ? (
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <>
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            {check.message && <span className="text-red-300/80 max-w-[200px] truncate">{check.message}</span>}
          </>
        )}
      </div>
    </div>
  )
}

// CronJob management panel for a single cluster
function CronJobClusterPanel({ cluster }: { cluster: string }) {
  const { status, isLoading, error, actionInProgress, install, uninstall, refetch } = useGPUHealthCronJob(cluster)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [showConfirmUninstall, setShowConfirmUninstall] = useState(false)
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)

  const handleInstall = useCallback(async () => {
    await install({ namespace, schedule })
    setShowInstallDialog(false)
  }, [install, namespace, schedule])

  const handleUninstall = useCallback(async () => {
    await uninstall({ namespace: status?.namespace })
    setShowConfirmUninstall(false)
  }, [uninstall, status?.namespace])

  if (isLoading && !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/40">
        <Loader2 className="w-3 h-3 animate-spin" />
        Checking {cluster}...
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <ClusterBadge cluster={cluster} size="sm" />
        <div className="flex-1 min-w-0">
          {status?.installed ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300">Installed</span>
              {status.schedule && (
                <span className="text-[10px] text-white/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {status.schedule}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <span className="text-xs text-white/40">Not installed</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {status?.installed ? (
            <>
              {/* Status info */}
              {status.lastResult && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  status.lastResult === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                  status.lastResult === 'failed' ? 'bg-red-500/10 text-red-400' :
                  'bg-white/5 text-white/40'
                )}>
                  Last: {status.lastResult}
                </span>
              )}
              {/* Uninstall button */}
              {!showConfirmUninstall ? (
                <button
                  onClick={() => setShowConfirmUninstall(true)}
                  disabled={!!actionInProgress}
                  className="p-1 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors disabled:opacity-50"
                  title="Uninstall CronJob"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleUninstall}
                    disabled={!!actionInProgress}
                    className="px-2 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {actionInProgress === 'uninstall' ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowConfirmUninstall(false)}
                    className="px-2 py-0.5 text-[10px] rounded bg-white/5 text-white/40 hover:text-white/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          ) : status?.canInstall ? (
            !showInstallDialog ? (
              <button
                onClick={() => setShowInstallDialog(true)}
                disabled={!!actionInProgress}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                Install
              </button>
            ) : null
          ) : (
            <span className="text-[10px] text-white/30 italic">No permissions</span>
          )}
        </div>
      </div>

      {/* Install dialog */}
      {showInstallDialog && (
        <div className="border-t border-white/[0.06] px-3 py-2 bg-white/[0.01] space-y-2">
          <div className="text-[10px] text-white/50 uppercase tracking-wider">Install GPU Health CronJob</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/40 block mb-0.5">Namespace</label>
              <input
                type="text"
                value={namespace}
                onChange={e => setNamespace(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-white/[0.03] text-white/80 focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 block mb-0.5">Schedule (cron)</label>
              <input
                type="text"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-white/[0.03] text-white/80 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowInstallDialog(false)}
              className="px-2 py-1 text-[10px] rounded bg-white/5 text-white/40 hover:text-white/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInstall}
              disabled={!!actionInProgress}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'install' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Install
            </button>
          </div>
        </div>
      )}

      {/* Job stats (when installed) */}
      {status?.installed && (status.activeJobs > 0 || status.failedJobs > 0 || status.successJobs > 0) && (
        <div className="border-t border-white/[0.06] px-3 py-1.5 flex items-center gap-3 text-[10px]">
          <span className="text-white/40">Jobs:</span>
          {status.activeJobs > 0 && <span className="text-blue-400">{status.activeJobs} active</span>}
          {status.successJobs > 0 && <span className="text-emerald-400">{status.successJobs} succeeded</span>}
          {status.failedJobs > 0 && <span className="text-red-400">{status.failedJobs} failed</span>}
          {status.lastRun && (
            <span className="text-white/30 ml-auto">Last: {new Date(status.lastRun).toLocaleTimeString()}</span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border-t border-white/[0.06] px-3 py-1.5 text-xs text-red-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
          <button onClick={refetch} className="ml-auto text-[10px] text-white/40 hover:text-white/60 underline">
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

export function ProactiveGPUNodeHealthMonitor() {
  const {
    nodes,
    isLoading,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
  } = useCachedGPUNodeHealth()

  const { drillToNode } = useDrillDownActions()

  // Card controls state
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const [showCronJobPanel, setShowCronJobPanel] = useState(false)

  const clusterFilterRef = useRef<HTMLDivElement>(null!)

  // Report loading state to CardWrapper
  useCardLoadingState({
    isLoading,
    hasAnyData: nodes.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
  })

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(e.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Compute summary counts
  const summary = useMemo(() => {
    let healthy = 0, degraded = 0, unhealthy = 0
    for (const n of nodes) {
      if (n.status === 'healthy') healthy++
      else if (n.status === 'degraded') degraded++
      else unhealthy++
    }
    return { healthy, degraded, unhealthy }
  }, [nodes])

  // Available clusters for filter
  const availableClusters = useMemo(() => {
    const set = new Set(nodes.map((n: GPUNodeHealthStatus) => n.cluster))
    return Array.from(set).sort()
  }, [nodes])

  // Filter, search, sort
  const filteredNodes = useMemo(() => {
    let result = [...nodes]

    // Cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(n => localClusterFilter.includes(n.cluster))
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(n =>
        n.nodeName.toLowerCase().includes(q) ||
        n.cluster.toLowerCase().includes(q) ||
        n.gpuType.toLowerCase().includes(q) ||
        (n.issues || []).some((i: string) => i.toLowerCase().includes(q))
      )
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'status':
          cmp = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
          break
        case 'nodeName':
          cmp = a.nodeName.localeCompare(b.nodeName)
          break
        case 'cluster':
          cmp = a.cluster.localeCompare(b.cluster)
          break
        case 'gpuCount':
          cmp = a.gpuCount - b.gpuCount
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [nodes, localClusterFilter, search, sortField, sortDirection])

  // Pagination
  const totalItems = filteredNodes.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const paginatedNodes = filteredNodes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1) }, [search, localClusterFilter, sortField, sortDirection])

  if (nodes.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-white/40">
        <Server className="w-8 h-8 mb-2" />
        <p className="text-sm font-medium">No GPU Nodes Found</p>
        <p className="text-xs mt-1">Connect clusters with GPU nodes to enable health monitoring</p>
        {/* Still show CronJob panel even with no nodes — user may want to set up monitoring */}
        {availableClusters.length === 0 && (
          <button
            onClick={() => setShowCronJobPanel(prev => !prev)}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            CronJob Setup
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Summary row */}
      <div className="flex gap-2">
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.unhealthy > 0 ? 'bg-red-500/15 ring-1 ring-red-500/30' : 'bg-white/[0.03]')}>
          <div className={cn('text-lg font-bold', summary.unhealthy > 0 ? 'text-red-400' : 'text-white/30')}>{summary.unhealthy}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Unhealthy</div>
        </div>
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.degraded > 0 ? 'bg-amber-500/15 ring-1 ring-amber-500/30' : 'bg-white/[0.03]')}>
          <div className={cn('text-lg font-bold', summary.degraded > 0 ? 'text-amber-400' : 'text-white/30')}>{summary.degraded}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Degraded</div>
        </div>
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.healthy > 0 ? 'bg-emerald-500/10' : 'bg-white/[0.03]')}>
          <div className={cn('text-lg font-bold', summary.healthy > 0 ? 'text-emerald-400' : 'text-white/30')}>{summary.healthy}</div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider">Healthy</div>
        </div>
      </div>

      {/* Controls */}
      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClusters.map(c => ({ name: c })),
          selectedClusters: localClusterFilter,
          onToggle: (cluster: string) => {
            setLocalClusterFilter(prev =>
              prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster]
            )
          },
          onClear: () => setLocalClusterFilter([]),
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
        }}
        cardControls={{
          limit: PAGE_SIZE,
          onLimitChange: () => {},
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (v: string) => setSortField(v as SortField),
          sortDirection,
          onSortDirectionChange: (d: SortDirection) => setSortDirection(d),
        }}
        extra={
          <div className="flex items-center gap-1">
            {search && (
              <button
                onClick={() => setSearch('')}
                className="px-2 py-1 text-xs rounded border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
              >
                Clear search
              </button>
            )}
            <button
              onClick={() => setShowCronJobPanel(prev => !prev)}
              className={cn(
                'p-1 rounded transition-colors',
                showCronJobPanel ? 'bg-blue-500/15 text-blue-400' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.03]'
              )}
              title="CronJob Management"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      />

      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search nodes, clusters, GPU types..."
          className="w-full px-3 py-1.5 text-xs rounded border border-white/10 bg-white/[0.03] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* CronJob Management Panel */}
      {showCronJobPanel && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-300">GPU Health CronJob</span>
            <span className="text-[10px] text-white/30">Automated health checks per cluster</span>
          </div>
          <div className="space-y-1">
            {availableClusters.map(cluster => (
              <CronJobClusterPanel key={cluster} cluster={cluster} />
            ))}
            {availableClusters.length === 0 && (
              <div className="text-xs text-white/30 text-center py-2">
                No GPU clusters available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node list */}
      <div className="flex-1 overflow-auto space-y-1">
        {paginatedNodes.map(node => {
          const isExpanded = expandedNode === `${node.cluster}/${node.nodeName}`
          const nodeKey = `${node.cluster}/${node.nodeName}`
          return (
            <div key={nodeKey} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              {/* Node row */}
              <div
                className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors"
                onClick={() => setExpandedNode(isExpanded ? null : nodeKey)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
                )}
                <StatusBadge status={node.status} />
                <span className="text-xs text-white/90 font-mono truncate flex-1">{node.nodeName}</span>
                <ClusterBadge cluster={node.cluster} size="sm" />
                <span className="text-[10px] text-white/40 whitespace-nowrap">
                  {node.gpuCount} GPU{node.gpuCount !== 1 ? 's' : ''}
                </span>
                <CardAIActions
                  resource={{
                    kind: 'Node',
                    name: node.nodeName,
                    cluster: node.cluster,
                    status: node.status,
                  }}
                  issues={(node.issues || []).map((issue: string, idx: number) => ({
                    name: `Issue ${idx + 1}`,
                    message: issue,
                  }))}
                  additionalContext={{
                    gpuType: node.gpuType,
                    gpuCount: node.gpuCount,
                    stuckPods: node.stuckPods,
                    checks: node.checks,
                  }}
                />
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-white/[0.06] px-4 py-2 bg-white/[0.01]">
                  {/* GPU type */}
                  <div className="text-xs text-white/50 mb-2">{node.gpuType}</div>

                  {/* Health checks */}
                  <div className="space-y-0.5">
                    {(node.checks || []).map((check: GPUNodeHealthCheck) => (
                      <CheckRow key={check.name} check={check} />
                    ))}
                  </div>

                  {/* Issues summary */}
                  {(node.issues || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/[0.06]">
                      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Issues</div>
                      {(node.issues || []).map((issue: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-red-300/80 py-0.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-red-400/60" />
                          {issue}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drill down button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      drillToNode(node.cluster, node.nodeName, { issue: (node.issues || [])[0] })
                    }}
                    className="mt-2 px-3 py-1 text-xs bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 rounded text-white/60 hover:text-white/80 transition-colors"
                  >
                    View Node Details
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={PAGE_SIZE}
        onPageChange={setCurrentPage}
        needsPagination={totalPages > 1}
      />
    </div>
  )
}

export default ProactiveGPUNodeHealthMonitor
