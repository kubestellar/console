import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type ClusterHealth, type NamespaceStats, type Deployment, type GPUNode } from '../../hooks/useMCP'

// ─── ClusterStatsCards ────────────────────────────────────────────────────────

interface ClusterStatsCardsProps {
  isUnreachable: boolean
  isLoading: boolean
  health: ClusterHealth | null | undefined
  namespaceStats: NamespaceStats[]
  clusterDeployments: Deployment[]
  stableClusterGPUs: GPUNode[]
  showNodeDetails: boolean
  setShowNodeDetails: (v: boolean) => void
  showPodsByNamespace: boolean
  setShowPodsByNamespace: (v: boolean) => void
  setShowGPUDetail: (v: boolean) => void
}

export function ClusterStatsCards({
  isUnreachable,
  isLoading,
  health,
  namespaceStats,
  clusterDeployments,
  stableClusterGPUs,
  showNodeDetails,
  setShowNodeDetails,
  showPodsByNamespace,
  setShowPodsByNamespace,
  setShowGPUDetail,
}: ClusterStatsCardsProps) {
  const { t } = useTranslation()
  const canInteract = !isUnreachable && !isLoading

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {/* Nodes */}
      <button
        onClick={() => canInteract && setShowNodeDetails(!showNodeDetails)}
        disabled={!canInteract}
        className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
          canInteract
            ? 'border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer'
            : 'border-border cursor-default'
        } ${showNodeDetails ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10' : ''}`}
        title={canInteract ? t('clusterDetail.clickToViewNode') : undefined}
      >
        {isLoading ? (
          <>
            <div className="h-8 w-12 bg-muted/30 rounded animate-pulse mb-1" />
            <div className="text-sm text-muted-foreground">{t('common.nodes')}</div>
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse mt-1" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.nodeCount || 0) : '-'}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              {t('clusterDetail.nodes')}
              {!isUnreachable && (
                <ChevronDown className={`w-4 h-4 transition-transform text-cyan-400 ${showNodeDetails ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />
              )}
            </div>
            <div className="text-xs text-green-400">
              {!isUnreachable ? `${health?.readyNodes || 0} ${t('clusterDetail.ready')}` : t('clusterDetail.offline')}
            </div>
            {!isUnreachable && !showNodeDetails && (
              <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-cyan-400/70 transition-colors">
                {t('clusterDetail.clickToExpand')}
              </div>
            )}
          </>
        )}
      </button>

      {/* Workloads */}
      <button
        onClick={() => canInteract && setShowPodsByNamespace(!showPodsByNamespace)}
        disabled={!canInteract}
        className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
          canInteract
            ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer'
            : 'border-border cursor-default'
        } ${showPodsByNamespace ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10' : ''}`}
        title={canInteract ? t('clusterDetail.clickToViewWorkloads') : undefined}
      >
        <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
          {t('clusterDetail.workloads')}
          {canInteract && (
            <ChevronDown className={`w-4 h-4 transition-transform text-blue-400 ${showPodsByNamespace ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />
          )}
        </div>
        {isLoading ? (
          <div className="space-y-1.5">
            <div className="h-4 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 bg-muted/30 rounded animate-pulse" />
          </div>
        ) : (
          <>
            <div className="space-y-0.5 text-xs">
              {!isUnreachable ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('clusterDetail.namespaces')}</span>
                    <span className="text-foreground font-medium">{namespaceStats.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.deployments')}</span>
                    <span className="text-foreground font-medium">{clusterDeployments.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.pods')}</span>
                    <span className="text-foreground font-medium">{health?.podCount || 0}</span>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
            {canInteract && !showPodsByNamespace && (
              <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">
                {t('clusterDetail.clickToExpand')}
              </div>
            )}
          </>
        )}
      </button>

      {/* GPUs */}
      <button
        onClick={() => canInteract && stableClusterGPUs.length > 0 && setShowGPUDetail(true)}
        disabled={!canInteract || stableClusterGPUs.length === 0}
        className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
          canInteract && stableClusterGPUs.length > 0
            ? 'border-border hover:border-yellow-500/50 hover:bg-yellow-500/5 hover:shadow-lg hover:shadow-yellow-500/10 cursor-pointer'
            : 'border-border cursor-default'
        }`}
        title={canInteract && stableClusterGPUs.length > 0 ? t('clusterDetail.clickToViewGPU') : undefined}
      >
        {isLoading ? (
          <>
            <div className="h-8 w-12 bg-muted/30 rounded animate-pulse mb-1" />
            <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
            <div className="h-4 w-20 bg-muted/30 rounded animate-pulse mt-1" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-foreground">
              {!isUnreachable ? stableClusterGPUs.reduce((sum, n) => sum + n.gpuCount, 0) : '-'}
            </div>
            <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
            <div className="text-xs text-yellow-400">
              {!isUnreachable
                ? `${stableClusterGPUs.reduce((sum, n) => sum + n.gpuAllocated, 0)} ${t('clusterDetail.allocated')}`
                : ''}
            </div>
            {!isUnreachable && stableClusterGPUs.length > 0 && (
              <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-yellow-400/70 transition-colors">
                {t('clusterDetail.clickForDetails')}
              </div>
            )}
          </>
        )}
      </button>
    </div>
  )
}
