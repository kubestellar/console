import { memo } from 'react'
import { AlertCircle, ChevronRight, ExternalLink, Globe, KeyRound, Pencil, RefreshCw, ShieldAlert, Star, User, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FlashingValue } from '../../ui/FlashingValue'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { CloudProviderIcon, detectCloudProvider, getConsoleUrl, getProviderColor, getProviderLabel } from '../../ui/CloudProviderIcon'
import { StatusBadge } from '../../ui/StatusBadge'
import { isClusterHealthy, isClusterLoading, isClusterUnreachable } from '../utils'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import type { ClusterCardProps } from './ClusterGrid.types'
import { ActionTooltipWrapper, RemoveClusterButton, handleCardKeyDown } from './ClusterGrid.common'
import { CLUSTER_GRID_DIV_STYLE_1, DISABLED_CLUSTER_ACTION_CLASS, LOCAL_PLATFORMS, THEME_COLOR } from './ClusterGrid.constants'
import { ClusterAuthBadges, ClusterIAMRefreshHint } from './ClusterAuthBadges'
import { LocalClusterControls } from './LocalClusterControls'
import { isTokenExpired, useClusterRefreshSpin } from './ClusterTokenRefresh'

export const ClusterCardFull = memo(function ClusterCardFull({
  cluster,
  gpuInfo,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
  onRemoveCluster,
  dragHandle,
}: ClusterCardProps) {
  const { t } = useTranslation()
  const loading = isClusterLoading(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const initialLoading = loading && !hasCachedData
  const refreshing = cluster.refreshing === true
  const spinning = useClusterRefreshSpin(refreshing)
  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerLabel = getProviderLabel(provider)
  const providerColor = getProviderColor(provider)
  const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)

  return (
    <div
      onClick={onSelectCluster}
      onKeyDown={handleCardKeyDown(onSelectCluster)}
      role="button"
      tabIndex={0}
      aria-label={`Select cluster ${cluster.context || cluster.name}`}
      className="relative p-px rounded-lg cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 overflow-hidden h-full"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${providerColor} 50%, transparent) 0%, color-mix(in srgb, ${THEME_COLOR} 38%, transparent) 100%)`,
      }}
    >
      <div className="relative glass p-5 rounded-lg h-full overflow-hidden">
        <div className="absolute -bottom-2 -left-2 pointer-events-none" style={CLUSTER_GRID_DIV_STYLE_1}>
          <CloudProviderIcon provider={provider} size={100} />
        </div>
        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {dragHandle}
            <div className="flex flex-col items-center gap-2 shrink-0">
              {initialLoading ? (
                <StatusIndicator status="loading" size="lg" showLabel={false} />
              ) : isTokenExpired(cluster) ? (
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center" title={t('common.tokenExpired')}>
                  <KeyRound className="w-4 h-4 text-red-400" />
                </div>
              ) : unreachable ? (
                <div
                  className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center"
                  title={cluster.errorMessage ? `Offline (${cluster.errorType || 'error'}): ${cluster.errorMessage}` : cluster.errorType ? `Offline: ${cluster.errorType}` : 'Offline - check network connection'}
                >
                  <WifiOff className="w-4 h-4 text-yellow-400" />
                </div>
              ) : !isClusterHealthy(cluster) ? (
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center" title="Degraded - some nodes not ready">
                  <AlertCircle className="w-4 h-4 text-orange-400" />
                </div>
              ) : (
                <StatusIndicator status="healthy" size="lg" showLabel={false} />
              )}
              {onRefreshCluster && (() => {
                const refreshTooltip = spinning
                  ? t('common.refreshing')
                  : unreachable
                    ? t('cluster.controlsDisabledOffline')
                    : t('common.refreshClusterData')

                return (
                  <ActionTooltipWrapper tooltip={refreshTooltip}>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onRefreshCluster()
                      }}
                      disabled={spinning || unreachable}
                      className={`flex items-center p-1 rounded transition-colors ${
                        spinning
                          ? 'bg-blue-500/20 text-blue-400'
                          : unreachable
                            ? DISABLED_CLUSTER_ACTION_CLASS
                            : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                      aria-label={refreshTooltip}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>
                  </ActionTooltipWrapper>
                )
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0" title={providerLabel}>
                  <CloudProviderIcon provider={provider} size={18} />
                </span>
                <h3
                  className="flex-1 min-w-0 font-semibold text-foreground truncate"
                  title={cluster.aliases && cluster.aliases.length > 0 ? `${cluster.context || cluster.name}

aka: ${(cluster.aliases || []).join(', ')}` : cluster.context || cluster.name}
                >
                  {cluster.context || cluster.name.split('/').pop()}
                </h3>
                <ClusterAuthBadges cluster={cluster} className="text-2xs px-1.5 py-0.5 rounded shrink-0" />
                {cluster.aliases && cluster.aliases.length > 0 && (
                  <span title={`Also known as: ${(cluster.aliases || []).join(', ')}`}>
                    <StatusBadge color="purple" size="xs" className="shrink-0">
                      +{cluster.aliases.length} alias{cluster.aliases.length > 1 ? 'es' : ''}
                    </StatusBadge>
                  </span>
                )}
                {isConnected && (cluster.source === 'kubeconfig' || !cluster.source) && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onRenameCluster()
                    }}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground shrink-0"
                    title={t('common.renameContext')}
                    aria-label={t('common.renameContext')}
                  >
                    <Pencil className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
                {isConnected && unreachable && onRemoveCluster && (cluster.source === 'kubeconfig' || !cluster.source) && (
                  <RemoveClusterButton onRemove={onRemoveCluster} size="xs" />
                )}
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {cluster.server && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default truncate max-w-[220px]" title={`Server: ${cluster.server}`}>
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{cluster.server.replace(/^https?:\/\//, '')}</span>
                  </span>
                )}
                {cluster.user && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default truncate max-w-[220px]" title={`User: ${cluster.user}`}>
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{cluster.user}</span>
                  </span>
                )}
                <ClusterIAMRefreshHint cluster={cluster} className="flex items-center gap-1 text-2xs text-muted-foreground mt-0.5" />
                {isTokenExpired(cluster) && cluster.authMethod !== 'exec' && (
                  <span className="text-2xs text-muted-foreground mt-0.5">{t('cluster.authErrorTokenHint')}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-1 shrink-0">
            {cluster.isCurrent && (
              <span className="flex items-center px-1.5 py-0.5 rounded bg-primary/20 text-primary" title={t('common.currentContext')}>
                <Star className="w-3.5 h-3.5 fill-current" />
              </span>
            )}
            {!permissionsLoading && !isClusterAdmin && !unreachable && (
              <StatusBadge color="blue" title={t('common.limitedPermissions')} icon={<ShieldAlert className="w-3.5 h-3.5" />} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-center relative z-10 cursor-default">
          <div title={unreachable ? 'Nodes: Cluster offline' : hasCachedData && cluster.nodeCount !== undefined ? `Nodes: ${cluster.nodeCount} worker nodes in cluster` : 'Nodes: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.nodeCount !== undefined ? cluster.nodeCount : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.nodes')}</div>
          </div>
          <div title={unreachable ? 'CPU: Cluster offline' : hasCachedData && cluster.cpuCores !== undefined ? `CPU: ${cluster.cpuCores} total CPU cores` : 'CPU: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.cpuCores !== undefined ? cluster.cpuCores : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.cpus')}</div>
          </div>
          <div title={unreachable ? 'Pods: Cluster offline' : hasCachedData && cluster.podCount !== undefined ? `Pods: ${cluster.podCount} running pods` : 'Pods: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.podCount !== undefined ? cluster.podCount : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.pods')}</div>
          </div>
          <div title={unreachable ? 'GPU: Cluster offline' : gpuInfo ? `GPU: ${gpuInfo.allocated}/${gpuInfo.total} GPUs allocated` : 'GPU: No GPUs detected'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && !unreachable ? (gpuInfo ? gpuInfo.total : 0) : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">{t('common.gpus')}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border relative z-10 cursor-default">
          {consoleUrl && (
            <div className="flex justify-center mb-3">
              <a
                href={sanitizeUrl(consoleUrl)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/70 hover:bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title={`Open ${providerLabel} console`}
              >
                <span>console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Source: {cluster.source || 'kubeconfig'}</span>
            <div className="flex items-center gap-2">
              {LOCAL_PLATFORMS.has(provider) && (
                <LocalClusterControls clusterName={cluster.name} provider={provider} unreachable={unreachable} />
              )}
              <span title={t('common.viewDetails')}><ChevronRight className="w-4 h-4 text-primary" /></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
