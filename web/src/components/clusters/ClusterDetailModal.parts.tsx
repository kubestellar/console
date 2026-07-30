import { WifiOff, CheckCircle, AlertTriangle, X, Pencil, Trash2, Server, ExternalLink, ChevronDown, ChevronRight, FolderOpen, Layers, Loader2, Cpu, MemoryStick, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { sanitizeUrl } from '../../lib/utils/sanitizeUrl'
import {
  CloudProviderIcon,
  detectCloudProvider as detectCloudProviderShared,
  getProviderLabel,
  getConsoleUrl,
  type CloudProvider as CloudProviderType,
} from '../ui/CloudProviderIcon'
import { getProviderInfo, type ClusterDetailCloudProvider } from './utils'
import { type ClusterInfo, type ClusterHealth, type NamespaceStats, type Deployment, type GPUNode } from '../../hooks/useMCP'
import { NamespaceResources } from './components'

// ─── ClusterDetailHeader ─────────────────────────────────────────────────────

interface ClusterDetailHeaderProps {
  clusterName: string
  clusterUser?: string
  clusterInfo: ClusterInfo | undefined
  health: ClusterHealth | null | undefined
  isUnreachable: boolean
  isHealthy: boolean
  aliasList: string[]
  headerAliasSummary: string
  serverAddress: string | undefined
  onClose: () => void
  onRename?: (clusterName: string) => void
  onRemove?: (clusterName: string) => void
}

export function ClusterDetailHeader({
  clusterName,
  clusterUser,
  clusterInfo,
  health,
  isUnreachable,
  isHealthy,
  aliasList,
  headerAliasSummary,
  serverAddress,
  onClose,
  onRename,
  onRemove,
}: ClusterDetailHeaderProps) {
  const { t } = useTranslation()

  const serverUrl = clusterInfo?.server || health?.apiServer
  const detectedProvider =
    (clusterInfo?.distribution as CloudProviderType) ||
    detectCloudProviderShared(clusterName, serverUrl, clusterInfo?.namespaces, clusterUser)
  const consoleUrl = getConsoleUrl(detectedProvider, clusterName, serverUrl)
  const providerInfo = getProviderInfo(
    detectedProvider === 'kubernetes' ? 'unknown' : (detectedProvider as ClusterDetailCloudProvider),
  )
  const providerLabel = getProviderLabel(detectedProvider)

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {isUnreachable ? (
          <StatusBadge color="yellow" icon={<WifiOff className="w-4 h-4" />} className="px-2 py-1" />
        ) : isHealthy ? (
          <StatusBadge color="green" icon={<CheckCircle className="w-4 h-4" />} className="px-2 py-1" />
        ) : (
          <StatusBadge color="red" icon={<AlertTriangle className="w-4 h-4" />} className="px-2 py-1" />
        )}
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold text-foreground">{clusterName.split('/').pop()}</h2>
          {aliasList.length > 0 && (
            <div
              className="text-xs text-muted-foreground mt-0.5"
              title={t('clusterDetail.alsoKnownAs', { aliases: (aliasList || []).join(', ') })}
            >
              {t('clusterDetail.akaLabel')} {headerAliasSummary}
            </div>
          )}
          {serverAddress && (
            <div
              className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"
              data-testid="cluster-detail-server-address"
              title={`${t('clusterDetail.serverAddress')}: ${serverAddress}`}
            >
              <Server className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-xs">{serverAddress}</span>
            </div>
          )}
        </div>
        {consoleUrl ? (
          <a
            href={sanitizeUrl(consoleUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium ${providerInfo.bgColor} ${providerInfo.color} hover:opacity-80 transition-opacity`}
            title={t('clusterDetail.openConsole', { provider: providerLabel })}
          >
            <CloudProviderIcon provider={detectedProvider} size={16} />
            {providerLabel}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium ${providerInfo.bgColor} ${providerInfo.color}`}
            title={providerLabel}
          >
            <CloudProviderIcon provider={detectedProvider} size={16} />
            {providerLabel}
          </span>
        )}
        {onRename && (
          <button
            onClick={() => onRename(clusterName)}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            title={t('clusterDetail.renameCluster')}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {onRemove && isUnreachable && (clusterInfo?.source === 'kubeconfig' || !clusterInfo?.source) && (
          <button
            onClick={() => onRemove(clusterName)}
            className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
            title={t('cluster.removeCluster')}
            aria-label={t('cluster.removeCluster')}
            data-testid="cluster-detail-remove-button"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <button aria-label={t('actions.close')} onClick={onClose} className="text-muted-foreground hover:text-foreground">
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}

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

// ─── ClusterResourceMetrics ───────────────────────────────────────────────────

interface ClusterResourceMetricsProps {
  isUnreachable: boolean
  isLoading: boolean
  health: ClusterHealth | null | undefined
  setShowCPUDetail: (v: boolean) => void
  setShowMemoryDetail: (v: boolean) => void
  setShowStorageDetail: (v: boolean) => void
}

export function ClusterResourceMetrics({
  isUnreachable,
  isLoading,
  health,
  setShowCPUDetail,
  setShowMemoryDetail,
  setShowStorageDetail,
}: ClusterResourceMetricsProps) {
  const { t } = useTranslation()
  const canInteract = !isUnreachable && !isLoading

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {/* CPU */}
      <button
        onClick={() => canInteract && setShowCPUDetail(true)}
        disabled={!canInteract}
        className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
          canInteract
            ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer'
            : 'border-border cursor-default'
        }`}
        title={canInteract ? t('clusterDetail.clickToViewCPU') : undefined}
      >
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-blue-400" />
          <span className="text-sm text-muted-foreground">{t('common.cpu')}</span>
        </div>
        {isLoading ? (
          <>
            <div className="h-8 w-16 bg-muted/30 rounded animate-pulse mb-1" />
            <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.cpuCores || 0) : '-'}</div>
            <div className="text-xs text-muted-foreground">{t('clusterDetail.coresAllocatable')}</div>
            {!isUnreachable && (
              <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">
                {t('clusterDetail.clickForDetails')}
              </div>
            )}
          </>
        )}
      </button>

      {/* Memory */}
      <button
        onClick={() => canInteract && setShowMemoryDetail(true)}
        disabled={!canInteract}
        className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
          canInteract
            ? 'border-border hover:border-green-500/50 hover:bg-green-500/5 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer'
            : 'border-border cursor-default'
        }`}
        title={canInteract ? t('clusterDetail.clickToViewMemory') : undefined}
      >
        <div className="flex items-center gap-2 mb-2">
          <MemoryStick className="w-4 h-4 text-green-400" />
          <span className="text-sm text-muted-foreground">{t('common.memory')}</span>
        </div>
        {isLoading ? (
          <>
            <div className="h-8 w-20 bg-muted/30 rounded animate-pulse mb-1" />
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-foreground">
              {!isUnreachable
                ? health?.memoryGB
                  ? health.memoryGB >= 1024
                    ? `${(health.memoryGB / 1024).toFixed(1)} TB`
                    : `${Math.round(health.memoryGB)} GB`
                  : '0 GB'
                : '-'}
            </div>
            <div className="text-xs text-muted-foreground">{t('clusterDetail.allocatable')}</div>
            {!isUnreachable && (
              <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-green-400/70 transition-colors">
                {t('clusterDetail.clickForDetails')}
              </div>
            )}
          </>
        )}
      </button>

      {/* Storage */}
      <button
        onClick={() => canInteract && setShowStorageDetail(true)}
        disabled={!canInteract}
        className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
          canInteract
            ? 'border-border hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer'
            : 'border-border cursor-default'
        }`}
        title={canInteract ? t('clusterDetail.clickToViewStorage') : undefined}
      >
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-4 h-4 text-purple-400" />
          <span className="text-sm text-muted-foreground">{t('common.storage')}</span>
        </div>
        {isLoading ? (
          <>
            <div className="h-8 w-20 bg-muted/30 rounded animate-pulse mb-1" />
            <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-foreground">
              {!isUnreachable
                ? health?.storageGB
                  ? health.storageGB >= 1024
                    ? `${(health.storageGB / 1024).toFixed(1)} TB`
                    : `${Math.round(health.storageGB)} GB`
                  : '0 GB'
                : '-'}
            </div>
            <div className="text-xs text-muted-foreground">{t('clusterDetail.ephemeral')}</div>
            {!isUnreachable && (
              <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-purple-400/70 transition-colors">
                {t('clusterDetail.clickForDetails')}
              </div>
            )}
          </>
        )}
      </button>
    </div>
  )
}

// ─── ClusterWorkloadsSection ──────────────────────────────────────────────────

interface ClusterWorkloadsSectionProps {
  isUnreachable: boolean
  showPodsByNamespace: boolean
  namespaceStats: NamespaceStats[]
  showAllNamespaces: boolean
  setShowAllNamespaces: (v: boolean) => void
  expandedNamespace: string | null
  setExpandedNamespace: (v: string | null) => void
  clusterName: string
  onClose: () => void
  nsLoading: boolean
}

export function ClusterWorkloadsSection({
  isUnreachable,
  showPodsByNamespace,
  namespaceStats,
  showAllNamespaces,
  setShowAllNamespaces,
  expandedNamespace,
  setExpandedNamespace,
  clusterName,
  onClose,
  nsLoading,
}: ClusterWorkloadsSectionProps) {
  const { t } = useTranslation()

  if (isUnreachable || !showPodsByNamespace || namespaceStats.length === 0) return null

  const visibleStats = showAllNamespaces ? namespaceStats : namespaceStats.slice(0, 5)

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Layers className="w-4 h-4 text-blue-400" />
        {t('clusterDetail.workloadsCount', { count: namespaceStats.length })}
      </h3>
      <div className="rounded-lg bg-card/50 border border-border overflow-hidden">
        <div className="divide-y divide-border/30">
          {visibleStats.map((ns) => {
            const isExpanded = expandedNamespace === ns.name
            return (
              <div key={ns.name} className="overflow-hidden">
                <button
                  onClick={() => setExpandedNamespace(isExpanded ? null : ns.name)}
                  className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <StatusBadge color="blue" size="xs" icon={<FolderOpen className="w-3 h-3" />}>
                      {t('clusterDetail.ns')}
                    </StatusBadge>
                    <span className="font-mono text-sm text-foreground">{ns.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">{t('clusterDetail.podsCount', { count: ns.podCount })}</span>
                    {ns.runningPods > 0 && (
                      <span className="text-green-400">{t('clusterDetail.runningPods', { count: ns.runningPods })}</span>
                    )}
                    {ns.pendingPods > 0 && (
                      <span className="text-yellow-400">{t('clusterDetail.pendingPods', { count: ns.pendingPods })}</span>
                    )}
                    {ns.failedPods > 0 && (
                      <span className="text-red-400">{t('clusterDetail.failedPods', { count: ns.failedPods })}</span>
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="bg-card/20 border-t border-border/20 px-4 py-2">
                    <NamespaceResources clusterName={clusterName} namespace={ns.name} onClose={onClose} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {namespaceStats.length > 5 && (
          <button
            onClick={() => setShowAllNamespaces(!showAllNamespaces)}
            className="w-full p-2 text-sm text-primary hover:bg-card/30 transition-colors border-t border-border/30"
          >
            {showAllNamespaces
              ? t('clusterDetail.showLess')
              : t('clusterDetail.showAllNamespaces', { count: namespaceStats.length })}
          </button>
        )}
      </div>
      {nsLoading && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('clusterDetail.loadingNamespaceData')}
        </div>
      )}
    </div>
  )
}
