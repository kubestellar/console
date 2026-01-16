import { Box, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'

interface AppStatusProps {
  config?: any
}

// Demo data
const apps = [
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
  return (
    <div className="space-y-3">
      {apps.map((app) => {
        const total = app.status.healthy + app.status.warning + app.status.pending

        return (
          <div
            key={app.name}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">{app.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {total} cluster{total !== 1 ? 's' : ''}
              </span>
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
  )
}
