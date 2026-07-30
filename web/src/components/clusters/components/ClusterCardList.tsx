import { memo } from 'react'
import { AlertCircle, Box, ChevronRight, Cpu, Globe, KeyRound, RefreshCw, Server, ShieldAlert, Star, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FlashingValue } from '../../ui/FlashingValue'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { CloudProviderIcon, detectCloudProvider, getProviderColor } from '../../ui/CloudProviderIcon'
import { StatusBadge } from '../../ui/StatusBadge'
import { isClusterHealthy, isClusterLoading, isClusterUnreachable } from '../utils'
import type { ClusterCardProps } from './ClusterGrid.types'
import { ActionTooltipWrapper, RemoveClusterButton, handleCardKeyDown } from './ClusterGrid.common'
import { CLUSTER_GRID_DIV_STYLE_2, DISABLED_CLUSTER_ACTION_CLASS, LOCAL_PLATFORMS, THEME_COLOR } from './ClusterGrid.constants'
import { ClusterAuthBadges, ClusterIAMRefreshHint } from './ClusterAuthBadges'
import { LocalClusterControls } from './LocalClusterControls'
import { isTokenExpired, useClusterRefreshSpin } from './ClusterTokenRefresh'

type ClusterCardListProps = Omit<ClusterCardProps, 'onRenameCluster'>

export const ClusterCardList = memo(function ClusterCardList({
  cluster,
  gpuInfo,
  permissionsLoading,
  isClusterAdmin,
  isConnected,
  onSelectCluster,
  onRefreshCluster,
  onRemoveCluster,
  dragHandle,
}: ClusterCardListProps) {
  const { t } = useTranslation()
  const loading = isClusterLoading(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const initialLoading = loading && !hasCachedData
  const refreshing = cluster.refreshing === true
  const spinning = useClusterRefreshSpin(refreshing)
  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerColor = getProviderColor(provider)

  return (
    <div
      onClick={onSelectCluster}
      onKeyDown={handleCardKeyDown(onSelectCluster)}
      role="button"
      tabIndex={0}
      aria-label={`Select cluster ${cluster.context || cluster.name}`}
      className="relative p-px rounded-lg cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
      style={{
        background: `linear-gradient(90deg, color-mix(in srgb, ${providerColor} 38%, transparent) 0%, color-mix(in srgb, ${THEME_COLOR} 25%, transparent) 100%)`,
      }}
    >
      <div className="relative glass px-4 py-3 rounded-lg h-full overflow-hidden">
        <div className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={CLUSTER_GRID_DIV_STYLE_2}>
          <CloudProviderIcon provider={provider} size={64} />
        </div>
        <div className="flex items-center gap-4 min-w-0">
          {dragHandle}
          <div className="shrink-0">
            {initialLoading ? (
              <StatusIndicator status="loading" size="md" showLabel={false} />
            ) : isTokenExpired(cluster) ? (
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center" title="Token Expired">
                <KeyRound className="w-3 h-3 text-red-400" />
              </div>
            ) : unreachable ? (
              <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center" title="Offline">
                <WifiOff className="w-3 h-3 text-yellow-400" />
              </div>
            ) : !isClusterHealthy(cluster) ? (
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center" title="Unhealthy">
                <AlertCircle className="w-3 h-3 text-orange-400" />
              </div>
            ) : (
              <StatusIndicator status="healthy" size="md" showLabel={false} />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CloudProviderIcon provider={provider} size={16} />
            <span
              className="font-medium text-foreground truncate flex-1 min-w-0"
              title={cluster.aliases && cluster.aliases.length > 0 ? `${cluster.context || cluster.name}

aka: ${(cluster.aliases || []).join(', ')}` : cluster.context || cluster.name}
            >
              {cluster.context || cluster.name.split('/').pop()}
            </span>
            <ClusterAuthBadges cluster={cluster} className="text-[9px] px-1 py-0.5 rounded shrink-0" />
            {cluster.aliases && cluster.aliases.length > 0 && (
              <span title={`Also known as: ${(cluster.aliases || []).join(', ')}`}>
                <StatusBadge color="purple" size="xs" className="shrink-0">
                  +{cluster.aliases.length}
                </StatusBadge>
              </span>
            )}
            {cluster.isCurrent && (
              <span title="Current context"><Star className="w-3 h-3 text-primary fill-current shrink-0" /></span>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1 max-w-xs">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{cluster.server?.replace(/^https?:\/\//, '') || '-'}</span>
          </div>

          <ClusterIAMRefreshHint cluster={cluster} className="hidden md:flex items-center gap-1 text-2xs text-muted-foreground shrink-0" label={null} />

          <div className="flex items-center gap-4 text-sm shrink-0">
            <div className="flex items-center gap-1.5" title={unreachable ? 'Nodes: Cluster offline' : hasCachedData ? `Nodes: ${cluster.nodeCount} worker nodes in cluster` : 'Nodes: Loading...'}>
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue value={hasCachedData ? cluster.nodeCount : '-'} className={refreshing ? 'text-muted-foreground' : 'text-foreground'} />
            </div>
            <div className="flex items-center gap-1.5" title={unreachable ? 'CPU: Cluster offline' : hasCachedData ? `CPU: ${cluster.cpuCores} total CPU cores` : 'CPU: Loading...'}>
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue value={hasCachedData ? cluster.cpuCores : '-'} className={refreshing ? 'text-muted-foreground' : 'text-foreground'} />
            </div>
            <div className="flex items-center gap-1.5" title={unreachable ? 'Pods: Cluster offline' : hasCachedData ? `Pods: ${cluster.podCount} running pods` : 'Pods: Loading...'}>
              <Box className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue value={hasCachedData ? cluster.podCount : '-'} className={refreshing ? 'text-muted-foreground' : 'text-foreground'} />
            </div>
            {gpuInfo && gpuInfo.total > 0 && !unreachable && (
              <div className="flex items-center gap-1.5" title={`GPU: ${gpuInfo.allocated}/${gpuInfo.total} GPUs allocated`}>
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <FlashingValue value={gpuInfo.total} className={refreshing ? 'text-muted-foreground' : 'text-foreground'} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {LOCAL_PLATFORMS.has(provider) && (
              <LocalClusterControls clusterName={cluster.name} provider={provider} unreachable={unreachable} />
            )}
            {onRefreshCluster && (() => {
              const refreshTooltip = spinning
                ? t('common.refreshing')
                : unreachable
                  ? t('cluster.controlsDisabledOffline')
                  : t('common.refresh')

              return (
                <ActionTooltipWrapper tooltip={refreshTooltip}>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onRefreshCluster()
                    }}
                    disabled={spinning || unreachable}
                    className={`p-1.5 rounded transition-colors ${
                      spinning
                        ? 'text-blue-400'
                        : unreachable
                          ? DISABLED_CLUSTER_ACTION_CLASS
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                    aria-label={refreshTooltip}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
                  </button>
                </ActionTooltipWrapper>
              )
            })()}
            {isConnected && unreachable && onRemoveCluster && (cluster.source === 'kubeconfig' || !cluster.source) && (
              <RemoveClusterButton onRemove={onRemoveCluster} />
            )}
            {!permissionsLoading && !isClusterAdmin && !unreachable && (
              <span title={t('common.limitedPermissions')}>
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>
    </div>
  )
})
