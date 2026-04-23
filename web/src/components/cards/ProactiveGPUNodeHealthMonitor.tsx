import { useState, useMemo, useRef, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, ChevronRight, ChevronDown, Server, Clock, Play, Trash2, Loader2, Settings2, RefreshCw, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { CardControlsRow, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
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
const DEFAULT_TIER = 2

const TIER_OPTIONS = [
  { value: 1, label: 'Tier 1 — Critical', description: 'Node ready, cordoned, stuck pods, operator pods, GPU events' },
  { value: 2, label: 'Tier 2 — Standard', description: '+ GPU capacity, pending pods, driver, node conditions, quotas' },
  { value: 3, label: 'Tier 3 — Full', description: '+ Utilization, MIG drift, RDMA, failed jobs, evictions' },
  { value: 4, label: 'Tier 4 — Deep', description: '+ nvidia-smi, dmesg, NVLink (requires privileged access)' },
]

// Human-readable check names
const CHECK_LABELS: Record<string, string> = {
  node_ready: 'Node Ready',
  scheduling: 'Scheduling',
  'gpu-feature-discovery': 'GPU Feature Discovery',
  'nvidia-device-plugin': 'Device Plugin',
  'dcgm-exporter': 'DCGM Exporter',
  stuck_pods: 'Stuck Pods',
  gpu_events: 'GPU Events' }

function StatusBadge({ status }: { status: string }) {
  const config = {
    healthy: { icon: CheckCircle, bg: 'bg-green-500/15', text: 'text-green-400', label: 'Healthy' },
    degraded: { icon: AlertTriangle, bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Degraded' },
    unhealthy: { icon: XCircle, bg: 'bg-red-500/15', text: 'text-red-400', label: 'Unhealthy' } }[status] || { icon: AlertTriangle, bg: 'bg-gray-500/15 dark:bg-gray-400/15', text: 'text-muted-foreground', label: status }

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
    <div className="flex flex-wrap items-center justify-between gap-y-2 py-1 text-xs">
      <span className="text-white/60">{label}</span>
      <div className="flex items-center gap-1.5">
        {check.passed ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
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
  const { t } = useTranslation(['common', 'cards'])
  const { status, isLoading, error, actionInProgress, install, uninstall, refetch } = useGPUHealthCronJob(cluster)
  const [showInstallDialog, setShowInstallDialog] = useState(false)
  const [showConfirmUninstall, setShowConfirmUninstall] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE)
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE)
  const [tier, setTier] = useState(DEFAULT_TIER)

  // Sync tier from status when loaded
  useEffect(() => {
    if (status?.tier && status.tier > 0) setTier(status.tier)
  }, [status?.tier])

  const handleInstall = async () => {
    await install({ namespace, schedule, tier })
    setShowInstallDialog(false)
  }

  const handleUpdateTier = async () => {
    if (!status) return
    await install({ namespace: status.namespace, schedule: status.schedule, tier })
  }

  const handleUninstall = async () => {
    await uninstall({ namespace: status?.namespace })
    setShowConfirmUninstall(false)
  }

  const tierChanged = status?.installed && status.tier > 0 && tier !== status.tier

  if (isLoading && !status) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/40">
        <Loader2 className="w-3 h-3 animate-spin" />
        {t('cards:gpuNodeHealth.checking', { cluster })}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-secondary overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <ClusterBadge cluster={cluster} size="sm" />
        <div className="flex-1 min-w-0">
          {status?.installed ? (
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <span className="text-xs text-green-300">{t('cards:gpuNodeHealth.installed')}</span>
              {status.schedule && (
                <span className="text-2xs text-white/40 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {status.schedule}
                </span>
              )}
              <span className="text-2xs text-white/30 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                {t('cards:gpuNodeHealth.tier', { tier: status.tier || 1 })}
              </span>
              {status.version > 0 && (
                <span className="text-2xs text-white/20">v{status.version}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <span className="text-xs text-white/40">{t('cards:gpuNodeHealth.notInstalled')}</span>
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
                  'text-2xs px-1.5 py-0.5 rounded',
                  status.lastResult === 'success' ? 'bg-green-500/10 text-green-400' :
                  status.lastResult === 'failed' ? 'bg-red-500/10 text-red-400' :
                  'bg-secondary text-white/40'
                )}>
                  {t('cards:gpuNodeHealth.last', { result: status.lastResult })}
                </span>
              )}
              {/* Results toggle */}
              {status.lastResults && status.lastResults.length > 0 && (
                <button
                  onClick={() => setShowResults(prev => !prev)}
                  className={cn(
                    'p-1 rounded transition-colors',
                    showResults ? 'bg-blue-500/15 text-blue-400' : 'text-white/30 hover:text-white/50'
                  )}
                  title={t('cards:gpuNodeHealth.viewResults')}
                >
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showResults && 'rotate-180')} />
                </button>
              )}
              {/* Uninstall button */}
              {!showConfirmUninstall ? (
                <button
                  onClick={() => setShowConfirmUninstall(true)}
                  disabled={!!actionInProgress}
                  className="p-1 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors disabled:opacity-50"
                  title={t('cards:gpuNodeHealth.uninstallCronJob')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleUninstall}
                    disabled={!!actionInProgress}
                    className="px-2 py-0.5 text-2xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {actionInProgress === 'uninstall' ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : t('cards:gpuNodeHealth.confirm')}
                  </button>
                  <button
                    onClick={() => setShowConfirmUninstall(false)}
                    className="px-2 py-0.5 text-2xs rounded bg-secondary text-white/40 hover:text-white/60 transition-colors"
                  >
                    {t('cards:gpuNodeHealth.cancel')}
                  </button>
                </div>
              )}
            </>
          ) : status?.canInstall ? (
            !showInstallDialog ? (
              <button
                onClick={() => setShowInstallDialog(true)}
                disabled={!!actionInProgress}
                className="flex items-center gap-1 px-2 py-1 text-2xs rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                {t('cards:gpuNodeHealth.install')}
              </button>
            ) : null
          ) : (
            <span className="text-2xs text-white/30 italic">{t('cards:gpuNodeHealth.noPermissions')}</span>
          )}
        </div>
      </div>

      {/* Install dialog */}
      {showInstallDialog && (
        <div className="border-t border-border px-3 py-2 bg-foreground/1 space-y-2">
          <div className="text-2xs text-white/50 uppercase tracking-wider">{t('cards:gpuNodeHealth.installCronJob')}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-2xs text-white/40 block mb-0.5">{t('cards:gpuNodeHealth.namespace')}</label>
              <input
                type="text"
                value={namespace}
                onChange={e => setNamespace(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/80 focus:outline-hidden focus:border-white/20"
              />
            </div>
            <div>
              <label className="text-2xs text-white/40 block mb-0.5">{t('cards:gpuNodeHealth.scheduleCron')}</label>
              <input
                type="text"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/80 focus:outline-hidden focus:border-white/20"
              />
            </div>
          </div>
          {/* Tier selector */}
          <div>
            <label className="text-2xs text-white/40 block mb-0.5">{t('cards:gpuNodeHealth.checkTier')}</label>
            <select
              value={tier}
              onChange={e => setTier(Number(e.target.value))}
              className="w-full px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/80 focus:outline-hidden focus:border-white/20"
            >
              {TIER_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-2xs text-white/30 mt-0.5">
              {TIER_OPTIONS.find(t => t.value === tier)?.description}
            </p>
            {tier === 4 && (
              <p className="text-2xs text-yellow-400/80 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('cards:gpuNodeHealth.tier4Warning')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowInstallDialog(false)}
              className="px-2 py-1 text-2xs rounded bg-secondary text-white/40 hover:text-white/60 transition-colors"
            >
              {t('cards:gpuNodeHealth.cancel')}
            </button>
            <button
              onClick={handleInstall}
              disabled={!!actionInProgress}
              className="flex items-center gap-1 px-2 py-1 text-2xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'install' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {t('cards:gpuNodeHealth.install')}
            </button>
          </div>
        </div>
      )}

      {/* Tier selector + update (when installed) */}
      {status?.installed && status.canInstall && (
        <div className="border-t border-border px-3 py-1.5 flex items-center gap-2">
          <span className="text-2xs text-white/40">{t('cards:gpuNodeHealth.tierLabel')}</span>
          <select
            value={tier}
            onChange={e => setTier(Number(e.target.value))}
            className="px-1.5 py-0.5 text-2xs rounded border border-white/10 bg-secondary text-white/60 focus:outline-hidden focus:border-white/20"
          >
            {TIER_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {tierChanged && (
            <button
              onClick={handleUpdateTier}
              disabled={!!actionInProgress}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs rounded bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'install' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {t('cards:gpuNodeHealth.update')}
            </button>
          )}
        </div>
      )}

      {/* Job stats (when installed) */}
      {status?.installed && (status.activeJobs > 0 || status.failedJobs > 0 || status.successJobs > 0) && (
        <div className="border-t border-border px-3 py-1.5 flex items-center gap-3 text-2xs">
          <span className="text-white/40">{t('cards:gpuNodeHealth.jobs')}</span>
          {status.activeJobs > 0 && <span className="text-blue-400">{t('cards:gpuNodeHealth.active', { count: status.activeJobs })}</span>}
          {status.successJobs > 0 && <span className="text-green-400">{t('cards:gpuNodeHealth.succeeded', { count: status.successJobs })}</span>}
          {status.failedJobs > 0 && <span className="text-red-400">{t('cards:gpuNodeHealth.jobsFailed', { count: status.failedJobs })}</span>}
          {status.lastRun && (
            <span className="text-white/30 ml-auto">Last: {new Date(status.lastRun).toLocaleTimeString()}</span>
          )}
        </div>
      )}

      {/* CronJob Results (expandable) */}
      {showResults && status?.lastResults && status.lastResults.length > 0 && (
        <div className="border-t border-border px-3 py-2 bg-foreground/1 space-y-1.5">
          <div className="text-2xs text-white/50 uppercase tracking-wider">{t('cards:gpuNodeHealth.latestResults')}</div>
          {status.lastResults.map(result => (
            <div key={result.nodeName} className="rounded border border-border bg-secondary p-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-white/80">{result.nodeName}</span>
                <StatusBadge status={result.status} />
                {result.gpuCount != null && (
                  <span className="text-2xs text-white/30">{result.gpuCount} GPUs</span>
                )}
              </div>
              <div className="space-y-0.5">
                {(result.checks || []).map(check => (
                  <CheckRow key={check.name} check={check} />
                ))}
              </div>
              {result.issues && result.issues.length > 0 && (
                <div className="mt-1 pt-1 border-t border-white/4">
                  {result.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-1 text-2xs text-red-300/80">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-red-400/60" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border-t border-border px-3 py-1.5 text-xs text-red-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
          <button onClick={refetch} className="ml-auto text-2xs text-white/40 hover:text-white/60 underline">
            {t('cards:gpuNodeHealth.retry')}
          </button>
        </div>
      )}
    </div>
  )
}

function ProactiveGPUNodeHealthMonitorInternal() {
  const { t } = useTranslation(['common', 'cards'])
  const {
    nodes,
    isLoading,
    isRefreshing,
    isDemoFallback,
    isFailed,
    consecutiveFailures,
    lastRefresh } = useCachedGPUNodeHealth()

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

  // Report loading state to CardWrapper (lastRefresh enables "Updated Xm ago" freshness display)
  useCardLoadingState({
    isLoading: isLoading && nodes.length === 0,
    isRefreshing,
    hasAnyData: nodes.length > 0,
    isFailed,
    consecutiveFailures,
    isDemoData: isDemoFallback,
    lastRefresh })

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
  const summary = (() => {
    let healthy = 0, degraded = 0, unhealthy = 0
    for (const n of nodes) {
      if (n.status === 'healthy') healthy++
      else if (n.status === 'degraded') degraded++
      else unhealthy++
    }
    return { healthy, degraded, unhealthy }
  })()

  // Available clusters for filter
  const availableClusters = (() => {
    const set = new Set(nodes.map((n: GPUNodeHealthStatus) => n.cluster))
    return Array.from(set).sort()
  })()

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
        <p className="text-sm font-medium">{t('cards:gpuNodeHealth.noGPUNodes')}</p>
        <p className="text-xs mt-1">{t('cards:gpuNodeHealth.connectClusters')}</p>
        {/* Still show CronJob panel even with no nodes — user may want to set up monitoring */}
        {availableClusters.length === 0 && (
          <button
            onClick={() => setShowCronJobPanel(prev => !prev)}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-border bg-secondary text-muted-foreground hover:text-foreground/70 hover:bg-secondary/80 transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {t('cards:gpuNodeHealth.cronJobSetup')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Summary row */}
      <div className="flex gap-2">
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.unhealthy > 0 ? 'bg-red-500/15 ring-1 ring-red-500/30' : 'bg-secondary')}>
          <div className={cn('text-lg font-bold', summary.unhealthy > 0 ? 'text-red-400' : 'text-white/30')}>{summary.unhealthy}</div>
          <div className="text-2xs text-white/40 uppercase tracking-wider">{t('cards:gpuNodeHealth.unhealthy')}</div>
        </div>
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.degraded > 0 ? 'bg-yellow-500/15 ring-1 ring-yellow-500/30' : 'bg-secondary')}>
          <div className={cn('text-lg font-bold', summary.degraded > 0 ? 'text-yellow-400' : 'text-white/30')}>{summary.degraded}</div>
          <div className="text-2xs text-white/40 uppercase tracking-wider">{t('cards:gpuNodeHealth.degraded')}</div>
        </div>
        <div className={cn('flex-1 rounded-lg px-3 py-2 text-center', summary.healthy > 0 ? 'bg-green-500/10' : 'bg-secondary')}>
          <div className={cn('text-lg font-bold', summary.healthy > 0 ? 'text-green-400' : 'text-white/30')}>{summary.healthy}</div>
          <div className="text-2xs text-white/40 uppercase tracking-wider">{t('cards:gpuNodeHealth.healthy')}</div>
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
          containerRef: clusterFilterRef }}
        cardControls={{
          limit: PAGE_SIZE,
          onLimitChange: () => {},
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (v: string) => setSortField(v as SortField),
          sortDirection,
          onSortDirectionChange: (d: SortDirection) => setSortDirection(d) }}
        extra={
          <div className="flex items-center gap-1">
            {search && (
              <button
                onClick={() => setSearch('')}
                className="px-2 py-1 text-xs rounded border border-white/10 bg-secondary text-white/50 hover:text-white/70"
              >
                {t('cards:gpuNodeHealth.clearSearch')}
              </button>
            )}
            <button
              onClick={() => setShowCronJobPanel(prev => !prev)}
              className={cn(
                'p-1 rounded transition-colors',
                showCronJobPanel ? 'bg-blue-500/15 text-blue-400' : 'text-white/30 hover:text-white/50 hover:bg-secondary'
              )}
              title={t('cards:gpuNodeHealth.cronJobManagement')}
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
          placeholder={t('cards:gpuNodeHealth.searchPlaceholder')}
          className="w-full px-3 py-1.5 text-xs rounded border border-white/10 bg-secondary text-white/80 placeholder:text-white/30 focus:outline-hidden focus:border-white/20"
        />
      </div>

      {/* CronJob Management Panel */}
      {showCronJobPanel && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/3 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-300">{t('cards:gpuNodeHealth.cronJobTitle')}</span>
            <span className="text-2xs text-white/30">{t('cards:gpuNodeHealth.automatedChecks')}</span>
          </div>
          <div className="space-y-1">
            {availableClusters.map(cluster => (
              <CronJobClusterPanel key={cluster} cluster={cluster} />
            ))}
            {availableClusters.length === 0 && (
              <div className="text-xs text-white/30 text-center py-2">
                {t('cards:gpuNodeHealth.noGPUClusters')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node list.
        * Issue 8883: roving-tabindex keynav on each node row — Enter/Space
        * toggles expand; ArrowUp/Down move focus between sibling rows;
        * Home/End jump to ends. Container gets role="list".
        */}
      <div role="list" className="flex-1 overflow-auto space-y-1">
        {paginatedNodes.map((node, idx, arr) => {
          const isExpanded = expandedNode === `${node.cluster}/${node.nodeName}`
          const nodeKey = `${node.cluster}/${node.nodeName}`
          const toggleExpand = () => setExpandedNode(isExpanded ? null : nodeKey)
          const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
            const list = e.currentTarget.closest('[role="list"]')
            const items = list ? Array.from(list.querySelectorAll<HTMLDivElement>('[data-keynav-item="gpu-node"]')) : []
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpand()
            } else if (e.key === 'ArrowDown' && idx < arr.length - 1) {
              e.preventDefault()
              items[idx + 1]?.focus()
            } else if (e.key === 'ArrowUp' && idx > 0) {
              e.preventDefault()
              items[idx - 1]?.focus()
            } else if (e.key === 'Home') {
              e.preventDefault()
              items[0]?.focus()
            } else if (e.key === 'End') {
              e.preventDefault()
              items[items.length - 1]?.focus()
            }
          }
          return (
            <div key={nodeKey} className="rounded-lg border border-border bg-secondary overflow-hidden">
              {/* Node row */}
              <div
                data-keynav-item="gpu-node"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={t('common:actions.toggleGPUNodeAria', { node: node.nodeName })}
                className="group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-secondary transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400"
                onClick={toggleExpand}
                onKeyDown={handleRowKeyDown}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />
                )}
                <StatusBadge status={node.status} />
                <span className="text-xs text-white/90 font-mono truncate flex-1">{node.nodeName}</span>
                <ClusterBadge cluster={node.cluster} size="sm" />
                <span className="text-2xs text-white/40 whitespace-nowrap">
                  {node.gpuCount} GPU{node.gpuCount !== 1 ? 's' : ''}
                </span>
                <CardAIActions
                  resource={{
                    kind: 'Node',
                    name: node.nodeName,
                    cluster: node.cluster,
                    status: node.status }}
                  issues={(node.issues || []).map((issue: string, idx: number) => ({
                    name: `Issue ${idx + 1}`,
                    message: issue }))}
                  additionalContext={{
                    gpuType: node.gpuType,
                    gpuCount: node.gpuCount,
                    stuckPods: node.stuckPods,
                    checks: node.checks }}
                />
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-border px-4 py-2 bg-foreground/1">
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
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="text-2xs text-white/40 uppercase tracking-wider mb-1">{t('cards:gpuNodeHealth.issues')}</div>
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
                    className="mt-2 px-3 py-1 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded text-muted-foreground hover:text-foreground/80 transition-colors"
                  >
                    {t('cards:gpuNodeHealth.viewNodeDetails')}
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

export function ProactiveGPUNodeHealthMonitor() {
  return (
    <DynamicCardErrorBoundary cardId="ProactiveGPUNodeHealthMonitor">
      <ProactiveGPUNodeHealthMonitorInternal />
    </DynamicCardErrorBoundary>
  )
}

export default ProactiveGPUNodeHealthMonitor
