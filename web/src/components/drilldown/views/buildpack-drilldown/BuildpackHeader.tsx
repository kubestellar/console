import { Layers, Server } from 'lucide-react'
import { ClusterBadge } from '../../../ui/ClusterBadge'
import { cn } from '../../../../lib/cn'
import type { StatusStyle } from './types'

interface BuildpackHeaderProps {
  cluster: string
  namespace: string
  status: string
  statusStyle: StatusStyle
  onDrillNamespace: () => void
  onDrillCluster: () => void
}

export function BuildpackHeader({
  cluster,
  namespace,
  status,
  statusStyle,
  onDrillNamespace,
  onDrillCluster,
}: BuildpackHeaderProps) {
  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <button
            onClick={onDrillNamespace}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">Namespace:</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
          </button>

          <button
            onClick={onDrillCluster}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">Cluster:</span>
            <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
          </button>
        </div>

        <span
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-medium border',
            statusStyle.bg,
            statusStyle.text,
            statusStyle.border,
          )}
        >
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
