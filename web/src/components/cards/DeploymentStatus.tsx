import { CheckCircle, Clock, XCircle, ArrowRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'

// Demo deployment data
const deployments = [
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
  const activeDeployments = deployments.filter((d) => d.status === 'deploying').length
  const failedDeployments = deployments.filter((d) => d.status === 'failed').length

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">
          Deployment Status
        </span>
        <div className="flex gap-2">
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
      </div>

      {/* Deployments list */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        {deployments.map((deployment) => {
          const config = statusConfig[deployment.status as keyof typeof statusConfig]
          const StatusIcon = config.icon

          return (
            <div
              key={deployment.name}
              className="p-3 rounded-lg bg-secondary/30 border border-border/50"
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
