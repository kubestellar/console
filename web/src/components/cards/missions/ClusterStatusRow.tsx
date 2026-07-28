import { cn } from '../../../lib/cn'
import { ClusterBadge } from '../../ui/ClusterBadge'
import type { DeployClusterStatus } from '../../../hooks/useDeployMissions'

interface ClusterStatusRowProps {
  status: DeployClusterStatus
  clusterStatusConfig: Record<DeployClusterStatus['status'], {
    color: string
    barColor: string
    label: string
  }>
}

export function ClusterStatusRow({ status, clusterStatusConfig }: ClusterStatusRowProps) {
  const config = clusterStatusConfig[status.status]
  const replicaProgress = status.replicas > 0
    ? (status.readyReplicas / status.replicas) * 100
    : 0

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 shrink-0 truncate">
        <ClusterBadge cluster={status.cluster} size="sm" />
      </div>

      {/* Replica progress bar */}
        <div className="flex-1 h-0.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', config.barColor)}
          style={{ width: `${status.status === 'pending' ? 0 : Math.max(replicaProgress, 10)}%` }}
        />
      </div>

      {/* Replica count */}
      <span className={cn('text-2xs font-mono tabular-nums shrink-0', config.color)}>
        {status.readyReplicas}/{status.replicas}
      </span>

      {/* Status label */}
      <span className={cn('text-2xs shrink-0', config.color)}>
        {config.label}
      </span>
    </div>
  )
}
