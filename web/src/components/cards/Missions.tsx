import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Rocket,
  XCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Orbit,
  Terminal,
  Stethoscope,
  Wrench,
  Package,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { ClusterBadge, getClusterInfo } from '../ui/ClusterBadge'
import { useDeployMissions } from '../../hooks/useDeployMissions'
import { useClusters } from '../../hooks/useMCP'
import type { DeployMission, DeployMissionStatus, DeployClusterStatus } from '../../hooks/useDeployMissions'
import type { DeployedDep } from '../../lib/cardEvents'
import {
  useCardData,
  commonComparators,
  CardControlsRow,
  CardSearchInput,
  CardPaginationFooter,
  CardEmptyState,
} from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'

interface MissionsProps {
  config?: Record<string, unknown>
}

const STATUS_CONFIG: Record<DeployMissionStatus, {
  icon: typeof Rocket
  color: string
  bg: string
  label: string
  animateClass?: string
}> = {
  launching: {
    icon: Rocket,
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    label: 'Launching',
    animateClass: 'animate-rocket-launch',
  },
  deploying: {
    icon: Loader2,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    label: 'Deploying',
    animateClass: 'animate-spin',
  },
  orbit: {
    icon: Orbit,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    label: 'In Orbit',
  },
  abort: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    label: 'Aborted',
  },
  partial: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/20',
    label: 'Partial',
  },
}

const CLUSTER_STATUS_CONFIG: Record<DeployClusterStatus['status'], {
  color: string
  bg: string
  barColor: string
  label: string
}> = {
  pending: { color: 'text-gray-400', bg: 'bg-gray-500/20', barColor: 'bg-gray-500', label: 'Pending' },
  applying: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', barColor: 'bg-yellow-500', label: 'Applying' },
  running: { color: 'text-green-400', bg: 'bg-green-500/20', barColor: 'bg-green-500', label: 'Running' },
  failed: { color: 'text-red-400', bg: 'bg-red-500/20', barColor: 'bg-red-500', label: 'Failed' },
}

// Status priority for sorting (active first)
const STATUS_ORDER: Record<string, number> = {
  launching: 1,
  deploying: 2,
  partial: 3,
  orbit: 4,
  abort: 5,
}

type SortByOption = 'status' | 'workload' | 'time' | 'clusters'

const SORT_OPTIONS: { value: SortByOption; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'workload', label: 'Workload' },
  { value: 'time', label: 'Time' },
  { value: 'clusters', label: 'Clusters' },
]

const CLUSTER_FILTER_KEY = 'kubestellar-card-filter:deployment-missions-clusters'

export function Missions(_props: MissionsProps) {
  const { missions, activeMissions, completedMissions } = useDeployMissions()
  const { deduplicatedClusters, isLoading } = useClusters()
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(new Set())
  const [hideCompleted, setHideCompleted] = useState(false)

  // Report state to CardWrapper for refresh animation
  useCardLoadingState({
    isLoading,
    hasAnyData: missions.length > 0 || deduplicatedClusters.length > 0,
  })

  // Manual cluster filter — filters by target clusters (not source).
  // Can't use useCardData's built-in cluster filter because the global
  // filterByCluster hardcodes item.cluster which DeployMission doesn't have.
  const [clusterFilter, setClusterFilter] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(CLUSTER_FILTER_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  const persistClusterFilter = useCallback((clusters: string[]) => {
    setClusterFilter(clusters)
    if (clusters.length === 0) {
      localStorage.removeItem(CLUSTER_FILTER_KEY)
    } else {
      localStorage.setItem(CLUSTER_FILTER_KEY, JSON.stringify(clusters))
    }
  }, [])

  const toggleClusterFilter = useCallback((name: string) => {
    persistClusterFilter(
      clusterFilter.includes(name)
        ? clusterFilter.filter(c => c !== name)
        : [...clusterFilter, name],
    )
  }, [clusterFilter, persistClusterFilter])

  const clearClusterFilter = useCallback(() => persistClusterFilter([]), [persistClusterFilter])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(e.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const availableClusters = useMemo(
    () => deduplicatedClusters.filter(c => c.reachable !== false),
    [deduplicatedClusters],
  )

  const toggleMission = (id: string) => {
    setExpandedMissions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Pre-filter: hide completed + cluster filter (by target clusters)
  const rawMissions = useMemo(() => {
    let list = hideCompleted ? activeMissions : missions
    if (clusterFilter.length > 0) {
      list = list.filter(m =>
        m.targetClusters.some(c => clusterFilter.includes(c)),
      )
    }
    return list
  }, [hideCompleted, activeMissions, missions, clusterFilter])

  // useCardData handles search, sort, and pagination
  const {
    items: visibleMissions,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<DeployMission, SortByOption>(rawMissions, {
    filter: {
      searchFields: ['workload', 'namespace', 'sourceCluster', 'groupName'],
      customPredicate: (mission, query) =>
        mission.targetClusters.some(c => c.toLowerCase().includes(query)),
      storageKey: 'deployment-missions',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: commonComparators.statusOrder<DeployMission>('status', STATUS_ORDER),
        workload: commonComparators.string<DeployMission>('workload'),
        time: (a, b) => a.startedAt - b.startedAt,
        clusters: (a, b) =>
          a.targetClusters.join(',').localeCompare(b.targetClusters.join(',')),
      },
    },
    defaultLimit: 5,
  })

  return (
    <div className="h-full flex flex-col">
      {/* Controls row: cluster filter + sort + limit */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          {activeMissions.length > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
              {activeMissions.length} active
            </span>
          ) : (
            <span className="text-[10px] text-gray-500">No active</span>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: clusterFilter.length,
            totalCount: availableClusters.length,
          }}
          clusterFilter={{
            availableClusters,
            selectedClusters: clusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection,
          }}
          extra={
            completedMissions.length > 0 ? (
              <button
                onClick={() => setHideCompleted(!hideCompleted)}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap"
              >
                {hideCompleted ? `Show done (${completedMissions.length})` : 'Hide done'}
              </button>
            ) : undefined
          }
          className="!mb-0"
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder="Search missions..."
        className="mb-2 shrink-0"
      />

      {/* Mission list — scrollable */}
      {visibleMissions.length === 0 ? (
        <CardEmptyState
          icon={Rocket}
          title="No missions found"
          message={localSearch || clusterFilter.length > 0
            ? 'Try adjusting your filters'
            : 'Deploy a workload to start a mission'}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto space-y-2">
          {visibleMissions.map(mission => {
            const isActive = mission.status === 'launching' || mission.status === 'deploying'
            return (
              <MissionRow
                key={mission.id}
                mission={mission}
                isExpanded={expandedMissions.has(mission.id)}
                onToggle={() => toggleMission(mission.id)}
                isActive={isActive}
              />
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Status legend — pinned to bottom */}
      <div className="pt-2 border-t border-gray-800 shrink-0">
        <div className="flex items-center justify-center gap-3 text-[10px] text-gray-600">
          <span className="flex items-center gap-1">
            <Rocket className="w-2.5 h-2.5 text-blue-400" /> Launch
          </span>
          <span className="flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 text-yellow-400" /> Deploy
          </span>
          <span className="flex items-center gap-1">
            <Orbit className="w-2.5 h-2.5 text-green-400" /> Orbit
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5 text-red-400" /> Abort
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Mission Row
// ============================================================================

interface MissionRowProps {
  mission: DeployMission
  isExpanded: boolean
  onToggle: () => void
  isActive: boolean
}

function MissionRow({ mission, isExpanded, onToggle, isActive }: MissionRowProps) {
  const config = STATUS_CONFIG[mission.status]
  const StatusIcon = config.icon
  const elapsed = getElapsed(mission.startedAt, mission.completedAt)
  const [showLogs, setShowLogs] = useState(false)

  // Auto-show logs when deploying (keep visible after completion for review)
  const isDeploying = mission.status === 'launching' || mission.status === 'deploying'
  const hasLogs = mission.clusterStatuses.some(cs => cs.logs && cs.logs.length > 0)

  useEffect(() => {
    if (isDeploying && hasLogs) setShowLogs(true)
  }, [isDeploying, hasLogs])

  // Calculate overall progress
  const totalClusters = mission.clusterStatuses.length
  const readyClusters = mission.clusterStatuses.filter(s => s.status === 'running').length
  const failedClusters = mission.clusterStatuses.filter(s => s.status === 'failed').length
  const progressPct = totalClusters > 0 ? ((readyClusters + failedClusters) / totalClusters) * 100 : 0

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      isActive ? `${config.bg} border-gray-700/50` : 'bg-gray-900/30 border-gray-800/50',
    )}>
      {/* Summary row - use div instead of button to avoid nesting violation with inner log toggle button */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex items-center gap-2 w-full px-3 py-2 text-left cursor-pointer"
      >
        {/* Expand arrow */}
        {isExpanded
          ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
        }

        {/* Status icon */}
        <StatusIcon className={cn(
          'w-4 h-4 shrink-0',
          config.color,
          config.animateClass,
        )} />

        {/* Workload name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200 truncate">
              {mission.workload}
            </span>
            {mission.groupName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                {mission.groupName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>{mission.namespace}</span>
            <span>&middot;</span>
            <span>{totalClusters} cluster{totalClusters !== 1 ? 's' : ''}</span>
            <span>&middot;</span>
            <span>{elapsed}</span>
          </div>
        </div>

        {/* Log toggle + Status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setShowLogs(!showLogs) }}
            className={cn(
              'p-0.5 rounded transition-colors',
              showLogs ? 'text-green-400 bg-green-500/20' : 'text-gray-500 hover:text-gray-300',
            )}
            title={showLogs ? 'Hide events' : 'Show events'}
          >
            <Terminal className="w-3 h-3" />
          </button>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-medium',
            config.bg, config.color,
          )}>
            {config.label}
          </span>
        </div>
      </div>

      {/* Progress bar — always visible so completed missions show final state */}
      <div className="px-3 pb-2">
        <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              mission.status === 'orbit' ? 'bg-green-500' :
              mission.status === 'abort' ? 'bg-red-500' :
              failedClusters > 0 ? 'bg-orange-500' : 'bg-blue-500',
            )}
            style={{ width: `${(mission.status === 'orbit' || mission.status === 'abort') ? 100 : Math.max(progressPct, 5)}%` }}
          />
        </div>
      </div>

      {/* Per-cluster progress — visible for active missions; completed missions show on expand */}
      {isActive && !isExpanded && mission.clusterStatuses.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          {mission.clusterStatuses.map(cs => (
            <ClusterStatusRow key={cs.cluster} status={cs} />
          ))}
          {mission.dependencies && mission.dependencies.length > 0 && (
            <DependencySummary dependencies={mission.dependencies} />
          )}
        </div>
      )}

      {/* AI action buttons for failed missions */}
      {(mission.status === 'abort' || mission.status === 'partial') && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border border-purple-500/20 transition-colors"
            title="AI will analyze pod events, logs, and resource limits to diagnose the failure"
          >
            <Stethoscope className="w-3 h-3" />
            Diagnose
          </button>
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
            title="AI will attempt to fix the issue (restart pods, adjust resources, etc.)"
          >
            <Wrench className="w-3 h-3" />
            Repair
          </button>
        </div>
      )}

      {/* Deploy events (always available, toggle with Terminal button) */}
      {showLogs && (
        <div className="px-3 pb-2">
          <div className="rounded bg-gray-900/80 border border-gray-800/50 overflow-hidden">
            <div className="px-2 py-1 border-b border-gray-800/50 flex items-center gap-1.5">
              <Terminal className="w-2.5 h-2.5 text-green-400" />
              <span className="text-[10px] text-green-400 font-medium">Deploy Events</span>
            </div>
            <div className="px-2 py-1.5 max-h-32 overflow-y-auto">
              {hasLogs ? (
                mission.clusterStatuses
                  .filter(cs => cs.logs && cs.logs.length > 0)
                  .map(cs => {
                    const clusterInfo = getClusterInfo(cs.cluster)
                    return (
                      <div key={cs.cluster}>
                        {mission.clusterStatuses.length > 1 && (
                          <div className={cn('text-[9px] font-medium mt-1 first:mt-0', clusterInfo.colors.text)}>
                            {cs.cluster}
                          </div>
                        )}
                        {cs.logs!.map((line, i) => (
                          <div
                            key={i}
                            className="text-[10px] font-mono text-gray-400 leading-relaxed truncate flex items-start gap-1.5"
                          >
                            <span className={cn('inline-block w-1.5 h-1.5 rounded-full mt-[5px] shrink-0', clusterInfo.colors.bg, clusterInfo.colors.border, 'border')} />
                            {line}
                          </div>
                        ))}
                      </div>
                    )
                  })
              ) : (
                <div className="text-[10px] text-gray-600 italic py-1">
                  {(mission.status === 'orbit' || mission.status === 'abort')
                    ? 'No recent events — K8s events expire after ~1 hour'
                    : 'Waiting for events...'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded cluster details */}
      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-gray-800/50 space-y-1.5">
          {mission.deployedBy && (
            <div className="text-[10px] text-gray-600">
              Deployed by: <span className="text-gray-400">{mission.deployedBy}</span>
            </div>
          )}
          {mission.clusterStatuses.map(cs => (
            <ClusterStatusRow key={cs.cluster} status={cs} />
          ))}

          {/* Dependencies summary */}
          {mission.dependencies && mission.dependencies.length > 0 && (
            <DependencySummary dependencies={mission.dependencies} />
          )}

          {/* Warnings */}
          {mission.warnings && mission.warnings.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {mission.warnings.map((w, i) => (
                <div key={i} className="text-[10px] text-yellow-500/80 flex items-start gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 mt-[2px] shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Cluster Status Row
// ============================================================================

interface ClusterStatusRowProps {
  status: DeployClusterStatus
}

function ClusterStatusRow({ status }: ClusterStatusRowProps) {
  const config = CLUSTER_STATUS_CONFIG[status.status]
  const replicaProgress = status.replicas > 0
    ? (status.readyReplicas / status.replicas) * 100
    : 0

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 shrink-0 truncate">
        <ClusterBadge cluster={status.cluster} size="sm" />
      </div>

      {/* Replica progress bar */}
      <div className="flex-1 h-0.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', config.barColor)}
          style={{ width: `${status.status === 'pending' ? 0 : Math.max(replicaProgress, 10)}%` }}
        />
      </div>

      {/* Replica count */}
      <span className={cn('text-[10px] font-mono tabular-nums shrink-0', config.color)}>
        {status.readyReplicas}/{status.replicas}
      </span>

      {/* Status label */}
      <span className={cn('text-[10px] shrink-0', config.color)}>
        {config.label}
      </span>
    </div>
  )
}

// ============================================================================
// Dependency Summary
// ============================================================================

const DEP_ACTION_STYLES: Record<string, { color: string; label: string }> = {
  created: { color: 'text-green-400', label: 'Created' },
  updated: { color: 'text-blue-400', label: 'Updated' },
  skipped: { color: 'text-gray-500', label: 'Skipped' },
  failed: { color: 'text-red-400', label: 'Failed' },
}

function DependencySummary({ dependencies }: { dependencies: DeployedDep[] }) {
  // Group by kind for summary line
  const kindCounts: Record<string, number> = {}
  for (const dep of dependencies) {
    kindCounts[dep.kind] = (kindCounts[dep.kind] || 0) + 1
  }
  const summary = Object.entries(kindCounts)
    .map(([kind, count]) => `${count} ${kind}${count !== 1 ? 's' : ''}`)
    .join(', ')

  const [showAll, setShowAll] = useState(false)

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setShowAll(!showAll)}
        className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Package className="w-2.5 h-2.5" />
        <span>Deployed {summary}</span>
        {showAll
          ? <ChevronDown className="w-2.5 h-2.5" />
          : <ChevronRight className="w-2.5 h-2.5" />}
      </button>
      {showAll && (
        <div className="mt-1 ml-4 space-y-0.5">
          {dependencies.map((dep, i) => {
            const style = DEP_ACTION_STYLES[dep.action] ?? DEP_ACTION_STYLES.created
            return (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className="text-gray-600 w-28 truncate">{dep.kind}</span>
                <span className="text-gray-400 flex-1 truncate">{dep.name}</span>
                <span className={cn('shrink-0', style.color)}>{style.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function getElapsed(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now()
  const seconds = Math.floor((end - startedAt) / 1000)

  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
