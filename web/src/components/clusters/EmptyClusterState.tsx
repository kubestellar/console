import { Server, Plus, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface EmptyClusterStateProps {
  onAddCluster: () => void
  agentConnected?: boolean
  agentDegraded?: boolean
  inClusterMode?: boolean
}

export function EmptyClusterState({ onAddCluster, agentConnected, agentDegraded, inClusterMode }: EmptyClusterStateProps) {
  const { t } = useTranslation()

  // Agent connected (or degraded) but no cluster data — show degraded state
  if ((agentConnected || agentDegraded) && !inClusterMode) {
    return (
      <div className="mx-auto w-full max-w-3xl py-4" data-testid="cluster-degraded-state">
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-500 mt-0.5" />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground leading-5">
              {t('cluster.agentConnectedNoDataTitle')}
            </h3>
            <p className="text-xs text-muted-foreground leading-5">
              {t('cluster.agentConnectedNoDataDesc')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // In-cluster mode with no data — limited service account scope
  if (inClusterMode) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="cluster-mode-empty-state">
        <AlertTriangle className="w-12 h-12 text-yellow-400 mb-4 opacity-75" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {t('cluster.clusterModeNoDataTitle')}
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          {t('cluster.clusterModeNoDataDesc')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Server className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {t('cluster.noClusterTitle')}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {t('cluster.noClusterDesc')}
      </p>
      <button
        onClick={onAddCluster}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('cluster.addCluster')}
      </button>
    </div>
  )
}
