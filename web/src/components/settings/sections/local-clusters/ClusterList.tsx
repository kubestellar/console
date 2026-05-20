import { useTranslation } from 'react-i18next'
import { Trash2, Loader2 } from 'lucide-react'

interface ClusterInfo {
  tool: string
  name: string
  status: string
}

interface ClusterListProps {
  clusters: ClusterInfo[]
  isDeleting: string | null
  onDeleteCluster: (tool: string, name: string) => void
}

const getToolIcon = (tool: string) => {
  switch (tool) {
    case 'kind':
      return '🐳'
    case 'k3d':
      return '🚀'
    case 'minikube':
      return '📦'
    case 'vcluster':
      return '🔮'
    default:
      return '☸️'
  }
}

export function ClusterList({
  clusters,
  isDeleting,
  onDeleteCluster,
}: ClusterListProps) {
  const { t } = useTranslation()

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        {t('settings.localClusters.localClustersCount', { count: clusters.length })}
      </h3>
      {clusters.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4 bg-secondary/30 rounded-lg">
          {t('settings.localClusters.noClusters')}
        </p>
      ) : (
        <div className="space-y-2">
          {clusters.map((cluster) => {
            const isRunning = cluster.status === 'running'
            const isStopped = cluster.status === 'stopped'

            return (
              <div
                key={`${cluster.tool}-${cluster.name}`}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
              >
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
                          isStopped ? 'bg-gray-500 dark:bg-gray-400' :
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
                  onClick={() => onDeleteCluster(cluster.tool, cluster.name)}
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
          })}
        </div>
      )}
    </div>
  )
}
