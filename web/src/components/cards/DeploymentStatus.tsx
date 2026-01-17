import { useState, useMemo } from 'react'
import { CheckCircle, Clock, XCircle, ArrowRight, ChevronRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { CardControls, SortDirection } from '../ui/CardControls'

type SortByOption = 'status' | 'name' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'cluster' as const, label: 'Cluster' },
]

// Demo deployment data
const allDeployments = [
  {
    name: 'api-gateway',
    cluster: 'prod-east',
    status: 'running',
    progress: 100,
    replicas: { ready: 3, desired: 3 },
    version: 'v2.4.1',
  },
  {
    name: 'worker-service',
    cluster: 'vllm-d',
    status: 'deploying',
    progress: 67,
    replicas: { ready: 2, desired: 3 },
    version: 'v1.8.0',
    previousVersion: 'v1.7.2',
  },
  {
    name: 'frontend',
    cluster: 'prod-west',
    status: 'failed',
    progress: 33,
    replicas: { ready: 1, desired: 3 },
    version: 'v3.0.0',
    error: 'ImagePullBackOff',
  },
  {
    name: 'cache-redis',
    cluster: 'staging',
    status: 'running',
    progress: 100,
    replicas: { ready: 1, desired: 1 },
    version: 'v7.2.0',
  },
]

const statusConfig = {
  running: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    barColor: 'bg-green-500',
  },
  deploying: {
    icon: Clock,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    barColor: 'bg-yellow-500',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    barColor: 'bg-red-500',
  },
}

export function DeploymentStatus() {
  const { drillToDeployment } = useDrillDownActions()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const statusOrder: Record<string, number> = { failed: 0, deploying: 1, running: 2 }

  // Filter by global cluster selection
  const rawDeployments = useMemo(() => {
    if (isAllClustersSelected) return allDeployments
    return allDeployments.filter(d => selectedClusters.includes(d.cluster))
  }, [selectedClusters, isAllClustersSelected])

  const deployments = useMemo(() => {
    const sorted = [...rawDeployments].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') result = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3)
      else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'cluster') result = a.cluster.localeCompare(b.cluster)
      return sortDirection === 'asc' ? result : -result
    })
    if (limit === 'unlimited') return sorted
    return sorted.slice(0, limit)
  }, [rawDeployments, sortBy, sortDirection, limit])

  const activeDeployments = rawDeployments.filter((d) => d.status === 'deploying').length
  const failedDeployments = rawDeployments.filter((d) => d.status === 'failed').length

  const handleDeploymentClick = (deployment: typeof allDeployments[0]) => {
    drillToDeployment(deployment.cluster, 'default', deployment.name, {
      status: deployment.status,
      version: deployment.version,
      previousVersion: deployment.previousVersion,
      replicas: deployment.replicas,
      progress: deployment.progress,
      error: deployment.error,
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Deployment Status
          </span>
          {activeDeployments > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
              {activeDeployments} deploying
            </span>
          )}
          {failedDeployments > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
              {failedDeployments} failed
            </span>
          )}
        </div>
        <CardControls
          limit={limit}
          onLimitChange={setLimit}
          sortBy={sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
        />
      </div>

      {/* Deployments list */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {deployments.map((deployment) => {
          const config = statusConfig[deployment.status as keyof typeof statusConfig]
          const StatusIcon = config.icon

          return (
            <div
              key={deployment.name}
              onClick={() => handleDeploymentClick(deployment)}
              className="p-3 rounded-lg bg-secondary/30 border border-border/50 cursor-pointer hover:bg-secondary/50 hover:border-border transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={deployment.cluster} />
                    <StatusIcon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <span className="text-sm font-medium text-white">
                    {deployment.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs">
                      {deployment.previousVersion && (
                        <>
                          <span className="text-muted-foreground">
                            {deployment.previousVersion}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        </>
                      )}
                      <span className="text-white">{deployment.version}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {deployment.replicas.ready}/{deployment.replicas.desired} ready
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.barColor} transition-all duration-500`}
                  style={{ width: `${deployment.progress}%` }}
                />
              </div>

              {deployment.error && (
                <p className="text-xs text-red-400 mt-2">{deployment.error}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
