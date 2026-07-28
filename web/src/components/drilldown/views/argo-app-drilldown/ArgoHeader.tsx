import { Layers, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../../../ui/ClusterBadge'
import { cn } from '../../../../lib/cn'
import type { ArgoHeaderProps } from './types'

export function ArgoHeader({
  cluster,
  namespace,
  syncStatus,
  healthStatus,
  syncStyle,
  healthStyle,
  drillToNamespace,
  drillToCluster,
}: ArgoHeaderProps) {
  const { t } = useTranslation()
  const SyncIcon = syncStyle.icon

  return (
    <div className="px-6 pt-6 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <button
            onClick={() => drillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
            <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => drillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
            <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', syncStyle.bg, syncStyle.text, 'border', syncStyle.border)}>
            <SyncIcon className="w-3 h-3" />
            {syncStatus}
          </span>
          <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', healthStyle.bg, healthStyle.text, 'border', healthStyle.border)}>
            {healthStatus}
          </span>
        </div>
      </div>
    </div>
  )
}
