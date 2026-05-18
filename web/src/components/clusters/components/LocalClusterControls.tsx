import { memo, useState } from 'react'
import type { MouseEvent } from 'react'
import { Play, RotateCcw, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import { ActionTooltipWrapper } from './ClusterGrid.common'
import { DISABLED_CLUSTER_ACTION_CLASS } from './ClusterGrid.constants'

function providerToTool(provider: string): string | null {
  switch (provider) {
    case 'kind':
      return 'kind'
    case 'minikube':
      return 'minikube'
    case 'k3s':
      return 'k3d'
    default:
      return null
  }
}

export const LocalClusterControls = memo(function LocalClusterControls({
  clusterName,
  provider,
  unreachable,
}: {
  clusterName: string
  provider: string
  unreachable: boolean
}) {
  const { t } = useTranslation()
  const { clusterLifecycle, clusters } = useLocalClusterTools()
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const tool = providerToTool(provider)

  if (!tool) return null

  const localCluster = (clusters || []).find((candidate) =>
    clusterName.includes(candidate.name) || candidate.name.includes(clusterName.replace(/^kind-/, '')),
  )
  const effectiveTool = localCluster?.tool || tool
  const effectiveName = localCluster?.name || clusterName.replace(/^kind-/, '')
  const isDetectedLocalCluster = !!localCluster
  const controlsDisabled = unreachable && !isDetectedLocalCluster
  const disabledTooltip = t('cluster.controlsDisabledOffline')
  const isStopped = localCluster?.status === 'stopped' || unreachable

  const handleAction = async (action: 'start' | 'stop' | 'restart', event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setActionInProgress(action)
    await clusterLifecycle(effectiveTool, effectiveName, action)
    setActionInProgress(null)
  }

  return (
    <div className="flex items-center gap-0.5" role="presentation">
      {isStopped ? (
        <ActionTooltipWrapper tooltip={controlsDisabled ? disabledTooltip : t('cluster.startCluster')}>
          <button
            onClick={(event) => handleAction('start', event)}
            disabled={controlsDisabled || !!actionInProgress}
            className={`p-2 min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${
              controlsDisabled
                ? DISABLED_CLUSTER_ACTION_CLASS
                : actionInProgress === 'start'
                  ? 'text-green-400 bg-green-500/20'
                  : 'text-muted-foreground hover:text-green-400 hover:bg-green-500/20'
            }`}
            aria-label={controlsDisabled ? disabledTooltip : t('cluster.startCluster')}
          >
            <Play className={`w-3.5 h-3.5 ${actionInProgress === 'start' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          </button>
        </ActionTooltipWrapper>
      ) : (
        <ActionTooltipWrapper tooltip={controlsDisabled ? disabledTooltip : t('cluster.stopCluster')}>
          <button
            onClick={(event) => handleAction('stop', event)}
            disabled={controlsDisabled || !!actionInProgress}
            className={`p-2 min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${
              controlsDisabled
                ? DISABLED_CLUSTER_ACTION_CLASS
                : actionInProgress === 'stop'
                  ? 'text-red-400 bg-red-500/20'
                  : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/20'
            }`}
            aria-label={controlsDisabled ? disabledTooltip : t('cluster.stopCluster')}
          >
            <Square className={`w-3 h-3 ${actionInProgress === 'stop' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          </button>
        </ActionTooltipWrapper>
      )}
      <ActionTooltipWrapper tooltip={controlsDisabled ? disabledTooltip : t('cluster.restartCluster')}>
        <button
          onClick={(event) => handleAction('restart', event)}
          disabled={controlsDisabled || !!actionInProgress}
          className={`p-2 min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${
            controlsDisabled
              ? DISABLED_CLUSTER_ACTION_CLASS
              : actionInProgress === 'restart'
                ? 'text-blue-400 bg-blue-500/20'
                : 'text-muted-foreground hover:text-blue-400 hover:bg-blue-500/20'
          }`}
          aria-label={controlsDisabled ? disabledTooltip : t('cluster.restartCluster')}
        >
          <RotateCcw className={`w-3.5 h-3.5 ${actionInProgress === 'restart' ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </ActionTooltipWrapper>
    </div>
  )
})
