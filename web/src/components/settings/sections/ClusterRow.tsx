import { Loader2, Trash2 } from 'lucide-react'
import type { TFunction } from 'i18next'

interface ClusterRowProps {
  cluster: { tool: string; name: string; status: string }
  isDeleting: string | null
  getToolIcon: (tool: string) => string
  onDeleteRequest: (cluster: { tool: string; name: string }) => void
  t: TFunction
}

export function ClusterRow({ cluster, isDeleting, getToolIcon, onDeleteRequest, t }: ClusterRowProps) {
  const isRunning = cluster.status === 'running'
  const isStopped = cluster.status === 'stopped'

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
      <div className="flex items-center gap-3">
        <span className="text-lg">{getToolIcon(cluster.tool)}</span>
        <div>
          <p className="font-medium text-foreground">{cluster.name}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{cluster.tool}</span>
            <span className="text-muted-foreground">•</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isRunning ? 'bg-green-500' :
                isStopped ? 'bg-muted-foreground' :
                'bg-orange-500'
              }`} />
              <span className={
                isRunning ? 'text-green-400' :
                isStopped ? 'text-muted-foreground' :
                'text-orange-400'
              }>
                {cluster.status}
              </span>
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={() => onDeleteRequest({ tool: cluster.tool, name: cluster.name })}
        disabled={isDeleting === cluster.name}
        aria-label={t('settings.localClusters.deleteCluster', { name: cluster.name, defaultValue: `Delete cluster ${cluster.name}` })}
        className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        title="Delete cluster"
      >
        {isDeleting === cluster.name ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}
