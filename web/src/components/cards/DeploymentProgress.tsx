import { CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react'
import { useDeployments } from '../../hooks/useMCP'
import { ClusterBadge } from '../ui/ClusterBadge'

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

interface DeploymentProgressProps {
  config?: {
    cluster?: string
    namespace?: string
  }
}

export function DeploymentProgress({ config }: DeploymentProgressProps) {
  const cluster = config?.cluster
  const namespace = config?.namespace
  const { deployments, isLoading, error } = useDeployments(cluster, namespace)

  const activeDeployments = deployments.filter((d) => d.status === 'deploying').length
  const failedDeployments = deployments.filter((d) => d.status === 'failed').length

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && deployments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    )
  }

  if (deployments.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No deployments found
      </div>
    )
  }

  // Extract version from image tag (e.g., "api-gateway:v2.4.1" -> "v2.4.1")
  const getVersion = (image?: string) => {
    if (!image) return ''
    const parts = image.split(':')
    return parts.length > 1 ? parts[parts.length - 1] : 'latest'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">
          Deployment Progress
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
          const config = statusConfig[deployment.status]
          const StatusIcon = config.icon
          const version = getVersion(deployment.image)

          return (
            <div
              key={`${deployment.cluster}-${deployment.namespace}-${deployment.name}`}
              className="p-3 rounded-lg bg-secondary/30 border border-border/50"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <ClusterBadge cluster={deployment.cluster || 'default'} />
                    <span className="text-xs text-muted-foreground">{deployment.namespace}</span>
                    <StatusIcon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <span className="text-sm font-medium text-white">
                    {deployment.name}
                  </span>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-white">{version}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {deployment.readyReplicas}/{deployment.replicas} ready
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

              {deployment.age && (
                <p className="text-xs text-muted-foreground mt-1">Age: {deployment.age}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
