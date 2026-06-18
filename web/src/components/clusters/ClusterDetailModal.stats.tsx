import { ChevronDown } from 'lucide-react'
import { Cpu, MemoryStick, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type ClusterHealth, type GPUNode, type NamespaceStats, type Deployment } from '../../hooks/useMCP'

interface ClusterDetailStatsProps {
  isUnreachable: boolean
  effectiveLoading: boolean
  health: ClusterHealth | undefined
  showNodeDetails: boolean
  setShowNodeDetails: (v: boolean) => void
  showPodsByNamespace: boolean
  setShowPodsByNamespace: (v: boolean) => void
  stableClusterGPUs: GPUNode[]
  setShowGPUDetail: (v: boolean) => void
  setShowCPUDetail: (v: boolean) => void
  setShowMemoryDetail: (v: boolean) => void
  setShowStorageDetail: (v: boolean) => void
  namespaceStats: NamespaceStats[]
  clusterDeployments: Deployment[]
}

export function ClusterDetailStats({
  isUnreachable, effectiveLoading, health,
  showNodeDetails, setShowNodeDetails,
  showPodsByNamespace, setShowPodsByNamespace,
  stableClusterGPUs, setShowGPUDetail,
  setShowCPUDetail, setShowMemoryDetail, setShowStorageDetail,
  namespaceStats, clusterDeployments,
}: ClusterDetailStatsProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Stats - Interactive Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => !isUnreachable && !effectiveLoading && setShowNodeDetails(!showNodeDetails)}
          disabled={isUnreachable || effectiveLoading}
          className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
            !isUnreachable && !effectiveLoading ? 'border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer' : 'border-border cursor-default'
          } ${showNodeDetails ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10' : ''}`}
          title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewNode') : undefined}
        >
          {effectiveLoading ? (
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
                {!isUnreachable && <ChevronDown className={`w-4 h-4 transition-transform text-cyan-400 ${showNodeDetails ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />}
              </div>
              <div className="text-xs text-green-400">{!isUnreachable ? `${health?.readyNodes || 0} ${t('clusterDetail.ready')}` : t('clusterDetail.offline')}</div>
              {!isUnreachable && !showNodeDetails && (
                <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-cyan-400/70 transition-colors">{t('clusterDetail.clickToExpand')}</div>
              )}
            </>
          )}
        </button>
        <button
          onClick={() => !isUnreachable && !effectiveLoading && setShowPodsByNamespace(!showPodsByNamespace)}
          disabled={isUnreachable || effectiveLoading}
          className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
            !isUnreachable && !effectiveLoading ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer' : 'border-border cursor-default'
          } ${showPodsByNamespace ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10' : ''}`}
          title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewWorkloads') : undefined}
        >
          <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
            {t('clusterDetail.workloads')}
            {!isUnreachable && !effectiveLoading && <ChevronDown className={`w-4 h-4 transition-transform text-blue-400 ${showPodsByNamespace ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />}
          </div>
          {effectiveLoading ? (
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
              {!isUnreachable && !showPodsByNamespace && (
                <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">{t('clusterDetail.clickToExpand')}</div>
              )}
            </>
          )}
        </button>
        <button
          onClick={() => !isUnreachable && !effectiveLoading && stableClusterGPUs.length > 0 && setShowGPUDetail(true)}
          disabled={isUnreachable || effectiveLoading || stableClusterGPUs.length === 0}
          className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
            !isUnreachable && !effectiveLoading && stableClusterGPUs.length > 0 ? 'border-border hover:border-yellow-500/50 hover:bg-yellow-500/5 hover:shadow-lg hover:shadow-yellow-500/10 cursor-pointer' : 'border-border cursor-default'
          }`}
          title={!isUnreachable && !effectiveLoading && stableClusterGPUs.length > 0 ? t('clusterDetail.clickToViewGPU') : undefined}
        >
          {effectiveLoading ? (
            <>
              <div className="h-8 w-12 bg-muted/30 rounded animate-pulse mb-1" />
              <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
              <div className="h-4 w-20 bg-muted/30 rounded animate-pulse mt-1" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-foreground">{!isUnreachable ? stableClusterGPUs.reduce((sum, n) => sum + n.gpuCount, 0) : '-'}</div>
              <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
              <div className="text-xs text-yellow-400">{!isUnreachable ? `${stableClusterGPUs.reduce((sum, n) => sum + n.gpuAllocated, 0)} ${t('clusterDetail.allocated')}` : ''}</div>
              {!isUnreachable && stableClusterGPUs.length > 0 && (
                <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-yellow-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
              )}
            </>
          )}
        </button>
      </div>

      {/* Resource Metrics - Clickable cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => !isUnreachable && !effectiveLoading && setShowCPUDetail(true)}
          disabled={isUnreachable || effectiveLoading}
          className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
            !isUnreachable && !effectiveLoading ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer' : 'border-border cursor-default'
          }`}
          title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewCPU') : undefined}
        >
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-muted-foreground">{t('common.cpu')}</span>
          </div>
          {effectiveLoading ? (
            <>
              <div className="h-8 w-16 bg-muted/30 rounded animate-pulse mb-1" />
              <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.cpuCores || 0) : '-'}</div>
              <div className="text-xs text-muted-foreground">{t('clusterDetail.coresAllocatable')}</div>
              {!isUnreachable && (
                <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
              )}
            </>
          )}
        </button>
        <button
          onClick={() => !isUnreachable && !effectiveLoading && setShowMemoryDetail(true)}
          disabled={isUnreachable || effectiveLoading}
          className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
            !isUnreachable && !effectiveLoading ? 'border-border hover:border-green-500/50 hover:bg-green-500/5 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer' : 'border-border cursor-default'
          }`}
          title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewMemory') : undefined}
        >
          <div className="flex items-center gap-2 mb-2">
            <MemoryStick className="w-4 h-4 text-green-400" />
            <span className="text-sm text-muted-foreground">{t('common.memory')}</span>
          </div>
          {effectiveLoading ? (
            <>
              <div className="h-8 w-20 bg-muted/30 rounded animate-pulse mb-1" />
              <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-foreground">
                {!isUnreachable ? (health?.memoryGB ? (health.memoryGB >= 1024 ? `${(health.memoryGB / 1024).toFixed(1)} TB` : `${Math.round(health.memoryGB)} GB`) : '0 GB') : '-'}
              </div>
              <div className="text-xs text-muted-foreground">{t('clusterDetail.allocatable')}</div>
              {!isUnreachable && (
                <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-green-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
              )}
            </>
          )}
        </button>
        <button
          onClick={() => !isUnreachable && !effectiveLoading && setShowStorageDetail(true)}
          disabled={isUnreachable || effectiveLoading}
          className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
            !isUnreachable && !effectiveLoading ? 'border-border hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer' : 'border-border cursor-default'
          }`}
          title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewStorage') : undefined}
        >
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-muted-foreground">{t('common.storage')}</span>
          </div>
          {effectiveLoading ? (
            <>
              <div className="h-8 w-20 bg-muted/30 rounded animate-pulse mb-1" />
              <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-foreground">
                {!isUnreachable ? (health?.storageGB ? (health.storageGB >= 1024 ? `${(health.storageGB / 1024).toFixed(1)} TB` : `${Math.round(health.storageGB)} GB`) : '0 GB') : '-'}
              </div>
              <div className="text-xs text-muted-foreground">{t('clusterDetail.ephemeral')}</div>
              {!isUnreachable && (
                <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-purple-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
              )}
            </>
          )}
        </button>
      </div>
    </>
  )
}
