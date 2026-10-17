import { ChevronDown, ChevronRight, FolderOpen, Layers, Loader2, Cpu, MemoryStick, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { type ClusterHealth, type NamespaceStats } from '../../hooks/useMCP'
import { NamespaceResources } from './components'

export { ClusterDetailHeader } from './ClusterDetailHeader'
export { ClusterStatsCards } from './ClusterStatsCards'

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
