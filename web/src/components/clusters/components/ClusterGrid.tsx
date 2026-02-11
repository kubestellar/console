import { memo } from 'react'
import { Pencil, Globe, User, ShieldAlert, ChevronRight, Star, WifiOff, RefreshCw, ExternalLink, AlertCircle, Cpu, Box, Server, KeyRound } from 'lucide-react'
import { FlashingValue } from '../../ui/FlashingValue'
import { ClusterInfo } from '../../../hooks/useMCP'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { isClusterUnreachable, isClusterLoading } from '../utils'
import { CloudProviderIcon, detectCloudProvider, getProviderLabel, getProviderColor, getConsoleUrl } from '../../ui/CloudProviderIcon'

// Helper to derive health status from cluster data
// If we have node data and the cluster is reachable, consider it healthy
// This prevents false "unhealthy" states during health check delays
function isClusterHealthy(cluster: ClusterInfo): boolean {
  // If unreachable, not healthy
  if (cluster.reachable === false) {
    return false
  }
  // If we have nodes (cluster is working), consider healthy
  // The health check may take time to update, so be optimistic with working clusters
  if (cluster.nodeCount !== undefined && cluster.nodeCount > 0) {
    return true
  }
  // No node data yet - use healthy flag
  return cluster.healthy === true
}

// Helper to detect token/auth expiration errors
function isTokenExpired(cluster: ClusterInfo): boolean {
  return cluster.errorType === 'auth'
}

interface GPUInfo {
  total: number
  allocated: number
}

export type ClusterLayoutMode = 'grid' | 'list' | 'compact' | 'wide'

interface ClusterGridProps {
  clusters: ClusterInfo[]
  gpuByCluster: Record<string, GPUInfo>
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: (clusterName: string) => boolean
  onSelectCluster: (clusterName: string) => void
  onRenameCluster: (clusterName: string) => void
  onRefreshCluster?: (clusterName: string) => void
  layoutMode?: ClusterLayoutMode
}

// Shared props for individual cluster cards
interface ClusterCardProps {
  cluster: ClusterInfo
  gpuInfo?: GPUInfo
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: boolean
  onSelectCluster: () => void
  onRenameCluster: () => void
  onRefreshCluster?: () => void
  layoutMode: ClusterLayoutMode
}

// Full/default card (used for 'grid' and 'wide' modes)
const FullClusterCard = memo(function FullClusterCard({
  cluster,
  gpuInfo,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
}: Omit<ClusterCardProps, 'layoutMode'>) {
  const loading = isClusterLoading(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const initialLoading = loading && !hasCachedData
  const refreshing = cluster.refreshing === true

  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerLabel = getProviderLabel(provider)
  const providerColor = getProviderColor(provider)
  const themeColor = '#9333ea'
  const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)

  return (
    <div
      onClick={onSelectCluster}
      className="relative p-[1px] rounded-lg cursor-pointer transition-all hover:scale-[1.02] overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${providerColor}80 0%, ${themeColor}60 100%)`,
      }}
    >
      <div className="relative glass p-5 rounded-lg h-full overflow-hidden">
        {/* Background provider icon */}
        <div
          className="absolute -bottom-2 -left-2 pointer-events-none"
          style={{
            opacity: 0.25,
            maskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
            WebkitMaskImage: 'linear-gradient(45deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 80%)',
          }}
        >
          <CloudProviderIcon provider={provider} size={100} />
        </div>
        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-3">
            {/* Status indicator with refresh button below */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              {initialLoading ? (
                <StatusIndicator status="loading" size="lg" showLabel={false} />
              ) : isTokenExpired(cluster) ? (
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center" title="Token Expired - re-authenticate to access this cluster">
                  <KeyRound className="w-4 h-4 text-red-400" />
                </div>
              ) : unreachable ? (
                <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center" title="Offline - check network connection">
                  <WifiOff className="w-4 h-4 text-yellow-400" />
                </div>
              ) : !isClusterHealthy(cluster) ? (
                <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center" title="Degraded - some nodes not ready">
                  <AlertCircle className="w-4 h-4 text-orange-400" />
                </div>
              ) : (
                <StatusIndicator status="healthy" size="lg" showLabel={false} />
              )}
              {onRefreshCluster && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRefreshCluster() }}
                  disabled={refreshing}
                  className={`flex items-center p-1 rounded transition-colors ${
                    refreshing ? 'bg-blue-500/20 text-blue-400' :
                    unreachable ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' :
                    'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                  title={refreshing ? 'Refreshing...' : unreachable ? 'Retry connection' : 'Refresh cluster data'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0" title={providerLabel}>
                  <CloudProviderIcon provider={provider} size={18} />
                </span>
                <h3
                  className="font-semibold text-foreground truncate"
                  title={cluster.aliases && cluster.aliases.length > 0
                    ? `${cluster.context || cluster.name}\n\naka: ${cluster.aliases.join(', ')}`
                    : cluster.context || cluster.name
                  }
                >
                  {cluster.context || cluster.name.split('/').pop()}
                </h3>
                {cluster.aliases && cluster.aliases.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 flex-shrink-0"
                    title={`Also known as: ${cluster.aliases.join(', ')}`}
                  >
                    +{cluster.aliases.length} alias{cluster.aliases.length > 1 ? 'es' : ''}
                  </span>
                )}
                {isConnected && (cluster.source === 'kubeconfig' || !cluster.source) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRenameCluster() }}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground flex-shrink-0"
                    title="Rename context"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {cluster.server && (
                  <span
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-default truncate max-w-[220px]"
                    title={`Server: ${cluster.server}`}
                  >
                    <Globe className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{cluster.server.replace(/^https?:\/\//, '')}</span>
                  </span>
                )}
                {cluster.user && (
                  <span
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-default truncate max-w-[220px]"
                    title={`User: ${cluster.user}`}
                  >
                    <User className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{cluster.user}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-1 flex-shrink-0">
            {cluster.isCurrent && (
              <span className="flex items-center px-1.5 py-0.5 rounded bg-primary/20 text-primary" title="Current kubectl context">
                <Star className="w-3.5 h-3.5 fill-current" />
              </span>
            )}
            {!permissionsLoading && !isClusterAdmin && !unreachable && (
              <span className="flex items-center px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400" title="You have limited permissions on this cluster">
                <ShieldAlert className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 text-center relative z-10">
          <div title={unreachable ? 'Nodes: Cluster offline' : hasCachedData && cluster.nodeCount !== undefined ? `Nodes: ${cluster.nodeCount} worker nodes in cluster` : 'Nodes: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.nodeCount !== undefined ? cluster.nodeCount : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">Nodes</div>
          </div>
          <div title={unreachable ? 'CPU: Cluster offline' : hasCachedData && cluster.cpuCores !== undefined ? `CPU: ${cluster.cpuCores} total CPU cores` : 'CPU: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.cpuCores !== undefined ? cluster.cpuCores : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">CPUs</div>
          </div>
          <div title={unreachable ? 'Pods: Cluster offline' : hasCachedData && cluster.podCount !== undefined ? `Pods: ${cluster.podCount} running pods` : 'Pods: Loading...'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && cluster.podCount !== undefined ? cluster.podCount : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">Pods</div>
          </div>
          <div title={unreachable ? 'GPU: Cluster offline' : gpuInfo ? `GPU: ${gpuInfo.allocated}/${gpuInfo.total} GPUs allocated` : 'GPU: No GPUs detected'}>
            <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && !unreachable ? (gpuInfo ? gpuInfo.total : 0) : '-'} />
            </div>
            <div className="text-xs text-muted-foreground">GPUs</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border relative z-10">
          {consoleUrl && (
            <div className="flex justify-center mb-3">
              <a
                href={consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/70 hover:bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors"
                title={`Open ${providerLabel} console`}
              >
                <span>console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Source: {cluster.source || 'kubeconfig'}</span>
            <span title="View details"><ChevronRight className="w-4 h-4 text-primary" /></span>
          </div>
        </div>
      </div>
    </div>
  )
})

// List card (horizontal, single row per cluster)
const ListClusterCard = memo(function ListClusterCard({
  cluster,
  gpuInfo,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRefreshCluster,
}: Omit<ClusterCardProps, 'layoutMode' | 'isConnected' | 'onRenameCluster'>) {
  const loading = isClusterLoading(cluster)
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const initialLoading = loading && !hasCachedData
  const refreshing = cluster.refreshing === true

  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerColor = getProviderColor(provider)
  const themeColor = '#9333ea'

  return (
    <div
      onClick={onSelectCluster}
      className="relative p-[1px] rounded-lg cursor-pointer transition-all hover:scale-[1.01] overflow-hidden"
      style={{
        background: `linear-gradient(90deg, ${providerColor}60 0%, ${themeColor}40 100%)`,
      }}
    >
      <div className="relative glass px-4 py-3 rounded-lg h-full overflow-hidden">
        {/* Vendor watermark on right side - large with gradient fade */}
        <div
          className="absolute -right-4 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            opacity: 0.15,
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 40%)',
          }}
        >
          <CloudProviderIcon provider={provider} size={64} />
        </div>
        <div className="flex items-center gap-4">
          {/* Status indicator */}
          <div className="flex-shrink-0">
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

          {/* Provider and name */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink-0 w-48">
            <CloudProviderIcon provider={provider} size={16} />
            <span
              className="font-medium text-foreground truncate"
              title={cluster.aliases && cluster.aliases.length > 0
                ? `${cluster.context || cluster.name}\n\naka: ${cluster.aliases.join(', ')}`
                : cluster.context || cluster.name
              }
            >
              {cluster.context || cluster.name.split('/').pop()}
            </span>
            {cluster.aliases && cluster.aliases.length > 0 && (
              <span
                className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 flex-shrink-0"
                title={`Also known as: ${cluster.aliases.join(', ')}`}
              >
                +{cluster.aliases.length}
              </span>
            )}
            {cluster.isCurrent && (
              <span title="Current context"><Star className="w-3 h-3 text-primary fill-current flex-shrink-0" /></span>
            )}
          </div>

          {/* Server */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1 max-w-xs">
            <Globe className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{cluster.server?.replace(/^https?:\/\//, '') || '-'}</span>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-4 text-sm flex-shrink-0">
            <div className="flex items-center gap-1.5" title={unreachable ? 'Nodes: Cluster offline' : hasCachedData ? `Nodes: ${cluster.nodeCount} worker nodes in cluster` : 'Nodes: Loading...'}>
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue
                value={hasCachedData ? cluster.nodeCount : '-'}
                className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
              />
            </div>
            <div className="flex items-center gap-1.5" title={unreachable ? 'CPU: Cluster offline' : hasCachedData ? `CPU: ${cluster.cpuCores} total CPU cores` : 'CPU: Loading...'}>
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue
                value={hasCachedData ? cluster.cpuCores : '-'}
                className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
              />
            </div>
            <div className="flex items-center gap-1.5" title={unreachable ? 'Pods: Cluster offline' : hasCachedData ? `Pods: ${cluster.podCount} running pods` : 'Pods: Loading...'}>
              <Box className="w-3.5 h-3.5 text-muted-foreground" />
              <FlashingValue
                value={hasCachedData ? cluster.podCount : '-'}
                className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
              />
            </div>
            {gpuInfo && gpuInfo.total > 0 && !unreachable && (
              <div className="flex items-center gap-1.5" title={`GPU: ${gpuInfo.allocated}/${gpuInfo.total} GPUs allocated`}>
                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                <FlashingValue
                  value={gpuInfo.total}
                  className={refreshing ? 'text-muted-foreground' : 'text-foreground'}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {onRefreshCluster && (
              <button
                onClick={(e) => { e.stopPropagation(); onRefreshCluster() }}
                disabled={refreshing}
                className={`p-1.5 rounded transition-colors ${
                  refreshing ? 'text-blue-400' :
                  unreachable ? 'text-yellow-400 hover:bg-yellow-500/20' :
                  'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
                title={refreshing ? 'Refreshing...' : 'Refresh'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            {!permissionsLoading && !isClusterAdmin && !unreachable && (
              <span title="Limited permissions">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>
    </div>
  )
})

// Compact card (minimal, just key metrics)
const CompactClusterCard = memo(function CompactClusterCard({
  cluster,
  gpuInfo,
  onSelectCluster,
}: Omit<ClusterCardProps, 'layoutMode' | 'isConnected' | 'permissionsLoading' | 'isClusterAdmin' | 'onRenameCluster' | 'onRefreshCluster'>) {
  const unreachable = isClusterUnreachable(cluster)
  const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
  const refreshing = cluster.refreshing === true

  const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
    detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
  const providerColor = getProviderColor(provider)
  const themeColor = '#9333ea'

  return (
    <div
      onClick={onSelectCluster}
      className="relative p-[1px] rounded-lg cursor-pointer transition-all hover:scale-[1.02] overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${providerColor}60 0%, ${themeColor}40 100%)`,
      }}
    >
      <div className="relative glass p-3 rounded-lg h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
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
            className="text-xs font-medium text-foreground truncate flex-1"
            title={cluster.aliases && cluster.aliases.length > 0
              ? `${cluster.context || cluster.name}\n\naka: ${cluster.aliases.join(', ')}`
              : cluster.context || cluster.name
            }
          >
            {cluster.context || cluster.name.split('/').pop()}
          </span>
          {cluster.aliases && cluster.aliases.length > 0 && (
            <span
              className="text-[8px] px-1 rounded bg-purple-500/20 text-purple-400 flex-shrink-0"
              title={`Also known as: ${cluster.aliases.join(', ')}`}
            >
              +{cluster.aliases.length}
            </span>
          )}
          {cluster.isCurrent && (
            <Star className="w-3 h-3 text-primary fill-current flex-shrink-0" />
          )}
        </div>

        {/* Metrics in 2x2 grid */}
        <div className="grid grid-cols-2 gap-1 text-center">
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'Nodes: Cluster offline' : hasCachedData ? `Nodes: ${cluster.nodeCount} worker nodes` : 'Nodes: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.nodeCount : '-'} />
            </div>
            <div className="text-[10px] text-muted-foreground">Nodes</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'CPU: Cluster offline' : hasCachedData ? `CPU: ${cluster.cpuCores} cores` : 'CPU: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.cpuCores : '-'} />
            </div>
            <div className="text-[10px] text-muted-foreground">CPUs</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'Pods: Cluster offline' : hasCachedData ? `Pods: ${cluster.podCount} running` : 'Pods: Loading...'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData ? cluster.podCount : '-'} />
            </div>
            <div className="text-[10px] text-muted-foreground">Pods</div>
          </div>
          <div className="p-1 rounded bg-secondary/30" title={unreachable ? 'GPU: Cluster offline' : gpuInfo ? `GPU: ${gpuInfo.allocated}/${gpuInfo.total} allocated` : 'GPU: None detected'}>
            <div className={`text-sm font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
              <FlashingValue value={hasCachedData && !unreachable ? (gpuInfo?.total || 0) : '-'} />
            </div>
            <div className="text-[10px] text-muted-foreground">GPUs</div>
          </div>
        </div>
      </div>
    </div>
  )
})

export const ClusterGrid = memo(function ClusterGrid({
  clusters,
  gpuByCluster,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
  layoutMode = 'grid',
}: ClusterGridProps) {
  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 mb-6">
        <p className="text-muted-foreground">No clusters match the current filter</p>
      </div>
    )
  }

  // Grid layout classes based on mode
  const gridClasses = {
    grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    list: 'flex flex-col gap-3',
    compact: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3',
    wide: 'grid grid-cols-1 lg:grid-cols-2 gap-4',
  }

  return (
    <div className={`${gridClasses[layoutMode]} mb-6`}>
      {clusters.map((cluster) => {
        const clusterKey = cluster.name.split('/')[0]
        const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
        const clusterIsAdmin = isClusterAdmin(cluster.name)

        if (layoutMode === 'list') {
          return (
            <ListClusterCard
              key={cluster.name}
              cluster={cluster}
              gpuInfo={gpuInfo}
              permissionsLoading={permissionsLoading}
              isClusterAdmin={clusterIsAdmin}
              onSelectCluster={() => onSelectCluster(cluster.name)}
              onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
            />
          )
        }

        if (layoutMode === 'compact') {
          return (
            <CompactClusterCard
              key={cluster.name}
              cluster={cluster}
              gpuInfo={gpuInfo}
              onSelectCluster={() => onSelectCluster(cluster.name)}
            />
          )
        }

        // grid and wide use the full card
        return (
          <FullClusterCard
            key={cluster.name}
            cluster={cluster}
            gpuInfo={gpuInfo}
            isConnected={isConnected}
            permissionsLoading={permissionsLoading}
            isClusterAdmin={clusterIsAdmin}
            onSelectCluster={() => onSelectCluster(cluster.name)}
            onRenameCluster={() => onRenameCluster(cluster.name)}
            onRefreshCluster={onRefreshCluster ? () => onRefreshCluster(cluster.name) : undefined}
          />
        )
      })}
    </div>
  )
})
