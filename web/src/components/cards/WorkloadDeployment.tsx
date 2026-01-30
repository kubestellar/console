import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Box,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Layers,
  Server,
  Database,
  Gauge,
  Plus,
  ArrowUpRight,
  GripVertical,
} from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useCardData, commonComparators, CardSearchInput, CardControlsRow, CardPaginationFooter } from '../../lib/cards'
import { cn } from '../../lib/cn'
import { useWorkloads, Workload as ApiWorkload } from '../../hooks/useWorkloads'
import { useClusters } from '../../hooks/useMCP'

// Workload types
type WorkloadType = 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'Job' | 'CronJob'
type WorkloadStatus = 'Running' | 'Pending' | 'Degraded' | 'Failed' | 'Unknown'

interface ClusterDeployment {
  cluster: string
  status: WorkloadStatus
  replicas: number
  readyReplicas: number
  lastUpdated: string
}

export interface Workload {
  name: string
  namespace: string
  type: WorkloadType
  status: WorkloadStatus
  replicas: number
  readyReplicas: number
  image: string
  labels: Record<string, string>
  targetClusters: string[]
  deployments: ClusterDeployment[]
  createdAt: string
}

// Demo workload data
const DEMO_WORKLOADS: Workload[] = [
  {
    name: 'nginx-ingress',
    namespace: 'ingress-system',
    type: 'Deployment',
    status: 'Running',
    replicas: 3,
    readyReplicas: 3,
    image: 'nginx/nginx-ingress:3.4.0',
    labels: { app: 'nginx-ingress', tier: 'frontend' },
    targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
      { cluster: 'us-west-2', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
      { cluster: 'eu-central-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'api-gateway',
    namespace: 'production',
    type: 'Deployment',
    status: 'Degraded',
    replicas: 5,
    readyReplicas: 3,
    image: 'company/api-gateway:v2.5.1',
    labels: { app: 'api-gateway', tier: 'api' },
    targetClusters: ['us-east-1', 'us-west-2'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
      { cluster: 'us-west-2', status: 'Degraded', replicas: 2, readyReplicas: 0, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'postgres-primary',
    namespace: 'databases',
    type: 'StatefulSet',
    status: 'Running',
    replicas: 1,
    readyReplicas: 1,
    image: 'postgres:15.4',
    labels: { app: 'postgres', role: 'primary' },
    targetClusters: ['us-east-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 1, readyReplicas: 1, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'fluentd',
    namespace: 'logging',
    type: 'DaemonSet',
    status: 'Running',
    replicas: 12,
    readyReplicas: 12,
    image: 'fluent/fluentd:v1.16',
    labels: { app: 'fluentd', tier: 'logging' },
    targetClusters: ['us-east-1', 'us-west-2', 'eu-central-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Running', replicas: 5, readyReplicas: 5, lastUpdated: new Date().toISOString() },
      { cluster: 'us-west-2', status: 'Running', replicas: 4, readyReplicas: 4, lastUpdated: new Date().toISOString() },
      { cluster: 'eu-central-1', status: 'Running', replicas: 3, readyReplicas: 3, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'ml-training',
    namespace: 'ml-workloads',
    type: 'Job',
    status: 'Pending',
    replicas: 1,
    readyReplicas: 0,
    image: 'company/ml-trainer:latest',
    labels: { app: 'ml-training', team: 'data-science' },
    targetClusters: ['gpu-cluster-1'],
    deployments: [
      { cluster: 'gpu-cluster-1', status: 'Pending', replicas: 1, readyReplicas: 0, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'payment-service',
    namespace: 'payments',
    type: 'Deployment',
    status: 'Failed',
    replicas: 2,
    readyReplicas: 0,
    image: 'company/payment-service:v1.8.0',
    labels: { app: 'payment-service', tier: 'backend' },
    targetClusters: ['us-east-1'],
    deployments: [
      { cluster: 'us-east-1', status: 'Failed', replicas: 2, readyReplicas: 0, lastUpdated: new Date().toISOString() },
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const DEMO_STATS = {
  totalWorkloads: 24,
  uniqueWorkloads: 24,
  runningCount: 18,
  degradedCount: 3,
  pendingCount: 2,
  failedCount: 1,
  totalClusters: 5,
}

const StatusIcon = ({ status }: { status: WorkloadStatus }) => {
  switch (status) {
    case 'Running':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'Degraded':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'Pending':
      return <Clock className="h-4 w-4 text-blue-500" />
    case 'Failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Gauge className="h-4 w-4 text-gray-400" />
  }
}

const TypeIcon = ({ type }: { type: WorkloadType }) => {
  switch (type) {
    case 'Deployment':
      return <Box className="h-4 w-4 text-blue-500" />
    case 'StatefulSet':
      return <Database className="h-4 w-4 text-purple-500" />
    case 'DaemonSet':
      return <Layers className="h-4 w-4 text-orange-500" />
    case 'Job':
    case 'CronJob':
      return <Server className="h-4 w-4 text-green-500" />
    default:
      return <Box className="h-4 w-4 text-gray-400" />
  }
}

const statusColors: Record<WorkloadStatus, string> = {
  Running: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  Degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  Unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

// Draggable workload item component
interface DraggableWorkloadItemProps {
  workload: Workload
  isSelected: boolean
  onSelect: () => void
}

function DraggableWorkloadItem({ workload, isSelected, onSelect }: DraggableWorkloadItemProps) {
  // Source cluster is the first cluster in the list (where we'll copy from)
  const sourceCluster = workload.targetClusters[0] || 'unknown'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `workload-${sourceCluster}-${workload.namespace}-${workload.name}`,
    data: {
      type: 'workload',
      workload: {
        name: workload.name,
        namespace: workload.namespace,
        type: workload.type,
        sourceCluster,
        currentClusters: workload.targetClusters,
      },
    },
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 1000 : undefined,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'p-3 transition-colors cursor-grab active:cursor-grabbing',
        isDragging
          ? 'bg-blue-100 dark:bg-blue-900/40 shadow-lg rounded-lg opacity-90'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        isSelected && !isDragging && 'bg-blue-50 dark:bg-blue-900/20'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <GripVertical className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <TypeIcon type={workload.type} />
          <div className="min-w-0" onClick={onSelect}>
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                {workload.name}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[workload.status]}`}>
                {workload.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
              <span className="truncate">{workload.namespace}</span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>{workload.type}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          <StatusIcon status={workload.status} />
          <span className="text-gray-600 dark:text-gray-400">
            {workload.readyReplicas}/{workload.replicas}
          </span>
        </div>
      </div>

      {/* Image */}
      <div className="mt-1.5 ml-10 text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
        {workload.image}
      </div>

      {/* Cluster deployments */}
      <div className="mt-2 ml-10 flex flex-wrap gap-1">
        {workload.deployments.map((d) => (
          <div
            key={d.cluster}
            className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded"
          >
            <StatusIcon status={d.status} />
            <ClusterBadge cluster={d.cluster} size="sm" />
            <span className="text-gray-500 dark:text-gray-400">
              {d.readyReplicas}/{d.replicas}
            </span>
          </div>
        ))}
      </div>

      {/* Expanded details */}
      {isSelected && !isDragging && (
        <div className="mt-3 pt-3 ml-10 border-t border-gray-200 dark:border-gray-600 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Target Clusters</span>
            <div className="flex gap-1">
              {workload.targetClusters.map((c) => (
                <ClusterBadge key={c} cluster={c} size="sm" />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Labels</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {Object.entries(workload.labels).map(([k, v]) => (
                <span
                  key={k}
                  className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono"
                >
                  {k}={v}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
              <ArrowUpRight className="h-3 w-3" />
              Scale
            </button>
            <button className="flex items-center gap-1 text-xs px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded transition-colors">
              <Plus className="h-3 w-3" />
              Deploy to Cluster
            </button>
          </div>
          <p className="text-xs text-gray-400 italic">
            Tip: Drag workload to deploy to additional clusters
          </p>
        </div>
      )}
    </div>
  )
}

type SortByOption = 'name' | 'status' | 'type'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'status' as const, label: 'Status' },
  { value: 'type' as const, label: 'Type' },
]

const workloadStatusOrder: Record<string, number> = { Failed: 0, Degraded: 1, Pending: 2, Running: 3, Unknown: 4 }

const worseStatus = (a: WorkloadStatus, b: WorkloadStatus): WorkloadStatus =>
  (workloadStatusOrder[a] ?? 4) < (workloadStatusOrder[b] ?? 4) ? a : b

const CLUSTER_FILTER_KEY = 'kubestellar-card-filter:workload-deployment-clusters'

interface WorkloadDeploymentProps {
  config?: Record<string, unknown>
}

export function WorkloadDeployment(_props: WorkloadDeploymentProps) {
  const [typeFilter, setTypeFilter] = useState<WorkloadType | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<WorkloadStatus | 'All'>('All')
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null)

  // Manual cluster filter -- Workload has targetClusters[] not a single cluster field,
  // so we can't use useCardData's built-in clusterField filtering.
  const { deduplicatedClusters } = useClusters()
  const [localClusterFilter, setLocalClusterFilterState] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(CLUSTER_FILTER_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  const persistClusterFilter = useCallback((clusters: string[]) => {
    setLocalClusterFilterState(clusters)
    if (clusters.length === 0) {
      localStorage.removeItem(CLUSTER_FILTER_KEY)
    } else {
      localStorage.setItem(CLUSTER_FILTER_KEY, JSON.stringify(clusters))
    }
  }, [])

  const toggleClusterFilter = useCallback((name: string) => {
    persistClusterFilter(
      localClusterFilter.includes(name)
        ? localClusterFilter.filter(c => c !== name)
        : [...localClusterFilter, name],
    )
  }, [localClusterFilter, persistClusterFilter])

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

  // Fetch real workloads from API
  const { data: realWorkloads } = useWorkloads()

  // Use real data if available, otherwise demo data
  const isDemo = !realWorkloads || realWorkloads.length === 0
  const workloads: Workload[] = useMemo(() => {
    if (isDemo) return DEMO_WORKLOADS
    // Transform API workloads to card format
    const mapped = realWorkloads.map((w: ApiWorkload) => {
      const clusters = w.targetClusters || (w.cluster ? [w.cluster] : [])
      const deployments: ClusterDeployment[] = w.deployments
        ? w.deployments.map(d => ({
            cluster: d.cluster,
            status: d.status as WorkloadStatus,
            replicas: d.replicas,
            readyReplicas: d.readyReplicas,
            lastUpdated: d.lastUpdated,
          }))
        : clusters.map(c => ({
            cluster: c,
            status: w.status as WorkloadStatus,
            replicas: w.replicas,
            readyReplicas: w.readyReplicas,
            lastUpdated: w.createdAt,
          }))
      return {
        name: w.name,
        namespace: w.namespace,
        type: w.type as WorkloadType,
        status: w.status as WorkloadStatus,
        replicas: w.replicas || 0,
        readyReplicas: w.readyReplicas || 0,
        image: w.image,
        labels: w.labels || {},
        targetClusters: clusters,
        deployments,
        createdAt: w.createdAt,
      }
    })

    // Deduplicate: group by namespace/name, merge clusters
    const grouped = new Map<string, Workload>()
    for (const w of mapped) {
      const key = `${w.namespace}/${w.name}`
      const existing = grouped.get(key)
      if (existing) {
        existing.targetClusters = [...new Set([...existing.targetClusters, ...w.targetClusters])]
        existing.deployments = [...existing.deployments, ...w.deployments]
        existing.replicas += w.replicas || 0
        existing.readyReplicas += w.readyReplicas || 0
        existing.status = worseStatus(existing.status, w.status)
      } else {
        grouped.set(key, { ...w })
      }
    }
    return Array.from(grouped.values())
  }, [realWorkloads, isDemo])

  // Calculate stats from actual workloads
  const stats = useMemo(() => {
    if (isDemo) return DEMO_STATS
    return {
      totalWorkloads: realWorkloads?.length ?? workloads.length,
      uniqueWorkloads: workloads.length,
      runningCount: workloads.filter(w => w.status === 'Running').length,
      degradedCount: workloads.filter(w => w.status === 'Degraded').length,
      pendingCount: workloads.filter(w => w.status === 'Pending').length,
      failedCount: workloads.filter(w => w.status === 'Failed').length,
      totalClusters: new Set(workloads.flatMap(w => w.targetClusters)).size,
    }
  }, [workloads, realWorkloads, isDemo])

  // Pre-filter by type, status, and cluster before passing to useCardData
  const preFiltered = useMemo(() => {
    let result = workloads
    if (typeFilter !== 'All') {
      result = result.filter(w => w.type === typeFilter)
    }
    if (statusFilter !== 'All') {
      result = result.filter(w => w.status === statusFilter)
    }
    if (localClusterFilter.length > 0) {
      result = result.filter(w =>
        w.targetClusters.some(c => localClusterFilter.includes(c)),
      )
    }
    return result
  }, [workloads, typeFilter, statusFilter, localClusterFilter])

  // useCardData handles search, sort, and pagination
  const {
    items: filteredWorkloads,
    totalItems: _totalFiltered,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
    },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection,
    },
  } = useCardData<Workload, SortByOption>(preFiltered, {
    filter: {
      searchFields: ['name', 'namespace', 'image'] as (keyof Workload)[],
      customPredicate: (w, query) =>
        w.targetClusters.some(c => c.toLowerCase().includes(query)),
      storageKey: 'workload-deployment',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: commonComparators.statusOrder<Workload>('status', workloadStatusOrder),
        name: commonComparators.string<Workload>('name'),
        type: commonComparators.string<Workload>('type'),
      },
    },
    defaultLimit: 5,
  })

  const workloadTypes: (WorkloadType | 'All')[] = ['All', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']
  const workloadStatuses: (WorkloadStatus | 'All')[] = ['All', 'Running', 'Degraded', 'Pending', 'Failed']

  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {stats.totalWorkloads} total &middot; {stats.uniqueWorkloads} unique
          </span>
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: localClusterFilter.length,
            totalCount: availableClusters.length,
          }}
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
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
        />
      </div>

      {/* Search */}
      <div className="px-3 mb-2">
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search workloads..."
        />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.totalWorkloads}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-purple-500">{stats.uniqueWorkloads}</div>
          <div className="text-xs text-gray-500">Unique</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-green-600">{stats.runningCount}</div>
          <div className="text-xs text-gray-500">Running</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-yellow-600">{stats.degradedCount}</div>
          <div className="text-xs text-gray-500">Degraded</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-blue-600">{stats.pendingCount}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-red-600">{stats.failedCount}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
      </div>

      {/* Type/Status Filters */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as WorkloadType | 'All')}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {workloadTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'All' ? 'All Types' : t}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as WorkloadStatus | 'All')}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            {workloadStatuses.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All Statuses' : s}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[10px] text-muted-foreground italic">
            Drag onto Cluster Groups to deploy
          </span>
        </div>
      </div>

      {/* Workload list */}
      <div className="flex-1 overflow-auto">
        {filteredWorkloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 p-4">
            <Box className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No workloads found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredWorkloads.map((workload) => (
              <DraggableWorkloadItem
                key={`${workload.namespace}/${workload.name}`}
                workload={workload}
                isSelected={selectedWorkload?.name === workload.name}
                onSelect={() =>
                  setSelectedWorkload(selectedWorkload?.name === workload.name ? null : workload)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={preFiltered.length}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : preFiltered.length}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
}

// Export types for use in other components
export type { WorkloadType, WorkloadStatus, ClusterDeployment }
