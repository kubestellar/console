import { useState, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Box,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Search,
  Layers,
  Server,
  Database,
  Gauge,
  Plus,
  ArrowUpRight,
  GripVertical
} from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'
import { cn } from '../../lib/cn'
import { useWorkloads, Workload as ApiWorkload } from '../../hooks/useWorkloads'

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
    id: `workload-${workload.namespace}-${workload.name}`,
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
      className={cn(
        'p-3 transition-colors',
        isDragging
          ? 'bg-blue-100 dark:bg-blue-900/40 shadow-lg rounded-lg opacity-90'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        isSelected && !isDragging && 'bg-blue-50 dark:bg-blue-900/20'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
            title="Drag to deploy to cluster"
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
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

interface WorkloadDeploymentProps {
  config?: Record<string, unknown>
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function WorkloadDeployment({ onRefresh, isRefreshing = false }: WorkloadDeploymentProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<WorkloadType | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<WorkloadStatus | 'All'>('All')
  const [selectedWorkload, setSelectedWorkload] = useState<Workload | null>(null)

  // Fetch real workloads from API
  const { data: realWorkloads, isLoading, refetch } = useWorkloads()

  // Use real data if available, otherwise demo data
  const isDemo = !realWorkloads || realWorkloads.length === 0
  const workloads: Workload[] = useMemo(() => {
    if (isDemo) return DEMO_WORKLOADS
    // Transform API workloads to card format
    return realWorkloads.map((w: ApiWorkload) => ({
      name: w.name,
      namespace: w.namespace,
      type: w.type as WorkloadType,
      status: w.status as WorkloadStatus,
      replicas: w.replicas,
      readyReplicas: w.readyReplicas,
      image: w.image,
      labels: {},
      targetClusters: [w.cluster],
      deployments: [{
        cluster: w.cluster,
        status: w.status as WorkloadStatus,
        replicas: w.replicas,
        readyReplicas: w.readyReplicas,
        lastUpdated: w.createdAt,
      }],
      createdAt: w.createdAt,
    }))
  }, [realWorkloads, isDemo])

  // Calculate stats from actual workloads
  const stats = useMemo(() => {
    if (isDemo) return DEMO_STATS
    return {
      totalWorkloads: workloads.length,
      runningCount: workloads.filter(w => w.status === 'Running').length,
      degradedCount: workloads.filter(w => w.status === 'Degraded').length,
      pendingCount: workloads.filter(w => w.status === 'Pending').length,
      failedCount: workloads.filter(w => w.status === 'Failed').length,
      totalClusters: new Set(workloads.flatMap(w => w.targetClusters)).size,
    }
  }, [workloads, isDemo])

  // Handle refresh
  const handleRefresh = () => {
    refetch()
    onRefresh?.()
  }

  const filteredWorkloads = useMemo(() => {
    return workloads.filter((w) => {
      const matchesSearch =
        search === '' ||
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.namespace.toLowerCase().includes(search.toLowerCase()) ||
        w.image.toLowerCase().includes(search.toLowerCase())
      const matchesType = typeFilter === 'All' || w.type === typeFilter
      const matchesStatus = statusFilter === 'All' || w.status === statusFilter
      return matchesSearch && matchesType && matchesStatus
    })
  }, [workloads, search, typeFilter, statusFilter])

  const workloadTypes: (WorkloadType | 'All')[] = ['All', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob']
  const workloadStatuses: (WorkloadStatus | 'All')[] = ['All', 'Running', 'Degraded', 'Pending', 'Failed']

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-end p-3 border-b border-gray-200 dark:border-gray-700">
        <RefreshButton onRefresh={handleRefresh} isRefreshing={isRefreshing || isLoading} />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats.totalWorkloads}</div>
          <div className="text-xs text-gray-500">Total</div>
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

      {/* Filters */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search workloads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
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
          <button className="ml-auto flex items-center gap-1 text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
            <Plus className="h-3 w-3" />
            Deploy
          </button>
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
    </div>
  )
}

// Export types for use in other components
export type { WorkloadType, WorkloadStatus, ClusterDeployment }
