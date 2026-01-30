import { CheckCircle, XCircle, AlertTriangle, HelpCircle, MinusCircle } from 'lucide-react'
import { getIconForKind } from '../../../lib/resourceCategories'
import type { MonitoredResource, ResourceHealthStatus } from '../../../types/workloadMonitor'

interface ListProps {
  resources: MonitoredResource[]
  onResourceClick?: (resource: MonitoredResource) => void
}

const STATUS_ICON: Record<ResourceHealthStatus, JSX.Element> = {
  healthy: <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
  degraded: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />,
  unhealthy: <XCircle className="w-3.5 h-3.5 text-red-400" />,
  unknown: <HelpCircle className="w-3.5 h-3.5 text-gray-400" />,
  missing: <MinusCircle className="w-3.5 h-3.5 text-red-400" />,
}

const STATUS_BADGE: Record<ResourceHealthStatus, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
  missing: 'bg-red-500/20 text-red-400',
}

const CATEGORY_BADGE: Record<string, string> = {
  rbac: 'bg-blue-500/20 text-blue-400',
  config: 'bg-cyan-500/20 text-cyan-400',
  networking: 'bg-indigo-500/20 text-indigo-400',
  scaling: 'bg-orange-500/20 text-orange-400',
  storage: 'bg-amber-500/20 text-amber-400',
  crd: 'bg-violet-500/20 text-violet-400',
  admission: 'bg-rose-500/20 text-rose-400',
  workload: 'bg-purple-500/20 text-purple-400',
  other: 'bg-gray-500/20 text-gray-400',
}

export function WorkloadMonitorList({ resources, onResourceClick }: ListProps) {
  if (resources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No resources found.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {resources.map(resource => {
        const ResourceIcon = getIconForKind(resource.kind)
        return (
          <div
            key={resource.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-card/50 cursor-pointer transition-colors border border-transparent hover:border-border/50"
            onClick={() => onResourceClick?.(resource)}
          >
            {STATUS_ICON[resource.status]}
            <ResourceIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-foreground truncate min-w-0 flex-1">
              {resource.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${CATEGORY_BADGE[resource.category] || CATEGORY_BADGE.other}`}>
              {resource.kind}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[resource.status]}`}>
              {resource.status}
            </span>
            {resource.message && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px] shrink-0">
                {resource.message}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
