import { memo } from 'react'
import { Pencil, Globe, User, ShieldAlert, ChevronRight, Star, WifiOff, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { ClusterInfo } from '../../../hooks/useMCP'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { isClusterUnreachable, isClusterLoading } from '../utils'
import { CloudProviderIcon, detectCloudProvider, getProviderLabel, getProviderColor, getConsoleUrl } from '../../ui/CloudProviderIcon'

interface GPUInfo {
  total: number
  allocated: number
}

interface ClusterGridProps {
  clusters: ClusterInfo[]
  gpuByCluster: Record<string, GPUInfo>
  isConnected: boolean
  permissionsLoading: boolean
  isClusterAdmin: (clusterName: string) => boolean
  onSelectCluster: (clusterName: string) => void
  onRenameCluster: (clusterName: string) => void
  onRefreshCluster?: (clusterName: string) => void
}

export const ClusterGrid = memo(function ClusterGrid({
  clusters,
  gpuByCluster,
  isConnected,
  permissionsLoading,
  isClusterAdmin,
  onSelectCluster,
  onRenameCluster,
  onRefreshCluster,
}: ClusterGridProps) {
  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 mb-6">
        <p className="text-muted-foreground">No clusters match the current filter</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {clusters.map((cluster) => {
        const clusterKey = cluster.name.split('/')[0]
        const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
        const loading = isClusterLoading(cluster)
        const unreachable = isClusterUnreachable(cluster)
        // Check if we have cached data (to show during refresh instead of spinners)
        const hasCachedData = cluster.nodeCount !== undefined && cluster.nodeCount > 0
        // Only show initial loading state when we don't have cached data
        const initialLoading = loading && !hasCachedData
        // Show refreshing state when manual refresh is in progress (works for all clusters including unreachable)
        const refreshing = cluster.refreshing === true

        // Use cached distribution if available, otherwise detect from name/server/namespaces/user
        const provider = (cluster.distribution as ReturnType<typeof detectCloudProvider>) ||
          detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user)
        const providerLabel = getProviderLabel(provider)
        const providerColor = getProviderColor(provider)

        // Theme accent color (purple by default)
        const themeColor = '#9333ea' // purple-500

        // Get console URL for cloud providers
        const consoleUrl = getConsoleUrl(provider, cluster.name, cluster.server)

        return (
          <div
            key={cluster.name}
            onClick={() => onSelectCluster(cluster.name)}
            className="relative p-[1px] rounded-lg cursor-pointer transition-all hover:scale-[1.02] overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${providerColor}80 0%, ${themeColor}60 100%)`,
            }}
          >
            {/* Inner card content */}
            <div className="relative glass p-5 rounded-lg h-full overflow-hidden">
            {/* Background provider icon - bottom left */}
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
                {/* Status icon: loading spinner, yellow wifi for unreachable, orange alert for unhealthy, green check for healthy */}
                {initialLoading ? (
                  <StatusIndicator status="loading" size="lg" showLabel={false} />
                ) : unreachable ? (
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center" title="Offline - check network connection">
                    <WifiOff className="w-4 h-4 text-yellow-400" />
                  </div>
                ) : cluster.healthy === false ? (
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center" title="Unhealthy - cluster has issues">
                    <AlertCircle className="w-4 h-4 text-orange-400" />
                  </div>
                ) : (
                  <StatusIndicator status="healthy" size="lg" showLabel={false} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex-shrink-0"
                      title={providerLabel}
                    >
                      <CloudProviderIcon provider={provider} size={18} />
                    </span>
                    <h3 className="font-semibold text-foreground truncate">
                      {cluster.context || cluster.name.split('/').pop()}
                    </h3>
                    {isConnected && (cluster.source === 'kubeconfig' || !cluster.source) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRenameCluster(cluster.name) }}
                        className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground flex-shrink-0"
                        title="Rename context"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {/* Server and User with icons */}
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
                  <span
                    className="flex items-center px-1.5 py-0.5 rounded bg-primary/20 text-primary"
                    title="Current kubectl context"
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </span>
                )}
                {/* Always show refresh button when handler is available */}
                {onRefreshCluster && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRefreshCluster(cluster.name)
                    }}
                    disabled={refreshing}
                    className={`flex items-center px-1.5 py-0.5 rounded transition-colors ${
                      refreshing
                        ? 'bg-blue-500/20 text-blue-400'
                        : unreachable
                        ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                    title={refreshing ? 'Refreshing...' : unreachable ? 'Retry connection' : 'Refresh cluster data'}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {!permissionsLoading && !isClusterAdmin(cluster.name) && !unreachable && (
                  <span
                    className="flex items-center px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400"
                    title="You have limited permissions on this cluster"
                    data-testid="permission-badge"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 text-center relative z-10">
              <div title={unreachable ? 'Offline' : hasCachedData && cluster.nodeCount !== undefined ? `${cluster.nodeCount} worker nodes` : 'Loading...'}>
                <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {hasCachedData && cluster.nodeCount !== undefined ? cluster.nodeCount : '-'}
                </div>
                <div className="text-xs text-muted-foreground">Nodes</div>
              </div>
              <div title={unreachable ? 'Offline' : hasCachedData && cluster.cpuCores !== undefined ? `${cluster.cpuCores} CPU cores` : 'Loading...'}>
                <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {hasCachedData && cluster.cpuCores !== undefined ? cluster.cpuCores : '-'}
                </div>
                <div className="text-xs text-muted-foreground">CPUs</div>
              </div>
              <div title={unreachable ? 'Offline' : hasCachedData && cluster.podCount !== undefined ? `${cluster.podCount} running pods` : 'Loading...'}>
                <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {hasCachedData && cluster.podCount !== undefined ? cluster.podCount : '-'}
                </div>
                <div className="text-xs text-muted-foreground">Pods</div>
              </div>
              <div title={unreachable ? 'Offline' : gpuInfo ? `${gpuInfo.allocated} allocated / ${gpuInfo.total} total GPUs` : 'No GPUs detected'}>
                <div className={`text-lg font-bold ${refreshing ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {hasCachedData ? (gpuInfo ? gpuInfo.total : 0) : '-'}
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
      })}
    </div>
  )
})
