import { useState, useMemo } from 'react'
import { Box, CheckCircle, AlertTriangle, Clock, ChevronRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { CardControls, SortDirection } from '../ui/CardControls'

type SortByOption = 'status' | 'name' | 'clusters'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'name' as const, label: 'Name' },
  { value: 'clusters' as const, label: 'Clusters' },
]

interface AppStatusProps {
  config?: any
}

// Demo data
const rawApps = [
  {
    name: 'api-gateway',
    clusters: ['vllm-d', 'prod-east', 'prod-west'],
    status: { healthy: 3, warning: 0, pending: 0 },
  },
  {
    name: 'frontend',
    clusters: ['vllm-d', 'prod-east'],
    status: { healthy: 1, warning: 1, pending: 0 },
  },
  {
    name: 'worker-service',
    clusters: ['prod-east', 'prod-west'],
    status: { healthy: 1, warning: 0, pending: 1 },
  },
]

export function AppStatus(_props: AppStatusProps) {
  const { drillToDeployment } = useDrillDownActions()
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)

  const apps = useMemo(() => {
    const sorted = [...rawApps].sort((a, b) => {
      let result = 0
      if (sortBy === 'status') {
        // Sort by warning count (most warnings first)
        const aScore = a.status.warning * 10 + a.status.pending
        const bScore = b.status.warning * 10 + b.status.pending
        result = bScore - aScore
      } else if (sortBy === 'name') result = a.name.localeCompare(b.name)
      else if (sortBy === 'clusters') result = b.clusters.length - a.clusters.length
      return sortDirection === 'asc' ? -result : result
    })
    if (limit === 'unlimited') return sorted
    return sorted.slice(0, limit)
  }, [sortBy, sortDirection, limit])

  const handleAppClick = (appName: string, cluster: string) => {
    // Drill down to the deployment in the first cluster
    drillToDeployment(cluster, 'default', appName)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">App Status</span>
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

      <div className="flex-1 space-y-3 overflow-y-auto">
      {apps.map((app) => {
        const total = app.status.healthy + app.status.warning + app.status.pending

        return (
          <div
            key={app.name}
            onClick={() => handleAppClick(app.name, app.clusters[0])}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">{app.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {total} cluster{total !== 1 ? 's' : ''}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-4">
              {app.status.healthy > 0 && (
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-green-400">{app.status.healthy}</span>
                </div>
              )}
              {app.status.warning > 0 && (
                <div className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs text-yellow-400">{app.status.warning}</span>
                </div>
              )}
              {app.status.pending > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-blue-400">{app.status.pending}</span>
                </div>
              )}
            </div>

            {/* Cluster badges */}
            <div className="flex flex-wrap gap-1 mt-2">
              {app.clusters.map((cluster) => (
                <ClusterBadge key={cluster} cluster={cluster} showIcon={false} />
              ))}
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
