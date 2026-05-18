import { memo, useState } from 'react'
import { Trash2, Copy, Check } from 'lucide-react'
import { Tooltip } from '../../ui/Tooltip'
import { copyToClipboard } from '../../../lib/clipboard'
import { useTranslation } from 'react-i18next'
import { useLocalClusterTools } from '../../../hooks/useLocalClusterTools'
import { Play, Square, RotateCcw } from 'lucide-react'
import { providerToTool, DISABLED_CLUSTER_ACTION_CLASS } from './clusterCardUtils'
import type { ReactNode } from 'react'

// Inline copy button — shows a checkmark briefly after copying
const COPY_FEEDBACK_MS = 1500

export function CopyCmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy command to clipboard"
      aria-label="Copy command to clipboard"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Copy className="w-2.5 h-2.5" />}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied!' : ''}
      </span>
    </button>
  )
}

/**
 * Inline "Remove cluster" button shown only on offline/unreachable cluster cards (#5901).
 * Delegates confirmation + API call to the parent via `onRemoveCluster`.
 */
export const RemoveClusterButton = memo(function RemoveClusterButton({
  onRemove,
  size = 'sm',
}: {
  onRemove: () => void
  size?: 'sm' | 'xs'
}) {
  const { t } = useTranslation()
  const iconClass = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const btnClass = size === 'xs' ? 'p-1' : 'p-1.5'
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onRemove() }}
      className={`${btnClass} rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/20 transition-colors`}
      title={t('cluster.removeCluster')}
      aria-label={t('cluster.removeCluster')}
      data-testid="remove-cluster-button"
    >
      <Trash2 className={iconClass} aria-hidden="true" />
    </button>
  )
})

export function ActionTooltipWrapper({
  tooltip,
  children,
}: {
  tooltip: string
  children: ReactNode
}) {
  return (
    <span
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Tooltip content={tooltip}>
        {children}
      </Tooltip>
    </span>
  )
}

// Inline play/stop/restart controls for local clusters
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

  // Try to find the cluster in local clusters list for accurate tool/name mapping
  const localCluster = (clusters || []).find(c =>
    clusterName.includes(c.name) || c.name.includes(clusterName.replace(/^kind-/, ''))
  )
  const effectiveTool = localCluster?.tool || tool
  const effectiveName = localCluster?.name || clusterName.replace(/^kind-/, '')

  // Enable controls for detected local clusters even if unreachable (they can be started)
  // Only disable for cloud clusters or if we have no info about the cluster
  const isDetectedLocalCluster = !!localCluster
  const controlsDisabled = unreachable && !isDetectedLocalCluster
  const disabledTooltip = t('cluster.controlsDisabledOffline')

  const isStopped = localCluster?.status === 'stopped' || unreachable

  const handleAction = async (action: 'start' | 'stop' | 'restart', e: React.MouseEvent) => {
    e.stopPropagation()
    setActionInProgress(action)
    await clusterLifecycle(effectiveTool, effectiveName, action)
    setActionInProgress(null)
  }

  return (
    <div className="flex items-center gap-0.5" role="presentation">
      {isStopped ? (
        <ActionTooltipWrapper tooltip={controlsDisabled ? disabledTooltip : t('cluster.startCluster')}>
          <button
            onClick={(e) => handleAction('start', e)}
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
            onClick={(e) => handleAction('stop', e)}
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
          onClick={(e) => handleAction('restart', e)}
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
