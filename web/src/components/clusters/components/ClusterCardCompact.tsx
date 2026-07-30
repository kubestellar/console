import { memo } from 'react'
import { AlertCircle, KeyRound, Star, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FlashingValue } from '../../ui/FlashingValue'
import { CloudProviderIcon, detectCloudProvider, getProviderColor } from '../../ui/CloudProviderIcon'
import { StatusBadge } from '../../ui/StatusBadge'
import { isClusterHealthy, isClusterUnreachable } from '../utils'
import type { ClusterCardProps } from './ClusterGrid.types'
import { RemoveClusterButton, handleCardKeyDown } from './ClusterGrid.common'
import { THEME_COLOR } from './ClusterGrid.constants'
import { isTokenExpired } from './ClusterTokenRefresh'

type ClusterCardCompactProps = Omit<ClusterCardProps, 'permissionsLoading' | 'isClusterAdmin' | 'onRenameCluster' | 'onRefreshCluster'>

export const ClusterCardCompact = memo(function ClusterCardCompact({
  cluster,
  gpuInfo,
  isConnected,
  onSelectCluster,
  onRemoveCluster,
  dragHandle,
}: ClusterCardCompactProps) {
  const { t } = useTranslation()
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const refreshing = cluster.refreshing === true
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
        background: `linear-gradient(135deg, color-mix(in srgb, ${providerColor} 38%, transparent) 0%, color-mix(in srgb, ${THEME_COLOR} 25%, transparent) 100%)`,
      }}
    >
      <div className="relative glass p-3 rounded-lg h-full overflow-hidden">
        <div className="flex items-center gap-2 mb-2 min-w-0">
          {dragHandle}
          {isTokenExpired(cluster) ? (
            <span title="Token Expired"><KeyRound className="w-3 h-3 text-red-400" /></span>
          ) : unreachable ? (
            <WifiOff className="w-3 h-3 text-yellow-400" />
          ) : !isClusterHealthy(cluster) ? (
            <AlertCircle className="w-3 h-3 text-orange-400" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-green-400" />
          )}
          <CloudProviderIcon provider={provider} size={14} />
          <span
            className="text-xs font-medium text-foreground truncate flex-1 min-w-0"
            title={cluster.aliases && cluster.aliases.length > 0 ? `${cluster.context || cluster.name}

aka: ${(cluster.aliases || []).join(', ')}` : cluster.context || cluster.name}
          >
            {cluster.context || cluster.name.split('/').pop()}
          </span>
          {cluster.aliases && cluster.aliases.length > 0 && (
            <span title={`Also known as: ${(cluster.aliases || []).join(', ')}`}>
              <StatusBadge color="purple" size="xs" className="shrink-0">
                +{cluster.aliases.length}
              </StatusBadge>
            </span>
          )}
          {cluster.isCurrent && <Star className="w-3 h-3 text-primary fill-current shrink-0" />}
          {isConnected && unreachable && onRemoveCluster && (cluster.source === 'kubeconfig' || !cluster.source) && (
            <RemoveClusterButton onRemove={onRemoveCluster} size="xs" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 text-center">
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'Nodes: Cluster offline' : hasCachedData ? `Nodes: ${cluster.nodeCount} worker nodes` : 'Nodes: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.nodeCount : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.nodes')}</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'CPU: Cluster offline' : hasCachedData ? `CPU: ${cluster.cpuCores} cores` : 'CPU: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.cpuCores : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.cpus')}</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'Pods: Cluster offline' : hasCachedData ? `Pods: ${cluster.podCount} running` : 'Pods: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.podCount : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.pods')}</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'GPU: Cluster offline' : gpuInfo ? `GPU: ${gpuInfo.allocated}/${gpuInfo.total} allocated` : 'GPU: None detected'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && !unreachable ? (gpuInfo?.total || 0) : '-'} />
            </div>
            <div className="text-2xs text-muted-foreground">{t('common.gpus')}</div>
          </div>
        </div>
      </div>
    </div>
  )
})
