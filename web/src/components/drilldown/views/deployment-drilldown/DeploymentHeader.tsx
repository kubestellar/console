import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronLeft, Layers, RefreshCw, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'
import { ClusterBadge } from '../../../ui/ClusterBadge'

export interface DeploymentHeaderProps {
  cluster: string
  namespace: string
  stackDepth: number
  agentConnected: boolean
  isRefreshing: boolean
  onBack: () => void
  onDrillToNamespace: () => void
  onDrillToCluster: () => void
  onRefreshAll: () => void
  onButtonLikeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
    action: () => void,
    disabled?: boolean,
  ) => void
}

export function DeploymentHeader({
  cluster,
  namespace,
  stackDepth,
  agentConnected,
  isRefreshing,
  onBack,
  onDrillToNamespace,
  onDrillToCluster,
  onRefreshAll,
  onButtonLikeKeyDown,
}: DeploymentHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="px-6 pt-6 pb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-6 text-sm">
        {stackDepth > 1 && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 hover:bg-secondary/50 border border-transparent hover:border-border px-3 py-1.5 rounded-lg transition-all text-muted-foreground hover:text-foreground"
            aria-label={t('drilldown.goBack')}
            title={t('drilldown.goBack')}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{t('common.back')}</span>
          </button>
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label={`${t('drilldown.fields.namespace')}: ${namespace}`}
          onClick={onDrillToNamespace}
          onKeyDown={(event) => onButtonLikeKeyDown(event, onDrillToNamespace)}
          className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Layers className="w-4 h-4 text-purple-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
          <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
          <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label={`${t('drilldown.fields.cluster')}: ${cluster}`}
          onClick={onDrillToCluster}
          onKeyDown={(event) => onButtonLikeKeyDown(event, onDrillToCluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
          <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
      <div
        role="button"
        tabIndex={!agentConnected || isRefreshing ? -1 : 0}
        aria-disabled={!agentConnected || isRefreshing}
        aria-label={t('drilldown.deployment.refreshAll')}
        onClick={() => {
          if (agentConnected && !isRefreshing) {
            onRefreshAll()
          }
        }}
        onKeyDown={(event) => onButtonLikeKeyDown(event, onRefreshAll, !agentConnected || isRefreshing)}
        title={t('drilldown.deployment.refreshAll')}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card',
          !agentConnected || isRefreshing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
        <span>{t('drilldown.deployment.refresh')}</span>
      </div>
    </div>
  )
}
